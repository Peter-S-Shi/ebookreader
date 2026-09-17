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

  describe("dynamic Expand all / Collapse all toggle", () => {
    const FLAT_TOC = [
      { label: "Chapter 1", href: "ch1.xhtml" },
      { label: "Chapter 2", href: "ch2.xhtml" },
    ];

    const MULTI_PARENT_TOC = [
      {
        label: "Part 1",
        href: "part1.xhtml",
        subitems: [
          { label: "Chapter 1.1", href: "ch1_1.xhtml" },
          { label: "Chapter 1.2", href: "ch1_2.xhtml" },
        ],
      },
      {
        label: "Part 2",
        href: "part2.xhtml",
        subitems: [{ label: "Chapter 2.1", href: "ch2_1.xhtml" }],
      },
      { label: "Epilogue", href: "epilogue.xhtml" },
    ];

    it("hides the toggle button when TOC has no collapsible parent nodes", () => {
      render(<TocPanel toc={FLAT_TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      expect(screen.queryByRole("button", { name: "Expand all" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Collapse all" })).not.toBeInTheDocument();
    });

    it("shows 'Collapse all' when all nodes are expanded, and clicking it collapses all to show 'Expand all'", async () => {
      const user = userEvent.setup();
      render(<TocPanel toc={MULTI_PARENT_TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      // Initially fully expanded -> Collapse all
      const toggleBtn = screen.getByRole("button", { name: "Collapse all" });
      expect(toggleBtn).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chapter 1.1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chapter 2.1" })).toBeInTheDocument();

      // Click Collapse all -> all parents collapsed -> text becomes Expand all
      await user.click(toggleBtn);
      expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Chapter 1.1" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Chapter 2.1" })).not.toBeInTheDocument();
    });

    it("shows 'Collapse all' in a mixed state, and clicking it collapses all", async () => {
      const user = userEvent.setup();
      render(<TocPanel toc={MULTI_PARENT_TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      // Manually collapse Part 1 only (mixed state: Part 1 collapsed, Part 2 expanded)
      await user.click(screen.getByRole("button", { name: "Collapse Part 1" }));
      expect(screen.queryByRole("button", { name: "Chapter 1.1" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chapter 2.1" })).toBeInTheDocument();

      // In mixed state, button should still be Collapse all
      const toggleBtn = screen.getByRole("button", { name: "Collapse all" });
      expect(toggleBtn).toBeInTheDocument();

      // Click Collapse all -> now all are collapsed
      await user.click(toggleBtn);
      expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Chapter 1.1" })).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Chapter 2.1" })).not.toBeInTheDocument();
    });

    it("clicking 'Expand all' when all parents are collapsed expands all nodes", async () => {
      const user = userEvent.setup();
      render(<TocPanel toc={MULTI_PARENT_TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      // Collapse all first
      await user.click(screen.getByRole("button", { name: "Collapse all" }));
      const expandBtn = screen.getByRole("button", { name: "Expand all" });

      // Click Expand all -> all parents expanded -> text becomes Collapse all
      await user.click(expandBtn);
      expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chapter 1.1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Chapter 2.1" })).toBeInTheDocument();
    });

    it("recalculates button text when individual parent nodes are manually toggled", async () => {
      const user = userEvent.setup();
      render(<TocPanel toc={MULTI_PARENT_TOC} onNavigate={vi.fn()} onClose={vi.fn()} />);

      // Collapse all
      await user.click(screen.getByRole("button", { name: "Collapse all" }));
      expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();

      // Manually expand Part 2 only -> switches from all-collapsed to mixed -> Collapse all
      await user.click(screen.getByRole("button", { name: "Expand Part 2" }));
      expect(screen.getByRole("button", { name: "Collapse all" })).toBeInTheDocument();

      // Manually collapse Part 2 again -> back to all-collapsed -> Expand all
      await user.click(screen.getByRole("button", { name: "Collapse Part 2" }));
      expect(screen.getByRole("button", { name: "Expand all" })).toBeInTheDocument();
    });
  });
});
