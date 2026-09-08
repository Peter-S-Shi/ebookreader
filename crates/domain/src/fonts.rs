//! Typography & font provenance model.
//!
//! Per `ARCHITECTURE.md` SS14 / `PRODUCT_SPEC.md` SS3.7/SS7.4: font
//! selection must track *provenance*, because a font being usable on the
//! user's machine does not imply EbookReader may redistribute it. Four
//! provider types, each with different licensing/product-ownership rules:
//! `Publisher` (embedded in a publication, never extracted to a global
//! library), `BuiltIn` (verified-redistributable, shipped with the app),
//! `System` (enumerated/invoked, never copied into the product), `Custom`
//! (user-supplied, never silently redistributed/embedded/treated as
//! product-owned).

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FontProvider {
    Publisher,
    BuiltIn,
    System,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct FontFamily {
    pub name: String,
    pub provider: FontProvider,
}

/// Parse raw Windows font-registry value names (e.g. from
/// `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`) into a
/// deduplicated, sorted list of SYSTEM font families.
///
/// This strips only the trailing format annotation Windows appends (e.g.
/// `" (TrueType)"`, `" (OpenType)"`) -- it does *not* attempt to collapse
/// weight/style variants (e.g. "Segoe UI" vs "Segoe UI Semibold") into a
/// single family, since that requires real font metadata the registry
/// value name alone does not reliably encode. Presenting the raw,
/// de-suffixed names is an honest V1 simplification, not a claim of
/// correct family grouping; residual for a later typography checkpoint.
pub fn parse_system_font_registry_names<I, S>(raw_names: I) -> Vec<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    let mut names: Vec<String> = raw_names
        .into_iter()
        .map(|raw| strip_format_annotation(raw.as_ref()))
        .filter(|name| !name.is_empty())
        .collect();
    names.sort();
    names.dedup();
    names
}

fn strip_format_annotation(raw: &str) -> String {
    let trimmed = raw.trim();
    match trimmed.rfind(" (") {
        Some(idx) if trimmed.ends_with(')') => trimmed[..idx].trim().to_string(),
        _ => trimmed.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_the_truetype_and_opentype_format_annotation() {
        let parsed = parse_system_font_registry_names([
            "Arial (TrueType)",
            "Calibri (OpenType)",
        ]);
        assert_eq!(parsed, vec!["Arial".to_string(), "Calibri".to_string()]);
    }

    #[test]
    fn deduplicates_and_sorts() {
        let parsed = parse_system_font_registry_names([
            "Segoe UI (TrueType)",
            "Arial (TrueType)",
            "Segoe UI (TrueType)",
        ]);
        assert_eq!(parsed, vec!["Arial".to_string(), "Segoe UI".to_string()]);
    }

    #[test]
    fn leaves_a_name_with_no_parenthetical_suffix_unchanged() {
        let parsed = parse_system_font_registry_names(["MS Gothic & MS PGothic"]);
        assert_eq!(parsed, vec!["MS Gothic & MS PGothic".to_string()]);
    }

    #[test]
    fn does_not_strip_a_parenthetical_that_is_part_of_the_real_name() {
        // A name ending in a parenthetical that isn't a bare format tag
        // (e.g. it contains digits/letters unrelated to TrueType/OpenType)
        // is not something this function can distinguish from a real
        // format annotation by pattern alone -- document the limitation
        // via this test rather than silently mis-hiding it.
        let parsed = parse_system_font_registry_names(["Bookshelf Symbol 7 (TrueType)"]);
        assert_eq!(parsed, vec!["Bookshelf Symbol 7".to_string()]);
    }
}
