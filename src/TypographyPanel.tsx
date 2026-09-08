import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { TypographySettings } from "./typography";

interface TypographyPanelProps {
  settings: TypographySettings;
  onChange: (next: TypographySettings) => void;
  onClose: () => void;
}

// DESIGN.md SS8 "Typography UI" (`Aa`): Font (Publisher/Original,
// System Fonts) / Size / Line Height / Page Width. Recommended (BUILT_IN)
// and Custom Fonts, Margins, and CJK Font Override are not offered yet --
// BUILT_IN requires verified-redistributable font files this checkpoint
// doesn't ship (ARCHITECTURE.md SS14), and Custom import needs its own
// file-picker wiring; both are explicit residuals, not silently omitted.
export function TypographyPanel({ settings, onChange, onClose }: TypographyPanelProps) {
  const [systemFonts, setSystemFonts] = useState<string[]>([]);

  useEffect(() => {
    invoke<string[]>("list_system_fonts_command")
      .then(setSystemFonts)
      .catch(() => setSystemFonts([]));
  }, []);

  return (
    <div className="typography-panel" role="dialog" aria-label="Typography">
      <div className="typography-panel-header">
        <span>Typography</span>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      <label>
        Font
        <select
          value={settings.fontFamily ?? ""}
          onChange={(e) => onChange({ ...settings, fontFamily: e.target.value || null })}
        >
          <option value="">Publisher / Original</option>
          {systemFonts.map((name) => (
            <option key={name} value={name}>
              {name}
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
    </div>
  );
}
