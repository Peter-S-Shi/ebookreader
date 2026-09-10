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

    fireEvent.change(screen.getByLabelText("Margins"), { target: { value: "10" } });
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, marginPercent: 10 });
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
