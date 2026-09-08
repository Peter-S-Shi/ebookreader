//! ReadingSession pause/resume state machine.
//!
//! Per `PRODUCT_SPEC.md`'s frozen rule "OS lock/sleep always pauses" and
//! `ARCHITECTURE.md` SS10: exact, non-heuristic pause/resume boundaries,
//! not a fixed inactivity-timeout window. This is the same state machine
//! M0's corrective-pass spike validated against a real Win32
//! `WTSRegisterSessionNotification`/`WM_POWERBROADCAST` hook
//! (`tooling/m0-evidence/scripts/m0g_session_lock_main.rs`); this module
//! is the production, TDD-covered port of that logic, decoupled from
//! Win32 so it can be unit tested without a real window. The
//! `Instant`/`Duration` boundary is passed in rather than read internally
//! (`Instant::now()`) so tests can control timing deterministically.

use std::time::{Duration, Instant};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionState {
    Active,
    PausedLocked,
    PausedSuspended,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseKind {
    Locked,
    Suspended,
}

pub struct ReadingSession {
    state: SessionState,
    pause_started_at: Option<Instant>,
    total_excluded: Duration,
}

impl ReadingSession {
    pub fn new() -> Self {
        Self {
            state: SessionState::Active,
            pause_started_at: None,
            total_excluded: Duration::ZERO,
        }
    }

    pub fn state(&self) -> SessionState {
        self.state
    }

    pub fn total_excluded(&self) -> Duration {
        self.total_excluded
    }

    /// Pause for the given reason. No-op (returns `false`) if already
    /// paused -- a second lock/suspend signal while already paused must
    /// not reset the pause-start instant.
    pub fn pause(&mut self, kind: PauseKind, now: Instant) -> bool {
        if self.state != SessionState::Active {
            return false;
        }
        self.state = match kind {
            PauseKind::Locked => SessionState::PausedLocked,
            PauseKind::Suspended => SessionState::PausedSuspended,
        };
        self.pause_started_at = Some(now);
        true
    }

    /// Resume, returning the exact excluded duration if a pause was in
    /// effect (accumulated into `total_excluded`), or `None` if already
    /// active.
    pub fn resume(&mut self, now: Instant) -> Option<Duration> {
        if self.state == SessionState::Active {
            return None;
        }
        self.state = SessionState::Active;
        let started = self.pause_started_at.take()?;
        let excluded = now.saturating_duration_since(started);
        self.total_excluded += excluded;
        Some(excluded)
    }
}

impl Default for ReadingSession {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starts_active_with_no_excluded_time() {
        let session = ReadingSession::new();
        assert_eq!(session.state(), SessionState::Active);
        assert_eq!(session.total_excluded(), Duration::ZERO);
    }

    #[test]
    fn pause_transitions_to_paused_locked_and_reports_success() {
        let mut session = ReadingSession::new();
        let changed = session.pause(PauseKind::Locked, Instant::now());
        assert!(changed);
        assert_eq!(session.state(), SessionState::PausedLocked);
    }

    #[test]
    fn a_second_pause_while_already_paused_is_a_no_op() {
        let mut session = ReadingSession::new();
        let t0 = Instant::now();
        session.pause(PauseKind::Locked, t0);

        let changed = session.pause(PauseKind::Suspended, t0 + Duration::from_secs(5));
        assert!(!changed, "must not reset pause_started_at on a redundant pause signal");
        assert_eq!(session.state(), SessionState::PausedLocked, "kind of the first pause is preserved");
    }

    #[test]
    fn resume_computes_the_exact_excluded_duration() {
        let mut session = ReadingSession::new();
        let t0 = Instant::now();
        session.pause(PauseKind::Locked, t0);

        let excluded = session.resume(t0 + Duration::from_millis(300));
        assert_eq!(excluded, Some(Duration::from_millis(300)));
        assert_eq!(session.state(), SessionState::Active);
        assert_eq!(session.total_excluded(), Duration::from_millis(300));
    }

    #[test]
    fn resume_while_already_active_is_a_no_op() {
        let mut session = ReadingSession::new();
        let result = session.resume(Instant::now());
        assert_eq!(result, None);
        assert_eq!(session.total_excluded(), Duration::ZERO);
    }

    #[test]
    fn multiple_pause_resume_cycles_accumulate_total_excluded() {
        let mut session = ReadingSession::new();
        let t0 = Instant::now();

        session.pause(PauseKind::Locked, t0);
        session.resume(t0 + Duration::from_millis(300));

        let t1 = t0 + Duration::from_secs(10);
        session.pause(PauseKind::Suspended, t1);
        session.resume(t1 + Duration::from_millis(150));

        assert_eq!(session.total_excluded(), Duration::from_millis(450));
    }

    #[test]
    fn suspended_pause_kind_also_round_trips_through_resume() {
        let mut session = ReadingSession::new();
        let t0 = Instant::now();
        session.pause(PauseKind::Suspended, t0);
        assert_eq!(session.state(), SessionState::PausedSuspended);
        let excluded = session.resume(t0 + Duration::from_secs(1));
        assert_eq!(excluded, Some(Duration::from_secs(1)));
    }
}
