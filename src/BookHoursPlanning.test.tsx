import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { BookHoursPlanning, type BookHoursOverviewDTO } from "./BookHoursPlanning";

const { invokeMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
  confirm: vi.fn(),
}));

beforeEach(() => {
  invokeMock.mockReset();
  vi.restoreAllMocks();
});

const mockPopulatedOverview: BookHoursOverviewDTO = {
  total_planned_hours: 164.2,
  total_current_hours: 79.4,
  global_coverage: {
    calculated_books: 11,
    uncalculated_books: 2,
    total_books: 13,
  },
  profiles: [
    {
      profile_id: "p-textbook",
      profile_name: "Textbook",
      difficulty_multiplier: 2.4,
      is_default: false,
      total_planned_hours: 88.0,
      total_current_hours: 34.8,
      coverage: { calculated_books: 4, uncalculated_books: 0, total_books: 4 },
    },
    {
      profile_id: "p-novel",
      profile_name: "Novel",
      difficulty_multiplier: 1.0,
      is_default: true,
      total_planned_hours: 38.4,
      total_current_hours: 25.6,
      coverage: { calculated_books: 4, uncalculated_books: 0, total_books: 4 },
    },
  ],
  collections: [
    {
      collection_id: "c-semester",
      collection_name: "Semester Reading",
      total_planned_hours: 74.2,
      total_current_hours: 28.1,
      coverage: { calculated_books: 5, uncalculated_books: 0, total_books: 5 },
    },
    {
      collection_id: "c-interest",
      collection_name: "Interest",
      total_planned_hours: 61.6,
      total_current_hours: 38.7,
      coverage: { calculated_books: 5, uncalculated_books: 1, total_books: 6 },
    },
  ],
  books: [
    {
      book_id: "b-1",
      title: "Introduction to Psychology",
      profile_id: "p-textbook",
      profile_name: "Textbook",
      quantity: 720,
      unit: "pages",
      speed_override: 50,
      cumulative_percent: 36,
      calculation: {
        planned_book_hours: 34.56,
        current_book_hours: 12.44,
        cumulative_percent: 36,
        baseline_speed: 50,
        difficulty_multiplier: 2.4,
      },
    },
    {
      book_id: "b-2",
      title: "Untitled Archive Scan",
      profile_id: "p-textbook",
      profile_name: "Textbook",
      quantity: null,
      unit: "pages",
      speed_override: null,
      cumulative_percent: 18,
      calculation: null,
    },
  ],
};

const mockEmptyOverview: BookHoursOverviewDTO = {
  total_planned_hours: 0.0,
  total_current_hours: 0.0,
  global_coverage: {
    calculated_books: 0,
    uncalculated_books: 0,
    total_books: 0,
  },
  profiles: [],
  collections: [],
  books: [],
};

