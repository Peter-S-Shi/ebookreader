import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { BUILT_IN_FONTS, type TypographyFont, type TypographySettings } from "./typography";

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

      <label>
        Size
        <input
          type="range"
          min={70}
          max={200}
          step={10}
          value={settings.fontSizePercent}
          onChange={(e) => onChange({ ...settings, fontSizePercent: Number(e.target.value) })}
        />
        <span>{settings.fontSizePercent}%</span>
      </label>

      <label>
        Line Height
        <input
          type="range"
          min={1}
          max={2.5}
          step={0.1}
          value={settings.lineHeight}
          onChange={(e) => onChange({ ...settings, lineHeight: Number(e.target.value) })}
        />
        <span>{settings.lineHeight.toFixed(1)}</span>
      </label>

      <label>
        Page Width
        <input
          type="range"
          min={40}
          max={100}
          step={5}
          value={settings.pageWidthCh}
          onChange={(e) => onChange({ ...settings, pageWidthCh: Number(e.target.value) })}
        />
        <span>{settings.pageWidthCh}ch</span>
      </label>

      <label>
        Margins
        <input
          aria-label="Margins"
          type="range"
          min={0}
          max={20}
          step={1}
          value={settings.marginPercent}
          onChange={(e) => onChange({ ...settings, marginPercent: Number(e.target.value) })}
        />
        <span>{settings.marginPercent}%</span>
      </label>
    </div>
  );
}
