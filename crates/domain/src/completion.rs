//! Progress, Completion, and Re-reading (`PRODUCT_SPEC.md` SS8).
//!
//! Formula (unchanged since V1): `Cumulative Reading % = completed_read_count
//! × 100 + active_pass_progress` (`active_pass_progress = 0` when no active
//! read exists). Reaching the final page (SS8.1) increments the
//! completed-read count and closes the active read; the user is then
//! prompted to start the next read or stay at the completed value.
//! `completed_read_count × 100` is permanent, irreversible historical
//! credit -- ordinary navigation never decreases it.
//!
//! V2-M3 current-position semantics (supersedes V1's SS8.2 "no rereading
//! inference"): while a read is active, `active_pass_progress` is the
//! user's *current* position, not the furthest point ever reached, so it
//! can move both forward and backward through ordinary navigation
//! (Previous/Next, TOC/search jumps, etc.). V1 instead tracked the
//! furthest point monotonically via a `.max()` comparison, so backtracking
//! could never reduce it; that comparison has been removed.

#[derive(Debug, Clone, Copy, PartialEq, serde::Serialize)]
pub struct ReadingProgress {
    completed_read_count: u32,
    active_read_in_progress: bool,
    /// 0-100. Only meaningful while `active_read_in_progress`; SS8.3
    /// forces this to 0 for the cumulative calculation otherwise.
    active_pass_progress: f64,
}

impl ReadingProgress {
    /// A freshly-imported, never-opened Book: no completed reads, and its
    /// first read is implicitly active at 0% (SS4.11: "an active-read
    /// progress state from 0-100 when a new read is in progress").
    pub fn new() -> Self {
        Self {
            completed_read_count: 0,
            active_read_in_progress: true,
            active_pass_progress: 0.0,
        }
    }

    pub fn completed_read_count(&self) -> u32 {
        self.completed_read_count
    }

    pub fn active_read_in_progress(&self) -> bool {
        self.active_read_in_progress
    }

    pub fn active_pass_progress(&self) -> f64 {
        self.active_pass_progress
    }

    /// SS8.3's frozen formula.
    pub fn cumulative_percent(&self) -> f64 {
        let progress_for_calc = if self.active_read_in_progress { self.active_pass_progress } else { 0.0 };
        self.completed_read_count as f64 * 100.0 + progress_for_calc
    }

    /// V2-M3: current-position semantics within the active read. Sets the
    /// active-read progress to wherever the user currently is -- forward
    /// or backward -- via Previous/Next, TOC/search jumps, or any other
    /// navigation. Superseded V1 behavior (`.max()` against the furthest
    /// point ever reached, so backtracking could never move this value
    /// down) per an explicit product decision to replace "furthest point
    /// reached" with "current position." A no-op if no read is currently
    /// active (SS8.1 "If No: no new active read exists").
    pub fn advance_active_progress(&mut self, progress: f64) {
        if !self.active_read_in_progress {
            return;
        }
        self.active_pass_progress = progress.clamp(0.0, 100.0);
    }

    /// SS8.1: reaching the final page. Increments completed_read_count and
    /// closes the active read (UI stays at 100% -- i.e. cumulative_percent
    /// reflects the now-higher completed_read_count -- until/unless the
    /// caller starts the next read).
    pub fn complete_current_read(&mut self) {
        self.completed_read_count += 1;
        self.active_read_in_progress = false;
        self.active_pass_progress = 0.0;
    }

    /// SS8.1 "If Yes": start the next read; active progress resets to 0%.
    pub fn start_next_read(&mut self) {
        self.active_read_in_progress = true;
        self.active_pass_progress = 0.0;
    }

    /// SS8.4 manual completed-read override: set to any count, clear
    /// active-read progress, never touch ReadingSession/Actual Reading
    /// Time history (those live elsewhere and are untouched by this
    /// call -- this type has no knowledge of them, which is itself the
    /// enforcement: there is nothing here that could fabricate them).
    pub fn manual_override(&mut self, completed_read_count: u32) {
        self.completed_read_count = completed_read_count;
        self.active_read_in_progress = false;
        self.active_pass_progress = 0.0;
    }
}

impl Default for ReadingProgress {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_new_book_has_zero_completed_reads_and_an_active_read_at_zero_percent() {
        let progress = ReadingProgress::new();
        assert_eq!(progress.completed_read_count(), 0);
        assert!(progress.active_read_in_progress());
        assert_eq!(progress.cumulative_percent(), 0.0);
    }

    #[test]
    fn advancing_active_progress_updates_cumulative_percent() {
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(42.0);
        assert_eq!(progress.cumulative_percent(), 42.0);
    }

    #[test]
    fn backtracking_to_an_earlier_point_reduces_active_progress_v2_m3_current_position_semantics() {
        // V2-M3 replaces V1's monotonic "furthest point reached" semantics
        // (the prior test this replaces asserted the opposite) with
        // current-position semantics: active-read progress is wherever the
        // user currently is, and may move backward, per the spec example
        // "first read reaches 68%, user returns to 31%, exits -> 31%."
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(68.0);
        progress.advance_active_progress(31.0); // user navigated back to an earlier point

        assert_eq!(
            progress.active_pass_progress(),
            31.0,
            "active-read progress reflects the current position, not the furthest point ever reached"
        );
        assert_eq!(progress.cumulative_percent(), 31.0);
    }

    #[test]
    fn completing_a_read_increments_the_count_and_closes_the_active_read() {
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(100.0);
        progress.complete_current_read();

        assert_eq!(progress.completed_read_count(), 1);
        assert!(!progress.active_read_in_progress());
        assert_eq!(progress.cumulative_percent(), 100.0, "SS8.3: active_pass_progress forced to 0 when no active read exists");
    }

    #[test]
    fn declining_to_start_the_next_read_keeps_cumulative_percent_at_the_completed_value() {
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(100.0);
        progress.complete_current_read();

        // "If No: no new active read exists; UI remains at 100%."
        assert_eq!(progress.cumulative_percent(), 100.0);

        // Any further advance_active_progress calls are ignored -- no read is active.
        progress.advance_active_progress(50.0);
        assert_eq!(progress.cumulative_percent(), 100.0);
    }

    #[test]
    fn starting_the_next_read_resets_active_progress_to_zero_and_recursion_accumulates() {
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(100.0);
        progress.complete_current_read();
        progress.start_next_read();

        assert_eq!(progress.cumulative_percent(), 100.0, "completed_read_count(1) * 100 + 0");

        progress.advance_active_progress(30.0);
        assert_eq!(progress.cumulative_percent(), 130.0);
    }

    #[test]
    fn manual_override_sets_the_count_and_clears_active_progress_ss8_4() {
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(75.0);

        progress.manual_override(3);

        assert_eq!(progress.completed_read_count(), 3);
        assert!(!progress.active_read_in_progress());
        assert_eq!(progress.cumulative_percent(), 300.0);
    }

    #[test]
    fn manual_override_to_zero_reads_as_not_started() {
        let mut progress = ReadingProgress::new();
        progress.advance_active_progress(50.0);
        progress.complete_current_read();

        progress.manual_override(0);

        assert_eq!(progress.completed_read_count(), 0);
        assert_eq!(progress.cumulative_percent(), 0.0);
    }
}
