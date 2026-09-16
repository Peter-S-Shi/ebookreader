import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TocPanel } from "./TocPanel";

const TOC = [
  { label: "Chapter 1", href: "ch1.xhtml" },
  {
    label: "Chapter 2",
    href: "ch2.xhtml",
    subitems: [{ label: "Section 2.1", href: "ch2.xhtml#s1" }],
  },
];

describe("TocPanel", () => {
  it("renders top-level and nested entries", () => {
    render(<TocPanel toc={TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Chapter 1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chapter 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Section 2.1" })).toBeInTheDocument();
  });

  it("calls onNavigate with the entry's href when clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<TocPanel toc={TOC} onNavigate={onNavigate} onClose={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Section 2.1" }));

    expect(onNavigate).toHaveBeenCalledWith("ch2.xhtml#s1");
  });

  it("calls onClose when Close is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<TocPanel toc={TOC} onNavigate={vi.fn()} onClose={onClose} />);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalled();
  });

  describe("hierarchical collapse/expand (V2-M2)", () => {
    it("shows an expand/collapse toggle for a parent entry with subitems, but not for a leaf entry", () => {
      render(<TocPanel toc={TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Collapse Chapter 2" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^(Collapse|Expand) Chapter 1$/ })).not.toBeInTheDocument();
    });

    it("starts fully expanded: nested entries are visible without any interaction", () => {
      render(<TocPanel toc={TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      expect(screen.getByRole("button", { name: "Section 2.1" })).toBeInTheDocument();
    });

    it("collapsing a parent hides its children, and expanding it again shows them", async () => {
      const user = userEvent.setup();
      render(<TocPanel toc={TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Collapse Chapter 2" }));
      expect(screen.queryByRole("button", { name: "Section 2.1" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chapter 2" })).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Expand Chapter 2" }));
      expect(screen.getByRole("button", { name: "Section 2.1" })).toBeInTheDocument();
    });

    it("still navigates when a parent entry's own label is clicked, collapsed or not", async () => {
      const user = userEvent.setup();
      const onNavigate = vi.fn();
      render(<TocPanel toc={TOC} onNavigate={onNavigate} onClose={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: "Collapse Chapter 2" }));
      await user.click(screen.getByRole("button", { name: "Chapter 2" }));

      expect(onNavigate).toHaveBeenCalledWith("ch2.xhtml");
    });
  });
});
