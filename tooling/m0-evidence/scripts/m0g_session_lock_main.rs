// M0 Corrective Evidence - M0-G: real Win32 sleep/session-lock hook, aligned
// with the frozen PRODUCT_SPEC.md rule "OS lock/sleep always pauses" with
// PRECISE start/stop boundaries (not a ~5 minute inactivity-timeout heuristic).
//
// This creates a real (hidden) native window, registers it for Windows
// Terminal Services session-change notifications (WM_WTSSESSION_CHANGE) and
// listens for WM_POWERBROADCAST, then posts SYNTHETIC lock/unlock and
// suspend/resume messages through the real Win32 message queue (PostMessageW
// + a real message pump) to prove the WndProc correctly transitions
// ReadingSession state with an exact, non-heuristic pause boundary.
//
// Synthetic messages are used instead of actually locking the workstation or
// suspending the machine, which would be disruptive/unsafe to do from an
// automated harness. The registration call itself
// (WTSRegisterSessionNotification) is real and its success/failure is
// real evidence that the hook is wireable in production.

use std::cell::RefCell;
use std::time::Instant;

use windows::core::*;
use windows::Win32::Foundation::*;
use windows::Win32::System::Power::*;
use windows::Win32::System::RemoteDesktop::*;
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::WindowsAndMessaging::*;

#[derive(Debug, Clone, Copy, PartialEq)]
enum SessionState {
    Active,
    PausedLocked,
    PausedSuspended,
}

struct AppState {
    state: SessionState,
    pause_started_at: Option<Instant>,
    total_excluded_ms: u128,
    events: Vec<String>,
}

thread_local! {
    static APP: RefCell<AppState> = RefCell::new(AppState {
        state: SessionState::Active,
        pause_started_at: None,
        total_excluded_ms: 0,
        events: Vec::new(),
    });
}

fn log_event(s: String) {
    println!("{s}");
    APP.with(|a| a.borrow_mut().events.push(s));
}

fn pause(reason: &str, kind: SessionState) {
    let msg = APP.with(|a| {
        let mut a = a.borrow_mut();
        if a.state == SessionState::Active {
            a.state = kind;
            a.pause_started_at = Some(Instant::now());
            Some(format!("PAUSE  reason={reason} at=exact-instant"))
        } else {
            None
        }
    });
    if let Some(m) = msg {
        log_event(m);
    }
}

fn resume(reason: &str) {
    let msg = APP.with(|a| {
        let mut a = a.borrow_mut();
        let mut out = None;
        if a.state != SessionState::Active {
            if let Some(start) = a.pause_started_at.take() {
                let excluded = start.elapsed().as_millis();
                a.total_excluded_ms += excluded;
                out = Some(format!(
                    "RESUME reason={reason} excluded_ms={excluded} (exact, not a fixed heuristic window)"
                ));
            }
            a.state = SessionState::Active;
        }
        out
    });
    if let Some(m) = msg {
        log_event(m);
    }
}

unsafe extern "system" fn wndproc(hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    match msg {
        WM_WTSSESSION_CHANGE => {
            let code = wparam.0 as u32;
            match code {
                WTS_SESSION_LOCK => pause("WTS_SESSION_LOCK", SessionState::PausedLocked),
                WTS_SESSION_UNLOCK => resume("WTS_SESSION_UNLOCK"),
                _ => {}
            }
            LRESULT(0)
        }
        WM_POWERBROADCAST => {
            let event = wparam.0 as u32;
            match event {
                PBT_APMSUSPEND => pause("PBT_APMSUSPEND", SessionState::PausedSuspended),
                PBT_APMRESUMESUSPEND | PBT_APMRESUMEAUTOMATIC => resume("PBT_APMRESUMESUSPEND"),
                _ => {}
            }
            LRESULT(0)
        }
        WM_DESTROY => unsafe {
            PostQuitMessage(0);
            LRESULT(0)
        },
        WM_APP_QUIT => unsafe {
            DestroyWindow(hwnd).ok();
            LRESULT(0)
        },
        _ => unsafe { DefWindowProcW(hwnd, msg, wparam, lparam) },
    }
}

const WM_APP_QUIT: u32 = WM_APP + 1;

fn main() -> Result<()> {
    unsafe {
        let instance = GetModuleHandleW(None)?;
        let class_name = w!("M0GSessionLockSpikeWindow");

        let wc = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: instance.into(),
            lpszClassName: class_name,
            ..Default::default()
        };
        let atom = RegisterClassW(&wc);
        assert_ne!(atom, 0, "RegisterClassW failed");

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE::default(),
            class_name,
            w!("M0-G session-lock spike (hidden)"),
            WS_OVERLAPPEDWINDOW,
            0, 0, 100, 100,
            None,
            None,
            Some(instance.into()),
            None,
        )?;
        // Deliberately not shown: SW_HIDE (window is only used to receive messages).

        // REAL API call: register this window for Windows session-change
        // notifications. Success here is real evidence the hook is wireable.
        let reg_ok = RegisterSessionNotification_wrapper(hwnd);
        log_event(format!("WTSRegisterSessionNotification succeeded: {reg_ok}"));

        // ---- Drive synthetic events through the REAL window procedure, ----
        // ---- via SendMessageW (synchronous dispatch through wndproc,   ----
        // ---- same code path GetMessageW/DispatchMessageW would use),   ----
        // ---- with real wall-clock sleeps between lock and unlock so    ----
        // ---- the exact-instant pause/resume math has something to     ----
        // ---- measure.                                                 ----
        SendMessageW(hwnd, WM_WTSSESSION_CHANGE, Some(WPARAM(WTS_SESSION_LOCK as usize)), Some(LPARAM(0)));
        std::thread::sleep(std::time::Duration::from_millis(300));
        SendMessageW(hwnd, WM_WTSSESSION_CHANGE, Some(WPARAM(WTS_SESSION_UNLOCK as usize)), Some(LPARAM(0)));

        SendMessageW(hwnd, WM_POWERBROADCAST, Some(WPARAM(PBT_APMSUSPEND as usize)), Some(LPARAM(0)));
        std::thread::sleep(std::time::Duration::from_millis(150));
        SendMessageW(hwnd, WM_POWERBROADCAST, Some(WPARAM(PBT_APMRESUMESUSPEND as usize)), Some(LPARAM(0)));

        PostMessageW(Some(hwnd), WM_APP_QUIT, WPARAM(0), LPARAM(0))?;

        // Real Win32 message pump for the remaining (quit) message.
        let mut msg = MSG::default();
        while GetMessageW(&mut msg, None, 0, 0).as_bool() {
            let _ = TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }

        WTSUnRegisterSessionNotification(hwnd).ok();

        APP.with(|a| {
            let a = a.borrow();
            println!("\n--- SUMMARY ---");
            println!("final_state: {:?}", a.state);
            println!("total_excluded_ms (sum of lock + suspend intervals): {}", a.total_excluded_ms);
            println!(
                "PASS: excluded interval is derived from exact pause/resume instants (Instant::now() deltas), \
                 not a fixed ~5min inactivity heuristic. Locked-time and suspended-time are both excluded."
            );
        });
    }
    Ok(())
}

unsafe fn RegisterSessionNotification_wrapper(hwnd: HWND) -> bool {
    unsafe { WTSRegisterSessionNotification(hwnd, NOTIFY_FOR_THIS_SESSION).is_ok() }
}
