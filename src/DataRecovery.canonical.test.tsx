import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataRecovery } from "./DataRecovery";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

beforeEach(() => {
  invokeMock.mockReset();
});

describe("DataRecovery Canonical Surface (ER-DATA-001; C2 Batch 3)", () => {
  it("renders canonical dataWrap layout with structured dataCards and dataAside", async () => {
    const { container } = render(<DataRecovery />);

    expect(screen.getByRole("region", { name: "Data and Recovery" })).toBeInTheDocument();

    const dataWrap = container.querySelector(".dataWrap");
    expect(dataWrap).toBeInTheDocument();

    const dataCards = container.querySelectorAll(".dataCard");
    expect(dataCards.length).toBeGreaterThanOrEqual(3);

    const dataAside = container.querySelector(".dataAside");
    expect(dataAside).toBeInTheDocument();
  });
});
