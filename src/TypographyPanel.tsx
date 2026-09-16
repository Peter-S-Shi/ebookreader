import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BUILT_IN_FONTS, type TypographyFont, type TypographySettings } from "./typography";
import { parseTypographyNumericInput } from "./typographyNumericInput";

type SelectableTypographyFont = Exclude<TypographyFont, { source: "PUBLISHER" }>;

interface TypographyPanelProps {
  settings: TypographySettings;
  onChange: (next: TypographySettings) => void;
  onClose: () => void;
  showHeader?: boolean;
}

function optionValue(font: TypographyFont): string {
  if (font.source === "PUBLISHER") return "PUBLISHER";
  if (font.source === "BUILT_IN") return `BUILT_IN:${font.family}`;
  if (font.source === "SYSTEM") return `SYSTEM:${font.family}`;
  return `CUSTOM:${font.family}:${font.path}`;
}

function parseOption(value: string, systemFonts: string[], customFonts: SelectableTypographyFont[]): TypographyFont {
  if (value === "PUBLISHER") return { source: "PUBLISHER" };
  const builtIn = BUILT_IN_FONTS.find((font) => value === `BUILT_IN:${font.family}`);
  if (builtIn) return { source: "BUILT_IN", family: builtIn.family, assetPath: builtIn.assetPath };
  const system = systemFonts.find((family) => value === `SYSTEM:${family}`);
  if (system) return { source: "SYSTEM", family: system };
  const custom = customFonts.find((font) => optionValue(font) === value);
  return custom ?? { source: "PUBLISHER" };
}

function familyFromPath(path: string): string {
  const file = path.split(/[\\/]/).pop() ?? "Custom Font";
  return file.replace(/\.[^.]+$/, "") || "Custom Font";
}

