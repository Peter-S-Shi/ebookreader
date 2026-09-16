import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TypographyPanel } from "./TypographyPanel";
import { DEFAULT_TYPOGRAPHY, type TypographySettings } from "./typography";

const { invokeMock, openMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
});

describe("TypographyPanel", () => {
  it("labels Publisher/System provenance and applies a CJK override plus margins", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    invokeMock.mockResolvedValueOnce(["Georgia", "Microsoft YaHei"]);
    const settings: TypographySettings = { ...DEFAULT_TYPOGRAPHY, marginPercent: 6 };

    render(<TypographyPanel settings={settings} onChange={onChange} onClose={vi.fn()} />);

    expect(await screen.findAllByRole("option", { name: "Georgia (SYSTEM)" })).toHaveLength(2);
    expect(screen.getByRole("option", { name: "Publisher / Original" })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("CJK Font Override"), "SYSTEM:Microsoft YaHei");
    expect(onChange).toHaveBeenCalledWith({
      ...settings,
      cjkFont: { source: "SYSTEM", family: "Microsoft YaHei" },
    });

    // V2-M3 item 4: free numeric input, deferred commit (blur/Enter) --
    // not a live-per-keystroke range slider anymore.
    const marginsInput = screen.getByLabelText("Margins");
    fireEvent.change(marginsInput, { target: { value: "10" } });
    fireEvent.blur(marginsInput);
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, marginPercent: 10 });
  });

  describe("free numeric inputs (V2-M3 item 4)", () => {
    it("accepts a decimal value with no arbitrary upper cap, and applies it on blur", async () => {
      invokeMock.mockResolvedValueOnce([]);
      const onChange = vi.fn();
      render(<TypographyPanel settings={DEFAULT_TYPOGRAPHY} onChange={onChange} onClose={vi.fn()} />);
      const sizeInput = await screen.findByLabelText("Size");

      fireEvent.change(sizeInput, { target: { value: "9999.5" } });
      fireEvent.blur(sizeInput);

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 9999.5 });
    });

    it("rejects a non-positive Font Size with inline feedback, and does not apply it", async () => {
      invokeMock.mockResolvedValueOnce([]);
      const onChange = vi.fn();
      render(<TypographyPanel settings={DEFAULT_TYPOGRAPHY} onChange={onChange} onClose={vi.fn()} />);
      const sizeInput = await screen.findByLabelText("Size");

      fireEvent.change(sizeInput, { target: { value: "0" } });
      fireEvent.blur(sizeInput);

      expect(await screen.findByRole("alert")).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    });

    it("rejects letters/symbols/NaN/Infinity with inline feedback, and does not apply them", async () => {
      invokeMock.mockResolvedValueOnce([]);
      const onChange = vi.fn();
      render(<TypographyPanel settings={DEFAULT_TYPOGRAPHY} onChange={onChange} onClose={vi.fn()} />);
      const lineHeightInput = await screen.findByLabelText("Line Height");

      for (const bad of ["abc", "NaN", "Infinity", "#2"]) {
        fireEvent.change(lineHeightInput, { target: { value: bad } });
        fireEvent.blur(lineHeightInput);
        expect(await screen.findByRole("alert")).toBeInTheDocument();
      }
      expect(onChange).not.toHaveBeenCalled();
    });

    it("allows a temporary empty state while editing, and restores the previous valid value on empty submission", async () => {
      invokeMock.mockResolvedValueOnce([]);
      const onChange = vi.fn();
      render(<TypographyPanel settings={{ ...DEFAULT_TYPOGRAPHY, pageWidthCh: 64 }} onChange={onChange} onClose={vi.fn()} />);
      const pageWidthInput = (await screen.findByLabelText("Page Width")) as HTMLInputElement;

      fireEvent.change(pageWidthInput, { target: { value: "" } });
      expect(pageWidthInput.value).toBe("");

      fireEvent.blur(pageWidthInput);

      expect(onChange).not.toHaveBeenCalled();
      expect(pageWidthInput.value).toBe("64");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("accepts zero for Margins (>= 0 is valid), unlike the other three fields (> 0)", async () => {
      invokeMock.mockResolvedValueOnce([]);
      const onChange = vi.fn();
      render(<TypographyPanel settings={{ ...DEFAULT_TYPOGRAPHY, marginPercent: 6 }} onChange={onChange} onClose={vi.fn()} />);
      const marginsInput = screen.getByLabelText("Margins");

      fireEvent.change(marginsInput, { target: { value: "0" } });
      fireEvent.blur(marginsInput);

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_TYPOGRAPHY, marginPercent: 0 });
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("commits on Enter as well as on blur", async () => {
      invokeMock.mockResolvedValueOnce([]);
      const onChange = vi.fn();
      render(<TypographyPanel settings={DEFAULT_TYPOGRAPHY} onChange={onChange} onClose={vi.fn()} />);
      const sizeInput = await screen.findByLabelText("Size");

      fireEvent.change(sizeInput, { target: { value: "175" } });
      fireEvent.keyDown(sizeInput, { key: "Enter" });

      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_TYPOGRAPHY, fontSizePercent: 175 });
    });
  });

  it("imports a custom local font as CUSTOM without copying it into built-in assets", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    invokeMock.mockResolvedValueOnce([]);
    openMock.mockResolvedValueOnce("C:/fonts/local-serif.otf");

    render(<TypographyPanel settings={DEFAULT_TYPOGRAPHY} onChange={onChange} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Import Custom Font" }));

    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({
        ...DEFAULT_TYPOGRAPHY,
        font: { source: "CUSTOM", family: "local-serif", path: "C:/fonts/local-serif.otf" },
      }),
    );
  });
});
