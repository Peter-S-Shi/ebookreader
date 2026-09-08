//! Production Win32 sleep/session-lock hook for ReadingSession.
//!
//! Per `PRODUCT_SPEC.md`'s frozen "OS lock/sleep always pauses" rule and
//! `ARCHITECTURE.md` SS10's corrected decision (M0-G): a dedicated
//! *hidden, message-only* native window registered for
//! `WTSRegisterSessionNotification` + `WM_POWERBROADCAST`, exactly as
//! validated in `tooling/m0-evidence/scripts/m0g_session_lock_main.rs`.
//! It is deliberately a separate window from Tauri's own webview window
//! (not a subclass of it) so this hook can never destabilize WebView2 --
//! it only ever receives session/power broadcast messages. Because it is
//! created on the same thread Tauri's own event loop later pumps
//! messages on, Windows' per-HWND dispatch delivers messages to this
//! window's WndProc through that same pump; no separate message loop is
//! needed.
//!
//! The actual pause/resume state machine lives in
//! `ebookreader_domain::reading_session` and is unit-tested there; this
//! module only wires real Win32 messages to it.

use ebookreader_domain::reading_session::{PauseKind, ReadingSession};
use std::cell::RefCell;
use std::sync::{Arc, Mutex};
use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::RemoteDesktop::*;
use windows::Win32::UI::WindowsAndMessaging::*;

thread_local! {
    static SESSION: RefCell<Option<Arc<Mutex<ReadingSession>>>> = const { RefCell::new(None) };
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_WTSSESSION_CHANGE => {
            let code = wparam.0 as u32;
            with_session(|session| {
                let now = std::time::Instant::now();
                match code {
                    WTS_SESSION_LOCK => {
                        session.pause(PauseKind::Locked, now);
                    }
                    WTS_SESSION_UNLOCK => {
                        session.resume(now);
                    }
                    _ => {}
                }
            });
            LRESULT(0)
        }
        WM_POWERBROADCAST => {
            let event = wparam.0 as u32;
            with_session(|session| {
                let now = std::time::Instant::now();
                match event {
                    PBT_APMSUSPEND => {
                        session.pause(PauseKind::Suspended, now);
                    }
                    PBT_APMRESUMESUSPEND | PBT_APMRESUMEAUTOMATIC => {
                        session.resume(now);
                    }
                    _ => {}
                }
            });
            LRESULT(0)
        }
        WM_DESTROY => {
            unsafe {
                WTSUnRegisterSessionNotification(hwnd).ok();
            }
            LRESULT(0)
        }
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

fn with_session(f: impl FnOnce(&mut ReadingSession)) {
    SESSION.with(|s| {
        if let Some(session) = s.borrow().as_ref() {
            if let Ok(mut session) = session.lock() {
                f(&mut session);
            }
        }
    });
}

/// Create the hidden hook window and register it for session/power
/// broadcasts. Must be called on the application's main thread, before
/// the event loop that will pump its messages starts (Tauri's `.setup()`
/// runs at exactly that point).
pub fn install(session: Arc<Mutex<ReadingSession>>) -> Result<()> {
    SESSION.with(|s| *s.borrow_mut() = Some(session));

    unsafe {
        let instance = HINSTANCE::from(GetModuleHandleW(None)?);
        let class_name = w!("EbookReaderSessionLockWindow");

        let wc = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: instance,
            lpszClassName: class_name,
            ..Default::default()
        };
        let atom = RegisterClassW(&wc);
        if atom == 0 {
            return Err(Error::from_thread());
        }

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name,
            w!("EbookReader session-lock hook (hidden)"),
            WS_OVERLAPPEDWINDOW,
            0,
            0,
            0,
            0,
            None,
            None,
            Some(instance),
            None,
        )?;

        WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION)?;
    }

    Ok(())
}
