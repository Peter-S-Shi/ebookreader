//! Application-wide user settings (`DESIGN.md` "Settings" canonical
//! surface). Per the Feature Complete corrective pass FC-C05: no settings
//! storage of any kind existed before this module -- `TypographyPanel.tsx`
//! and the sound-toggle hook were explicitly session-only, and there was no
//! table a Settings UI could persist anything into. This is a generic
//! key-value store rather than one column/table per setting: several
//! corrective tickets (update-awareness preference, reading-time policy
//! toggles, typography defaults, sound/motion, Reading Checkpoint) each add
//! their own key here instead of requiring their own schema migration.
//!
//! Values are stored as plain strings; callers own their own
//! serialization (a bare string for an enum-like choice, `"true"`/`"false"`
//! for a boolean, JSON for anything structured).

use rusqlite::{Connection, OptionalExtension};

/// Read a setting's current value, or `None` if it has never been set.
pub fn get_setting(conn: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    conn.query_row("SELECT value FROM app_setting WHERE key = ?1", [key], |row| row.get(0))
        .optional()
}

/// Set (insert or update) a setting's value.
pub fn set_setting(conn: &Connection, key: &str, value: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT INTO app_setting (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )?;
    Ok(())
}

/// Known setting keys. Grouped by the corrective ticket that owns them;
/// see `FEATURE_COMPLETE_CORRECTIVE_TICKETS.md`.
pub mod keys {
    // FC-C05: Appearance.
    pub const THEME_MODE: &str = "appearance.theme_mode"; // "light" | "dark" | "system"
    pub const ACCENT_COLOR: &str = "appearance.accent_color"; // hex string, e.g. "#3b6ea5"

    // FC-C08: Update Awareness startup-check preference.
    pub const UPDATE_CHECK_ON_STARTUP: &str = "update_awareness.check_on_startup"; // "true" | "false"

    // FC-A06: PRODUCT_SPEC.md SS10's small Actual Reading Time policy
    // surface, all default On.
    pub const TRACK_ACTUAL_READING_TIME: &str = "actual_reading_time.track_enabled"; // "true" | "false"
    pub const PAUSE_ON_BACKGROUND: &str = "actual_reading_time.pause_on_background"; // "true" | "false"
    pub const AUTO_PAUSE_AFTER_INACTIVITY: &str = "actual_reading_time.auto_pause_after_inactivity"; // "true" | "false"
    pub const COUNT_NOTE_TAKING: &str = "actual_reading_time.count_note_taking"; // "true" | "false"
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn conn() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        crate::store::run_migrations(&conn).unwrap();
        conn
    }

    #[test]
    fn an_unset_key_returns_none() {
        let conn = conn();
        assert_eq!(get_setting(&conn, keys::THEME_MODE).unwrap(), None);
    }

    #[test]
    fn set_then_get_round_trips() {
        let conn = conn();
        set_setting(&conn, keys::THEME_MODE, "dark").unwrap();
        assert_eq!(get_setting(&conn, keys::THEME_MODE).unwrap(), Some("dark".to_string()));
    }

    #[test]
    fn setting_again_updates_in_place_rather_than_erroring() {
        let conn = conn();
        set_setting(&conn, keys::ACCENT_COLOR, "#111111").unwrap();
        set_setting(&conn, keys::ACCENT_COLOR, "#222222").unwrap();
        assert_eq!(get_setting(&conn, keys::ACCENT_COLOR).unwrap(), Some("#222222".to_string()));
    }

    #[test]
    fn distinct_keys_do_not_collide() {
        let conn = conn();
        set_setting(&conn, keys::THEME_MODE, "dark").unwrap();
        set_setting(&conn, keys::ACCENT_COLOR, "#3b6ea5").unwrap();
        assert_eq!(get_setting(&conn, keys::THEME_MODE).unwrap(), Some("dark".to_string()));
        assert_eq!(get_setting(&conn, keys::ACCENT_COLOR).unwrap(), Some("#3b6ea5".to_string()));
    }
}
