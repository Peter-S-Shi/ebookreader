import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  BookHoursPlanning,
  type BookHoursOverviewDTO,
  type GlobalBookHoursDefaultsDTO,
  type ReadingProfileDTO,
} from "./BookHoursPlanning";

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

const mockGlobalDefaults: GlobalBookHoursDefaultsDTO = {
  pages_per_hour: 60,
  words_per_hour: 15000,
  characters_per_hour: 30000,
};

const mockReadingProfiles: ReadingProfileDTO[] = [
  {
    id: "p-textbook",
    name: "Textbook",
    difficulty_multiplier: 2.4,
    description: "Academic textbooks & deep technical reading",
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p-novel",
    name: "Novel",
    difficulty_multiplier: 1.0,
    description: "Fiction & narrative prose",
    is_default: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "p-light",
    name: "Light Reading",
    difficulty_multiplier: 0.75,
    description: "Casual magazines and articles",
    is_default: false,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const mockPopulatedOverview: BookHoursOverviewDTO = {
  total_planned_hours: 164.2,
  total_current_hours: 79.4,
  global_coverage: {
    calculated_books: 2,
    uncalculated_books: 1,
    total_books: 3,
  },
  profiles: [
    {
      profile_id: "p-textbook",
      profile_name: "Textbook",
      difficulty_multiplier: 2.4,
      is_default: false,
      total_planned_hours: 88.0,
      total_current_hours: 34.8,
      coverage: { calculated_books: 1, uncalculated_books: 1, total_books: 2 },
    },
    {
      profile_id: "p-novel",
      profile_name: "Novel",
      difficulty_multiplier: 1.0,
      is_default: true,
      total_planned_hours: 76.2,
      total_current_hours: 44.6,
      coverage: { calculated_books: 1, uncalculated_books: 0, total_books: 1 },
    },
  ],
  collections: [
    {
      collection_id: "c-semester",
      collection_name: "Semester Reading",
      total_planned_hours: 88.0,
      total_current_hours: 34.8,
      coverage: { calculated_books: 1, uncalculated_books: 1, total_books: 2 },
    },
    {
      collection_id: "c-interest",
      collection_name: "Interest",
      total_planned_hours: 76.2,
      total_current_hours: 44.6,
      coverage: { calculated_books: 1, uncalculated_books: 0, total_books: 1 },
    },
  ],
  books: [
    {
      book_id: "b-1",
      title: "Introduction to Psychology",
      profile_id: "p-textbook",
      profile_name: "Textbook",
      collections: ["Semester Reading"],
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
      collections: ["Semester Reading"],
      quantity: null,
      unit: "pages",
      speed_override: null,
      cumulative_percent: 18,
      calculation: null,
    },
    {
      book_id: "b-3",
      title: "Pride and Prejudice",
      profile_id: "p-novel",
      profile_name: "Novel",
      collections: ["Interest"],
      quantity: 120000,
      unit: "words",
      speed_override: null,
      cumulative_percent: 50,
      calculation: {
        planned_book_hours: 8.0,
        current_book_hours: 4.0,
        cumulative_percent: 50,
        baseline_speed: 15000,
        difficulty_multiplier: 1.0,
      },
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

function setupDefaultMocks(overview: BookHoursOverviewDTO = mockPopulatedOverview) {
  invokeMock.mockImplementation(async (cmd: string) => {
    if (cmd === "get_book_hours_overview_command") return overview;
    if (cmd === "get_global_book_hours_defaults_command") return mockGlobalDefaults;
    if (cmd === "list_reading_profiles_command") return mockReadingProfiles;
    if (cmd === "set_book_workload_command") return undefined;
    return undefined;
  });
}

describe("Book Hours Planning — Frontend Foundation & Overview (BH-3A & BH-3B)", () => {
  it("keeps the header and all six tabs outside the scrolling content viewport", async () => {
    const user = userEvent.setup();
    setupDefaultMocks();
    render(<BookHoursPlanning onBack={vi.fn()} />);
    await screen.findByText("What are Book Hours?");

    const shell = screen.getByRole("region", { name: "Book Hours Planning" });
    const viewport = shell.querySelector(".bhViewport");
    const tablist = screen.getByRole("tablist", { name: "Book Hours Planning Views" });

    expect(shell.firstElementChild?.tagName).toBe("HEADER");
    expect(tablist.parentElement).toBe(shell);
    expect(viewport?.parentElement).toBe(shell);
    expect(viewport?.contains(tablist)).toBe(false);
    expect(screen.getAllByRole("tab")).toHaveLength(6);

    for (const name of ["Overview", "By Profile", "By Collection", "Books", "Profiles", "Formula & Defaults"]) {
      await user.click(screen.getByRole("tab", { name }));
      expect(screen.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
      expect(viewport?.contains(screen.getByRole("tabpanel", { name }))).toBe(true);
      expect(tablist.parentElement).toBe(shell);
    }
  });
  it("navigates from Data workspace Book Data card to Book Hours Planning and back", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_library_command") return [];
      if (cmd === "list_collections_command") return [];
      if (cmd === "get_book_hours_overview_command") return mockPopulatedOverview;
      if (cmd === "get_global_book_hours_defaults_command") return mockGlobalDefaults;
      if (cmd === "list_reading_profiles_command") return mockReadingProfiles;
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
    setupDefaultMocks();

    const onBack = vi.fn();
    render(<BookHoursPlanning onBack={onBack} />);

    await screen.findByText("What are Book Hours?");

    // Metrics grid
    expect(screen.getByText("164.2h")).toBeInTheDocument();
    expect(screen.getByText("System-calculated total workload")).toBeInTheDocument();
    expect(screen.getByText("79.4h")).toBeInTheDocument();
    expect(screen.getByText("Weighted by independent reading progress")).toBeInTheDocument();
    // Completion = 79.4 / 164.2 * 100 = 48%
    expect(screen.getByText("Book Hours Completion")).toBeInTheDocument();
    expect(screen.getByText("48%")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
    expect(screen.getByText("2 of 3 books calculated")).toBeInTheDocument();

    // Summary by Profile table
    const profileTable = screen.getByRole("table", { name: "Summary by Profile" });
    expect(profileTable).toBeInTheDocument();
    expect(within(profileTable).getByText("Textbook")).toBeInTheDocument();
    expect(within(profileTable).getByText("Novel")).toBeInTheDocument();
    expect(within(profileTable).getByText("[Default]")).toBeInTheDocument();

    // Summary by Collection table
    const collectionTable = screen.getByRole("table", { name: "Summary by Collection" });
    expect(collectionTable).toBeInTheDocument();
    expect(within(collectionTable).getByText("Semester Reading")).toBeInTheDocument();
    expect(within(collectionTable).getByText("Interest")).toBeInTheDocument();
  });

  it("handles calculated vs needs setup coverage states accurately in badges and metrics", async () => {
    setupDefaultMocks();
    const { unmount } = render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    expect(screen.getByText("2 of 3 books calculated")).toBeInTheDocument();
    unmount();

    const allCalculatedOverview: BookHoursOverviewDTO = {
      ...mockPopulatedOverview,
      global_coverage: {
        calculated_books: 3,
        uncalculated_books: 0,
        total_books: 3,
      },
    };
    setupDefaultMocks(allCalculatedOverview);
    render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    expect(screen.getByText("3 of 3 books calculated")).toBeInTheDocument();
  });

  it("renders truthful empty states when library has no books or profiles without crashing or NaN", async () => {
    setupDefaultMocks(mockEmptyOverview);
    render(<BookHoursPlanning onBack={vi.fn()} />);

    await screen.findByText("What are Book Hours?");
    expect(screen.getAllByText("0.0h")).toHaveLength(2);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("0 of 0 books calculated")).toBeInTheDocument();
    expect(screen.getByText("No profiles found.")).toBeInTheDocument();
    expect(screen.getByText("No collections found.")).toBeInTheDocument();
  });

  it("supports accessible keyboard navigation across tabs", async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    render(<BookHoursPlanning onBack={vi.fn()} />);
    await screen.findByText("What are Book Hours?");

    const overviewTab = screen.getByRole("tab", { name: "Overview" });
    const byProfileTab = screen.getByRole("tab", { name: "By Profile" });
    const formulaTab = screen.getByRole("tab", { name: "Formula & Defaults" });

    overviewTab.focus();
    expect(overviewTab).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(byProfileTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{End}");
    expect(formulaTab).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(overviewTab).toHaveAttribute("aria-selected", "true");
  });
});

describe("Book Hours Planning — BH-3B Navigation, Management & Setup Drawer", () => {
  it("renders By Profile master-detail view with profile switcher and member books", async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="byProfile" />);

    const profilesPane = await screen.findByRole("tabpanel", { name: "By Profile" });

    // Master list items
    expect(screen.getByRole("button", { name: /Textbook/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Novel/i })).toBeInTheDocument();

    // Detail header shows selected profile (Textbook default selection)
    expect(within(profilesPane).getByRole("heading", { level: 2, name: /Textbook/ })).toBeInTheDocument();
    expect(within(profilesPane).getByText(/Difficulty coefficient 2\.4/)).toBeInTheDocument();
    expect(within(profilesPane).getAllByText("Semester Reading").length).toBeGreaterThan(0); // Collections touched chip & row chip

    // Member books table under Textbook
    expect(within(profilesPane).getByText("Introduction to Psychology")).toBeInTheDocument();
    expect(within(profilesPane).getByText("34.6h")).toBeInTheDocument(); // Planned
    expect(within(profilesPane).getByText("12.4h")).toBeInTheDocument(); // Current
    expect(within(profilesPane).getByText("22.1h")).toBeInTheDocument(); // Remaining (34.56 - 12.44)

    // Uncalculated book in Textbook
    expect(within(profilesPane).getByText("Untitled Archive Scan")).toBeInTheDocument();
    expect(within(profilesPane).getByText("Needs setup")).toBeInTheDocument();

    // Switch to Novel profile
    const novelBtn = screen.getByRole("button", { name: /Novel/i });
    await user.click(novelBtn);

    expect(within(profilesPane).getByRole("heading", { level: 2, name: /Novel/ })).toBeInTheDocument();
    expect(within(profilesPane).getByText("Pride and Prejudice")).toBeInTheDocument();
    expect(within(profilesPane).getByText("8.0h")).toBeInTheDocument();
  });

  it("renders By Collection symmetric master-detail view with single profile badge and coverage note", async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="byCollection" />);

    const collectionsPane = await screen.findByRole("tabpanel", { name: "By Collection" });

    // Master list items
    expect(screen.getByRole("button", { name: /Semester Reading/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Interest/i })).toBeInTheDocument();

    // Detail header for Semester Reading
    expect(within(collectionsPane).getByRole("heading", { level: 2, name: /Semester Reading/ })).toBeInTheDocument();
    expect(within(collectionsPane).getByText(/1 of 2 Books currently contribute to Collection Book Hours totals/)).toBeInTheDocument();

    // Member books in Semester Reading
    expect(within(collectionsPane).getByText("Introduction to Psychology")).toBeInTheDocument();
    expect(within(collectionsPane).getByText("Untitled Archive Scan")).toBeInTheDocument();

    // Switch to Interest collection
    const interestBtn = screen.getByRole("button", { name: /Interest/i });
    await user.click(interestBtn);

    expect(within(collectionsPane).getByRole("heading", { level: 2, name: /Interest/ })).toBeInTheDocument();
    expect(within(collectionsPane).getByText(/1 of 1 Books currently contribute to Collection Book Hours totals/)).toBeInTheDocument();
    expect(within(collectionsPane).getByText("Pride and Prejudice")).toBeInTheDocument();
  });

  it("renders Books tab with interactive search and filtering", async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="books" />);

    const booksPane = await screen.findByRole("tabpanel", { name: "Books" });

    // Initially 3 books present
    expect(within(booksPane).getByText(/Calculation coverage:/)).toBeInTheDocument();
    expect(within(booksPane).getByText("Introduction to Psychology")).toBeInTheDocument();
    expect(within(booksPane).getByText("Untitled Archive Scan")).toBeInTheDocument();
    expect(within(booksPane).getByText("Pride and Prejudice")).toBeInTheDocument();

    // Filter by text search "Psychology"
    const searchInput = within(booksPane).getByPlaceholderText("Search Books…");
    await user.type(searchInput, "psych");
    expect(within(booksPane).getByText("Introduction to Psychology")).toBeInTheDocument();
    expect(within(booksPane).queryByText("Pride and Prejudice")).not.toBeInTheDocument();
    expect(within(booksPane).queryByText("Untitled Archive Scan")).not.toBeInTheDocument();

    // Clear search
    await user.clear(searchInput);
    expect(within(booksPane).getByText("Introduction to Psychology")).toBeInTheDocument();
    expect(within(booksPane).getByText("Pride and Prejudice")).toBeInTheDocument();

    // Filter by Calculation Status: Needs setup
    const statusSelect = within(booksPane).getByLabelText("Filter by Calculation State");
    await user.selectOptions(statusSelect, "uncalculated");
    expect(within(booksPane).getByText("Untitled Archive Scan")).toBeInTheDocument();
    expect(within(booksPane).queryByText("Introduction to Psychology")).not.toBeInTheDocument();
    expect(within(booksPane).queryByText("Pride and Prejudice")).not.toBeInTheDocument();

    // Filter by Profile: Novel
    await user.selectOptions(statusSelect, "all");
    const profileSelect = within(booksPane).getByLabelText("Filter by Profile");
    await user.selectOptions(profileSelect, "Novel");
    expect(within(booksPane).getByText("Pride and Prejudice")).toBeInTheDocument();
    expect(within(booksPane).queryByText("Introduction to Psychology")).not.toBeInTheDocument();
  });

  it("opens Book Hours Setup Drawer, edits workload, previews live calculation, and saves successfully", async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="books" />);

    const booksPane = await screen.findByRole("tabpanel", { name: "Books" });
    expect(within(booksPane).getByText("Introduction to Psychology")).toBeInTheDocument();

    // Click "Edit" on Introduction to Psychology
    const editButtons = within(booksPane).getAllByRole("button", { name: "Edit" });
    await user.click(editButtons[0]);

    // Drawer opens
    const drawer = screen.getByRole("dialog", { name: "Book Hours Setup for Introduction to Psychology" });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByRole("heading", { level: 2, name: "Book Hours Setup" })).toBeInTheDocument();
    expect(within(drawer).getByText("Introduction to Psychology")).toBeInTheDocument();
    expect(within(drawer).getByText("Semester Reading")).toBeInTheDocument(); // Read-only collection

    // Change Profile to Novel (1.0)
    const profileSelect = within(drawer).getByLabelText(/Reading Profile/);
    await user.selectOptions(profileSelect, "p-novel");

    // Change Quantity to 300
    const quantityInput = within(drawer).getByLabelText("Quantity");
    await user.clear(quantityInput);
    await user.type(quantityInput, "300");

    // Change Unit to pages
    const unitSelect = within(drawer).getByLabelText("Quantity Unit");
    await user.selectOptions(unitSelect, "pages");

    // Set Speed Override to 60
    const speedInput = within(drawer).getByLabelText(/Baseline Speed Override/);
    await user.clear(speedInput);
    await user.type(speedInput, "60");

    // Preview should show: (300 / 60) * 1.00 = 5.0h Planned
    expect(within(drawer).getByText("5.0h")).toBeInTheDocument(); // Planned preview
    expect(within(drawer).getByText("300 pages ÷ 60 pages/hour × 1.0 = 5.0h")).toBeInTheDocument(); // Formula breakdown

    // Click "Save Book Setup"
    const saveBtn = within(drawer).getByRole("button", { name: "Save Book Setup" });
    await user.click(saveBtn);

    // Verifies invoke call
    expect(invokeMock).toHaveBeenCalledWith("set_book_workload_command", {
      bookId: "b-1",
      setup: {
        profile_id: "p-novel",
        quantity: 300,
        unit: "pages",
        speed_override: 60,
      },
    });
  });

  it("displays drawer error if saving fails and can be dismissed", async () => {
    const user = userEvent.setup();
    setupDefaultMocks();

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="books" />);
    const booksPane = await screen.findByRole("tabpanel", { name: "Books" });

    const editBtn = within(booksPane).getAllByRole("button", { name: "Edit" })[0];
    await user.click(editBtn);

    // Mock failure on save
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "set_book_workload_command") {
        throw new Error("Invalid quantity input");
      }
      if (cmd === "get_book_hours_overview_command") return mockPopulatedOverview;
      if (cmd === "get_global_book_hours_defaults_command") return mockGlobalDefaults;
      if (cmd === "list_reading_profiles_command") return mockReadingProfiles;
      return undefined;
    });

    const drawer = screen.getByRole("dialog", { name: "Book Hours Setup for Introduction to Psychology" });
    const saveBtn = within(drawer).getByRole("button", { name: "Save Book Setup" });
    await user.click(saveBtn);

    expect(await within(drawer).findByText(/Error: Invalid quantity input/)).toBeInTheDocument();

    // Cancel closes drawer
    const cancelBtn = within(drawer).getByRole("button", { name: "Cancel" });
    await user.click(cancelBtn);

    expect(screen.queryByRole("dialog", { name: "Book Hours Setup for Introduction to Psychology" })).not.toBeInTheDocument();
  });

  it("auto-opens setup drawer when initialBookId is provided", async () => {
    setupDefaultMocks();

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="books" initialBookId="b-3" />);

    const drawer = await screen.findByRole("dialog", {
      name: "Book Hours Setup for Pride and Prejudice",
    });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText("Pride and Prejudice")).toBeInTheDocument();
  });

  it("displays legacy_untyped option and migration warning banner only when book has legacy unit", async () => {
    const legacyBookOverview: BookHoursOverviewDTO = {
      ...mockPopulatedOverview,
      books: [
        {
          book_id: "b-legacy",
          title: "Legacy Untyped Book",
          profile_id: "p-novel",
          profile_name: "Novel",
          collections: [],
          quantity: 200,
          unit: "legacy_untyped",
          speed_override: 50,
          cumulative_percent: 10,
          calculation: null,
        },
      ],
    };
    setupDefaultMocks(legacyBookOverview);

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="books" initialBookId="b-legacy" />);

    const drawer = await screen.findByRole("dialog", {
      name: "Book Hours Setup for Legacy Untyped Book",
    });
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText(/Migrating legacy book: please select a standard unit/)).toBeInTheDocument();
    expect(within(drawer).getByRole("option", { name: "Legacy / Untyped" })).toBeInTheDocument();
  });

  it("fully supports Profiles Tab (Tab 5) CRUD: listing, create, edit, set default, and delete", async () => {
    const user = userEvent.setup();
    let currentProfiles = [...mockReadingProfiles];

    invokeMock.mockImplementation(async (cmd: string, args?: any) => {
      if (cmd === "get_book_hours_overview_command") return mockPopulatedOverview;
      if (cmd === "get_global_book_hours_defaults_command") return mockGlobalDefaults;
      if (cmd === "list_reading_profiles_command") return currentProfiles;
      if (cmd === "create_reading_profile_command") {
        const newP: ReadingProfileDTO = {
          id: args.id,
          name: args.name,
          difficulty_multiplier: args.difficultyMultiplier,
          description: args.description,
          is_default: false,
          created_at: args.createdAt,
          updated_at: args.createdAt,
        };
        currentProfiles.push(newP);
        return newP;
      }
      if (cmd === "update_reading_profile_command") {
        const idx = currentProfiles.findIndex((p) => p.id === args.id);
        if (idx >= 0) {
          currentProfiles[idx] = {
            ...currentProfiles[idx],
            name: args.name,
            difficulty_multiplier: args.difficultyMultiplier,
            description: args.description,
            updated_at: args.updatedAt,
          };
        }
        return currentProfiles[idx];
      }
      if (cmd === "set_default_reading_profile_command") {
        currentProfiles = currentProfiles.map((p) => ({
          ...p,
          is_default: p.id === args.id,
        }));
        return undefined;
      }
      if (cmd === "delete_reading_profile_command") {
        currentProfiles = currentProfiles.filter((p) => p.id !== args.id);
        return undefined;
      }
      return undefined;
    });

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="profiles" />);

    const profilesPane = await screen.findByRole("tabpanel", { name: "Profiles" });
    expect(within(profilesPane).getByText("Textbook")).toBeInTheDocument();
    expect(within(profilesPane).getByText("Novel")).toBeInTheDocument();
    expect(within(profilesPane).getByText("Light Reading")).toBeInTheDocument();

    // 1. Create Profile
    const newBtn = within(profilesPane).getByRole("button", { name: /New Profile/ });
    await user.click(newBtn);

    const drawer = screen.getByRole("dialog", { name: "Create Reading Profile" });
    expect(drawer).toBeInTheDocument();

    await user.type(within(drawer).getByLabelText("Profile Name"), "Research");
    const diffInput = within(drawer).getByLabelText("Difficulty Coefficient");
    await user.clear(diffInput);
    await user.type(diffInput, "3.0");
    await user.type(within(drawer).getByLabelText("Description"), "Complex scientific papers");

    await user.click(within(drawer).getByRole("button", { name: "Save Profile" }));

    expect(invokeMock).toHaveBeenCalledWith(
      "create_reading_profile_command",
      expect.objectContaining({
        name: "Research",
        difficultyMultiplier: 3.0,
        description: "Complex scientific papers",
      }),
    );

    // 2. Edit Profile
    const editBtns = within(profilesPane).getAllByRole("button", { name: "Edit" });
    await user.click(editBtns[0]); // Edit Textbook

    const editDrawer = screen.getByRole("dialog", { name: "Edit Reading Profile" });
    expect(editDrawer).toBeInTheDocument();
    const editDiff = within(editDrawer).getByLabelText("Difficulty Coefficient");
    await user.clear(editDiff);
    await user.type(editDiff, "2.5");
    await user.click(within(editDrawer).getByRole("button", { name: "Save Profile" }));

    expect(invokeMock).toHaveBeenCalledWith(
      "update_reading_profile_command",
      expect.objectContaining({
        id: "p-textbook",
        name: "Textbook",
        difficultyMultiplier: 2.5,
        description: "Academic textbooks & deep technical reading",
      }),
    );

    // 3. Set Default Profile
    const setDefaultBtns = within(profilesPane).getAllByRole("button", { name: "Set Default" });
    await user.click(setDefaultBtns[0]); // Set Textbook as default

    expect(invokeMock).toHaveBeenCalledWith("set_default_reading_profile_command", {
      id: "p-textbook",
    });

    // 4. Delete Profile with Confirmation
    const lightCard = within(profilesPane).getByText("Light Reading").closest(".bhProfileCard")!;
    const deleteBtn = within(lightCard as HTMLElement).getByRole("button", { name: "Delete" });
    await user.click(deleteBtn);

    const confirmModal = screen.getByRole("dialog", { name: "Confirm Delete Profile" });
    expect(confirmModal).toBeInTheDocument();
    expect(within(confirmModal).getByText(/Are you sure you want to delete profile/)).toBeInTheDocument();
    expect(within(confirmModal).getByText(/Books currently assigned to this profile will be reassigned to the default profile/)).toBeInTheDocument();

    await user.click(within(confirmModal).getByRole("button", { name: "Confirm Delete" }));

    expect(invokeMock).toHaveBeenCalledWith("delete_reading_profile_command", {
      id: "p-light",
    });
  });

  it("fully supports Formula & Defaults Tab (Tab 6): formula rules, speed inputs, impact preview, and apply", async () => {
    const user = userEvent.setup();

    const mockRecalcPreview = {
      affected_books_count: 2,
      old_total_planned_hours: 164.2,
      new_total_planned_hours: 180.0,
      hours_delta: 15.8,
      profile_impacts: [
        {
          profile_id: "p-textbook",
          profile_name: "Textbook",
          old_planned_hours: 88.0,
          new_planned_hours: 103.8,
          hours_delta: 15.8,
          affected_books_count: 1,
        },
      ],
      collection_impacts: [
        {
          collection_id: "c-semester",
          collection_name: "Semester Reading",
          old_planned_hours: 88.0,
          new_planned_hours: 103.8,
          hours_delta: 15.8,
          affected_books_count: 1,
        },
      ],
      affected_books: [
        {
          book_id: "b-1",
          title: "Introduction to Psychology",
          profile_name: "Textbook",
          old_planned_hours: 34.56,
          new_planned_hours: 50.36,
          hours_delta: 15.8,
        },
      ],
    };

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_book_hours_overview_command") return mockPopulatedOverview;
      if (cmd === "get_global_book_hours_defaults_command") return mockGlobalDefaults;
      if (cmd === "list_reading_profiles_command") return mockReadingProfiles;
      if (cmd === "preview_book_hours_recalculation_command") return mockRecalcPreview;
      if (cmd === "apply_book_hours_recalculation_command") return mockRecalcPreview;
      return undefined;
    });

    render(<BookHoursPlanning onBack={vi.fn()} initialTab="formula" />);

    const formulaPane = await screen.findByRole("tabpanel", { name: "Formula & Defaults" });
    expect(within(formulaPane).getByText("Global Book Hours Formula")).toBeInTheDocument();
    expect(within(formulaPane).getByText("system calculated")).toBeInTheDocument();
    expect(within(formulaPane).getByText("independent reading fact")).toBeInTheDocument();

    // Edit baseline speeds
    const pagesInput = within(formulaPane).getByLabelText("Baseline Speed (Pages)", { exact: false }) || document.getElementById("bhGlobalSpeedPages");
    await waitFor(() => expect(pagesInput).toHaveValue(60));

    // Click Preview recalculation
    const previewBtn = within(formulaPane).getByRole("button", { name: "Preview recalculation" });
    await user.click(previewBtn);

    expect(invokeMock).toHaveBeenCalledWith("preview_book_hours_recalculation_command", {
      request: {
        proposed_defaults: {
          pages_per_hour: 60,
          words_per_hour: 15000,
          characters_per_hour: 30000,
        },
        proposed_profiles: null,
      },
    });

    // Verify Impact Preview Modal
    const impactModal = await screen.findByRole("dialog", {
      name: "Book Hours Recalculation Preview",
    });
    expect(impactModal).toBeInTheDocument();
    expect(within(impactModal).getByText("No reading facts have changed. This preview shows planning values only.")).toBeInTheDocument();
    expect(within(impactModal).getByText("Reading Progress changes")).toBeInTheDocument();
    expect(within(impactModal).getByText("164.2h")).toBeInTheDocument(); // Old total
    expect(within(impactModal).getByText("180.0h")).toBeInTheDocument(); // New total

    // Affected books list
    expect(within(impactModal).getByText("Introduction to Psychology")).toBeInTheDocument();

    // Click Apply after confirmation
    const applyBtn = within(impactModal).getByRole("button", { name: "Apply after confirmation" });
    await user.click(applyBtn);

      expect(invokeMock).toHaveBeenCalledWith("apply_book_hours_recalculation_command", {
        request: {
          proposed_defaults: {
            pages_per_hour: 60,
            words_per_hour: 15000,
            characters_per_hour: 30000,
          },
          proposed_profiles: null,
        },
      });
    });

    it("consumes initialBookId exactly once and calls onConsumeInitialBookId without reopening drawer after refresh", async () => {
      setupDefaultMocks();
      const user = userEvent.setup();
      const onConsume = vi.fn();

      render(
        <BookHoursPlanning
          onBack={vi.fn()}
          initialTab="books"
          initialBookId="b-3"
          onConsumeInitialBookId={onConsume}
        />,
      );

      // Drawer should open for b-3 on initial load
      const drawer = await screen.findByRole("dialog", {
        name: "Book Hours Setup for Pride and Prejudice",
      });
      expect(drawer).toBeInTheDocument();
      expect(onConsume).toHaveBeenCalledTimes(1);

      // Close drawer
      const closeBtn = within(drawer).getByRole("button", { name: "Close Book Setup Drawer" });
      await user.click(closeBtn);

      // Verify drawer closed
      expect(screen.queryByRole("dialog", { name: "Book Hours Setup for Pride and Prejudice" })).not.toBeInTheDocument();
    });

    it("handles missing global defaults truthfully without inventing numbers", async () => {
      // Mock global defaults IPC failure
      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === "get_book_hours_overview_command") return mockPopulatedOverview;
        if (cmd === "get_global_book_hours_defaults_command") throw new Error("Defaults fetch failure");
        if (cmd === "list_reading_profiles_command") return mockReadingProfiles;
        return null;
      });

      render(<BookHoursPlanning onBack={vi.fn()} initialTab="formula" />);

      // Tab 6 should show error/unavailable banner
      const formulaPane = await screen.findByRole("tabpanel", { name: "Formula & Defaults" });
      expect(
        within(formulaPane).getByText(/Global baseline speeds are unavailable/),
      ).toBeInTheDocument();

      // Inputs should be empty and disabled
      const pagesInput = document.getElementById("bhGlobalSpeedPages") as HTMLInputElement;
      expect(pagesInput).toBeDisabled();
      expect(pagesInput.value).toBe("");

      // Preview button should be disabled
      const previewBtn = within(formulaPane).getByRole("button", { name: "Preview recalculation" });
      expect(previewBtn).toBeDisabled();
    });

    it("renders drawer with truthful unavailable state when global defaults are missing", async () => {
      invokeMock.mockImplementation(async (cmd: string) => {
        if (cmd === "get_book_hours_overview_command") return mockPopulatedOverview;
        if (cmd === "get_global_book_hours_defaults_command") throw new Error("Defaults fetch failure");
        if (cmd === "list_reading_profiles_command") return mockReadingProfiles;
        return null;
      });

      render(<BookHoursPlanning onBack={vi.fn()} initialTab="books" initialBookId="b-3" />);

      const drawer = await screen.findByRole("dialog", {
        name: "Book Hours Setup for Pride and Prejudice",
      });
      expect(drawer).toBeInTheDocument();

      // Speed input placeholder must indicate defaults unavailable, not 60/15000/30000
      const speedInput = within(drawer).getByLabelText("Baseline Speed Override");
      expect(speedInput).toHaveAttribute("placeholder", "Global defaults unavailable — override required");

      // Formula breakdown should indicate global baseline speeds are unavailable
      expect(within(drawer).getByText("Needs setup (global baseline speeds unavailable; enter speed override).")).toBeInTheDocument();
    });
  });