describe("Book Hours Planning — Frontend Foundation & Overview (BH-3A)", () => {
  it("navigates from Data workspace Book Data card to Book Hours Planning and back", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_library_command") return [];
      if (cmd === "list_collections_command") return [];
      if (cmd === "get_book_hours_overview_command") return mockPopulatedOverview;
      if (cmd === "get_setting_command") return null;
      return undefined;
    });

    render(<App />);

    // Navigate to Data
    const dataNavBtn = screen.getByRole("button", { name: /Data/i });
    await user.click(dataNavBtn);

    // Verify Data workspace is shown
    expect(screen.getByRole("region", { name: "Data and Recovery" })).toBeInTheDocument();

    // Verify Book Hours Planning entry exists in Book Data section
    const bookDataRegion = screen.getByRole("region", { name: "Book Data" });
    expect(bookDataRegion).toBeInTheDocument();
    const openBtn = screen.getByRole("button", { name: "Open" });
    expect(openBtn).toBeInTheDocument();

    // Click Open to navigate into Book Hours Planning
    await user.click(openBtn);

    // Book Hours Planning shell is mounted
    expect(await screen.findByRole("region", { name: "Book Hours Planning" })).toBeInTheDocument();
    expect(screen.getByText("What are Book Hours?")).toBeInTheDocument();

    // Back button returns to Data
    const backBtn = screen.getByRole("button", { name: "Back to Data" });
    await user.click(backBtn);

    expect(await screen.findByRole("region", { name: "Data and Recovery" })).toBeInTheDocument();
  });

  it("renders real Overview DTO metrics, profiles summary, collections summary, and semantic notes", async () => {
    invokeMock.mockResolvedValueOnce(mockPopulatedOverview);

    const onBack = vi.fn();
    render(<BookHoursPlanning onBack={onBack} />);

    // Wait for overview data to load
    await screen.findByText("What are Book Hours?");

    // Verify metrics grid
    expect(screen.getByText("164.2h")).toBeInTheDocument();
    expect(screen.getByText("Across 11 calculated Books.")).toBeInTheDocument();
    expect(screen.getByText("79.4h")).toBeInTheDocument();
    expect(screen.getByText("Completed-equivalent Book Hours from unchanged reading progress.")).toBeInTheDocument();
    // Library progress = average reading progress across library books = (36 + 18) / 2 = 27%
    expect(screen.getByText("27%")).toBeInTheDocument();
    expect(screen.getByText("11 / 13")).toBeInTheDocument();
    expect(screen.getByText("2 Books are excluded from Book Hours totals until configured.")).toBeInTheDocument();

    // Verify Summary by Profile table
    const profileTable = screen.getByRole("table", { name: "Summary by Profile" });
    expect(profileTable).toBeInTheDocument();
    expect(screen.getByText("Textbook")).toBeInTheDocument();
    expect(screen.getByText("Novel")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument(); // Default badge for Novel
    expect(screen.getByText("88.0h")).toBeInTheDocument();
    expect(screen.getByText("38.4h")).toBeInTheDocument();

    // Verify Summary by Collection table
    const collectionTable = screen.getByRole("table", { name: "Summary by Collection" });
    expect(collectionTable).toBeInTheDocument();
    expect(screen.getByText("Semester Reading")).toBeInTheDocument();
    expect(screen.getByText("Interest")).toBeInTheDocument();
    expect(screen.getByText("74.2h")).toBeInTheDocument();
    expect(screen.getByText("61.6h")).toBeInTheDocument();
    expect(screen.getByText("5 / 6")).toBeInTheDocument();

    // Verify semantic rules and notes
    expect(
      screen.getByText(/Changing Book Hours rules can recalculate hours across the system, but it never changes how much of a Book the user has actually read/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Collection totals can overlap because the same Book may belong to more than one Collection/i),
    ).toBeInTheDocument();
  });

  it("handles calculated vs needs setup coverage states accurately in badges and metrics", async () => {
    // 1. Partial coverage scenario (2 uncalculated)
    invokeMock.mockResolvedValueOnce(mockPopulatedOverview);
    const { unmount } = render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    expect(screen.getByText("2 Books need setup")).toBeInTheDocument();
    unmount();

    // 2. Full coverage scenario (0 uncalculated)
    const allCalculatedOverview: BookHoursOverviewDTO = {
      ...mockPopulatedOverview,
      global_coverage: {
        calculated_books: 10,
        uncalculated_books: 0,
        total_books: 10,
      },
    };
    invokeMock.mockResolvedValueOnce(allCalculatedOverview);
    render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    expect(screen.getByText("All Books calculated")).toBeInTheDocument();
    expect(screen.getByText("All Books in the library are calculated.")).toBeInTheDocument();
  });

  it("renders truthful empty states when library has no books or profiles without crashing or NaN", async () => {
    invokeMock.mockResolvedValueOnce(mockEmptyOverview);
    render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    expect(screen.getAllByText("0.0h")).toHaveLength(2); // Total Planned & Current
    expect(screen.getByText("0%")).toBeInTheDocument(); // Library progress
    expect(screen.getByText("0 / 0")).toBeInTheDocument(); // Coverage
    expect(screen.getByText("No Reading Profiles created yet.")).toBeInTheDocument();
    expect(screen.getByText("No Collections created yet.")).toBeInTheDocument();
  });

  it("renders the 6-tab shell and displays inert placeholders for non-Overview tabs", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(mockPopulatedOverview);

    render(<BookHoursPlanning onBack={vi.fn()} />);
    await screen.findByText("What are Book Hours?");

    // Six tabs exist
    const tabList = screen.getByRole("tablist", { name: "Book Hours Views" });
    expect(tabList).toBeInTheDocument();
    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    const byProfileTab = screen.getByRole("tab", { name: "By Profile" });
    const byCollectionTab = screen.getByRole("tab", { name: "By Collection" });
    const booksTab = screen.getByRole("tab", { name: "Books" });
    const profilesTab = screen.getByRole("tab", { name: "Profiles" });
    const formulaTab = screen.getByRole("tab", { name: "Formula & Defaults" });

    expect(overviewTab).toHaveAttribute("aria-selected", "true");

    // Click By Profile
    await user.click(byProfileTab);
    expect(byProfileTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Inspect Book Hours breakdown and member books filtered by Reading Profile.")).toBeInTheDocument();
    expect(screen.getAllByText(/This view will be fully activated in the upcoming batch/i).length).toBeGreaterThan(0);

    // Click By Collection
    await user.click(byCollectionTab);
    expect(byCollectionTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Inspect reading workload across user-organized Collections with local coverage.")).toBeInTheDocument();

    // Click Books
    await user.click(booksTab);
    expect(booksTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Library-wide book hours list, setup status, and per-book workload configuration.")).toBeInTheDocument();

    // Click Profiles
    await user.click(profilesTab);
    expect(profilesTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Manage difficulty coefficients, profile metadata, and default profile assignments.")).toBeInTheDocument();

    // Click Formula & Defaults from topbar
    const formulaTopBtn = screen.getByRole("button", { name: "Formula & Defaults" });
    await user.click(formulaTopBtn);
    expect(formulaTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByText("Configure unit-specific baseline speeds (pages/hour, words/hour, characters/hour) and preview recalculation impact."),
    ).toBeInTheDocument();

    // Return to Overview
    await user.click(overviewTab);
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("What are Book Hours?")).toBeInTheDocument();
  });

  it("supports accessible keyboard navigation across tabs", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce(mockPopulatedOverview);

    render(<BookHoursPlanning onBack={vi.fn()} />);
    await screen.findByText("What are Book Hours?");

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    const byProfileTab = screen.getByRole("tab", { name: "By Profile" });
    const formulaTab = screen.getByRole("tab", { name: "Formula & Defaults" });

    overviewTab.focus();
    expect(overviewTab).toHaveFocus();

    // ArrowRight moves to By Profile
    await user.keyboard("{ArrowRight}");
    expect(byProfileTab).toHaveAttribute("aria-selected", "true");

    // End key moves to Formula & Defaults
    await user.keyboard("{End}");
    expect(formulaTab).toHaveAttribute("aria-selected", "true");

    // Home key moves back to Overview
    await user.keyboard("{Home}");
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
  });

  it("renders correctly and safely across Light and Dark theme configurations", async () => {
    invokeMock.mockResolvedValueOnce(mockPopulatedOverview);

    // Explicit Dark Mode simulation
    document.documentElement.setAttribute("data-theme", "dark");
    const { container, unmount } = render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    const screenEl = container.querySelector(".book-hours-screen");
    expect(screenEl).toBeInTheDocument();
    expect(container.querySelector(".stateBadge.warn")).toBeInTheDocument();
    expect(container.querySelector(".bhBadge.good")).toBeInTheDocument();
    expect(container.querySelector(".bhBadge.warn")).toBeInTheDocument();
    expect(container.querySelector(".bhBadge.profile")).toBeInTheDocument();
    unmount();

    // Explicit Light Mode simulation
    document.documentElement.setAttribute("data-theme", "light");
    invokeMock.mockResolvedValueOnce(mockPopulatedOverview);
    const { container: lightContainer } = render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    expect(lightContainer.querySelector(".book-hours-screen")).toBeInTheDocument();
    expect(lightContainer.querySelector(".bhCard")).toBeInTheDocument();

    // Clean up
    document.documentElement.removeAttribute("data-theme");
  });

  it("handles IPC error gracefully by displaying a warning message", async () => {
    invokeMock.mockRejectedValueOnce("database connection failed");
    render(<BookHoursPlanning onBack={vi.fn()} />);

    expect(
      await screen.findByText(/Could not load Book Hours Overview: database connection failed/i),
    ).toBeInTheDocument();
  });
});
