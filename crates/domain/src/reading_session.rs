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
    /// `PRODUCT_SPEC.md` SS10 "Pause When App Is in Background" -- the app
    /// lost focus/was backgrounded, distinct from an OS-level lock/sleep.
    PausedBackground,
    /// SS10 "Auto-pause After 5 Minutes Inactivity" -- no user input for
    /// the configured window while the app stayed foregrounded/unlocked.
    PausedInactivity,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PauseKind {
    Locked,
    Suspended,
    Background,
    Inactivity,
}

pub struct ReadingSession {
    state: SessionState,
    pause_started_at: Option<Instant>,
    total_excluded: Duration,
    note_taking_started_at: Option<Instant>,
    total_note_taking: Duration,
}

impl ReadingSession {
    pub fn new() -> Self {
        Self {
            state: SessionState::Active,
            pause_started_at: None,
            total_excluded: Duration::ZERO,
            note_taking_started_at: None,
            total_note_taking: Duration::ZERO,
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
            PauseKind::Background => SessionState::PausedBackground,
            PauseKind::Inactivity => SessionState::PausedInactivity,
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

    pub fn total_note_taking(&self) -> Duration {
        self.total_note_taking
    }

    /// `PRODUCT_SPEC.md` SS10 "Count Note-taking as Reading Time":
    /// ReadingSession only stores the fact of how long note-taking lasted
    /// -- whether that duration counts toward displayed Actual Reading
    /// Time is a Settings policy decision made elsewhere, not here. No-op
    /// (returns `false`) if note-taking is already being tracked.
    pub fn start_note_taking(&mut self, now: Instant) -> bool {
        if self.note_taking_started_at.is_some() {
            return false;
        }
        self.note_taking_started_at = Some(now);
        true
    }

    /// Stop tracking note-taking, returning the exact duration (accumulated
    /// into `total_note_taking`), or `None` if it was not being tracked.
    pub fn stop_note_taking(&mut self, now: Instant) -> Option<Duration> {
        let started = self.note_taking_started_at.take()?;
        let duration = now.saturating_duration_since(started);
        self.total_note_taking += duration;
        Some(duration)
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

    #[test]
    fn background_pause_kind_round_trips_through_resume() {
        // PRODUCT_SPEC.md SS10 "Pause When App Is in Background".
        let mut session = ReadingSession::new();
        let t0 = Instant::now();
        session.pause(PauseKind::Background, t0);
        assert_eq!(session.state(), SessionState::PausedBackground);
        let excluded = session.resume(t0 + Duration::from_secs(2));
        assert_eq!(excluded, Some(Duration::from_secs(2)));
        assert_eq!(session.total_excluded(), Duration::from_secs(2));
    }

    #[test]
    fn inactivity_pause_kind_round_trips_through_resume() {
        // PRODUCT_SPEC.md SS10 "Auto-pause After 5 Minutes Inactivity".
        let mut session = ReadingSession::new();
        let t0 = Instant::now();
        session.pause(PauseKind::Inactivity, t0);
        assert_eq!(session.state(), SessionState::PausedInactivity);
        let excluded = session.resume(t0 + Duration::from_secs(3));
        assert_eq!(excluded, Some(Duration::from_secs(3)));
        assert_eq!(session.total_excluded(), Duration::from_secs(3));
    }

    #[test]
    fn starts_with_no_note_taking_time() {
        let session = ReadingSession::new();
        assert_eq!(session.total_note_taking(), Duration::ZERO);
    }

    #[test]
    fn note_taking_accumulates_across_multiple_start_stop_cycles() {
        let mut session = ReadingSession::new();
        let t0 = Instant::now();

        session.start_note_taking(t0);
        session.stop_note_taking(t0 + Duration::from_secs(5));

        let t1 = t0 + Duration::from_secs(20);
        session.start_note_taking(t1);
        let duration = session.stop_note_taking(t1 + Duration::from_secs(10));

        assert_eq!(duration, Some(Duration::from_secs(10)));
        assert_eq!(session.total_note_taking(), Duration::from_secs(15));
    }

    #[test]
    fn a_second_start_note_taking_while_already_tracking_is_a_no_op() {
        let mut session = ReadingSession::new();
        let t0 = Instant::now();
        session.start_note_taking(t0);

        let changed = session.start_note_taking(t0 + Duration::from_secs(5));
        assert!(!changed, "must not reset the note-taking start instant on a redundant start signal");

        let duration = session.stop_note_taking(t0 + Duration::from_secs(8));
        assert_eq!(duration, Some(Duration::from_secs(8)), "duration is measured from the first start, not the second");
    }

    #[test]
    fn stopping_note_taking_when_not_tracking_is_a_no_op() {
        let mut session = ReadingSession::new();
        assert_eq!(session.stop_note_taking(Instant::now()), None);
        assert_eq!(session.total_note_taking(), Duration::ZERO);
    }

    #[test]
    fn note_taking_is_tracked_independently_of_pause_state() {
        // Note-taking is its own fact, not a pause reason -- it can be
        // tracked while the session is simultaneously paused for an
        // unrelated reason (e.g. the OS locked while the user had the
        // Notebook open).
        let mut session = ReadingSession::new();
        let t0 = Instant::now();
        session.start_note_taking(t0);
        session.pause(PauseKind::Locked, t0 + Duration::from_secs(1));
        session.resume(t0 + Duration::from_secs(4));
        let note_taking_duration = session.stop_note_taking(t0 + Duration::from_secs(6));

        assert_eq!(note_taking_duration, Some(Duration::from_secs(6)));
        assert_eq!(session.total_excluded(), Duration::from_secs(3));
    }
}