// V2-M3 item 4: replaces the prior bounded range-slider model. The
// numeric input is authoritative -- no arbitrary upper cap -- with the
// only real constraint being each field's own minimum (Font Size/Line
// Height/Page Width: > 0; Margins: >= 0). Commits on blur or Enter, not
// per keystroke, so a temporary empty state while editing doesn't
// immediately wipe out the setting.
function NumericTypographyField({
  label,
  ariaLabel,
  value,
  min,
  minInclusive,
  suffix,
  onCommit,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  min: number;
  minInclusive: boolean;
  suffix: string;
  onCommit: (value: number) => void;
}) {
  const [text, setText] = useState(String(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setText(String(value));
    setInvalid(false);
  }, [value]);

  function commit() {
    const result = parseTypographyNumericInput(text, min, minInclusive);
    if (result.kind === "empty") {
      setText(String(value));
      setInvalid(false);
      return;
    }
    if (result.kind === "invalid") {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    if (result.value !== value) onCommit(result.value);
  }

  return (
    <label>
      {label}
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel ?? label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
      />
      <span>{suffix}</span>
      {invalid && (
        <p role="alert">
          Enter a number {minInclusive ? "≥" : ">"} {min}.
        </p>
      )}
    </label>
  );
}

export function TypographyPanel({ settings, onChange, onClose, showHeader = true }: TypographyPanelProps) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);
  const [customFonts, setCustomFonts] = useState<SelectableTypographyFont[]>([]);
  const allSystemFonts = [
    ...systemFonts,
    ...[settings.font, settings.cjkFont]
      .filter((font): font is TypographyFont & { source: "SYSTEM" } => font?.source === "SYSTEM")
      .map((font) => font.family),
  ].filter((font, index, fonts) => fonts.indexOf(font) === index);
  const allCustomFonts: SelectableTypographyFont[] = [
    ...customFonts,
    ...[settings.font, settings.cjkFont].filter(
      (font): font is TypographyFont & { source: "CUSTOM" } => font?.source === "CUSTOM",
    ),
  ].filter((font, index, fonts) => fonts.findIndex((other) => optionValue(other) === optionValue(font)) === index);

  useEffect(() => {
    Promise.resolve(invoke<string[]>("list_system_fonts_command"))
      .then((fonts) => setSystemFonts(Array.isArray(fonts) ? fonts : []))
      .catch(() => setSystemFonts([]));
  }, []);

  return (
    <div className="typography-panel" role="dialog" aria-label="Typography">
      {showHeader && (
        <div className="typography-panel-header">
          <span>Typography</span>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      )}

      <label>
        Font Source
        <select
          aria-label="Font Source"
          value={optionValue(settings.font)}
          onChange={(e) => onChange({ ...settings, font: parseOption(e.target.value, allSystemFonts, allCustomFonts) })}
        >
          <option value="PUBLISHER">Publisher / Original</option>
          <optgroup label="Built-in">
            {BUILT_IN_FONTS.map((font) => (
              <option key={font.family} value={`BUILT_IN:${font.family}`}>
                {font.family} (BUILT_IN)
              </option>
            ))}
          </optgroup>
          <optgroup label="System Fonts">
            {allSystemFonts.map((name) => (
              <option key={name} value={`SYSTEM:${name}`}>
                {name} (SYSTEM)
              </option>
            ))}
          </optgroup>
          <optgroup label="Custom Fonts">
            {allCustomFonts.map((font) => (
              <option key={optionValue(font)} value={optionValue(font)}>
                {font.family} (CUSTOM)
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      <button
        type="button"
        onClick={async () => {
          const picked = await open({
            multiple: false,
            filters: [{ name: "Fonts", extensions: ["ttf", "otf", "woff", "woff2"] }],
          });
          if (typeof picked !== "string") return;
          const custom: TypographyFont = { source: "CUSTOM", family: familyFromPath(picked), path: picked };
          setCustomFonts((fonts) => [...fonts.filter((font) => optionValue(font) !== optionValue(custom)), custom]);
          onChange({ ...settings, font: custom });
        }}
      >
        Import Custom Font
      </button>

      <label>
        CJK Font Override
        <select
          aria-label="CJK Font Override"
          value={settings.cjkFont ? optionValue(settings.cjkFont) : ""}
          onChange={(e) =>
            onChange({
              ...settings,
              cjkFont: e.target.value
                ? (parseOption(e.target.value, allSystemFonts, allCustomFonts) as Exclude<
                    TypographyFont,
                    { source: "PUBLISHER" }
                  >)
                : null,
            })
          }
        >
          <option value="">No CJK override</option>
          {BUILT_IN_FONTS.map((font) => (
            <option key={font.family} value={`BUILT_IN:${font.family}`}>
              {font.family} (BUILT_IN)
            </option>
          ))}
          {allSystemFonts.map((name) => (
            <option key={name} value={`SYSTEM:${name}`}>
              {name} (SYSTEM)
            </option>
          ))}
          {allCustomFonts.map((font) => (
            <option key={optionValue(font)} value={optionValue(font)}>
              {font.family} (CUSTOM)
            </option>
          ))}
        </select>
      </label>

      <NumericTypographyField
        label="Size"
        value={settings.fontSizePercent}
        min={0}
        minInclusive={false}
        suffix="%"
        onCommit={(fontSizePercent) => onChange({ ...settings, fontSizePercent })}
      />

      <NumericTypographyField
        label="Line Height"
        value={settings.lineHeight}
        min={0}
        minInclusive={false}
        suffix=""
        onCommit={(lineHeight) => onChange({ ...settings, lineHeight })}
      />

      <NumericTypographyField
        label="Page Width"
        value={settings.pageWidthCh}
        min={0}
        minInclusive={false}
        suffix="ch"
        onCommit={(pageWidthCh) => onChange({ ...settings, pageWidthCh })}
      />

      <NumericTypographyField
        label="Margins"
        value={settings.marginPercent}
        min={0}
        minInclusive={true}
        suffix="%"
        onCommit={(marginPercent) => onChange({ ...settings, marginPercent })}
      />
    </div>
  );
}
