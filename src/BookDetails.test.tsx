import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookDetails } from "./BookDetails";

const { invokeMock } = vi.hoisted(() => ({ invokeMock: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));

const book = {
  book_id: "b1",
  title: "The Little Prince",
  path: "C:/books/little-prince.epub",
  format: "epub",
  ownership_mode: "reference",
  available: true,
};

beforeEach(() => {
  invokeMock.mockReset();
});

describe("BookDetails (DESIGN.md ER-BOOK-001; FC-A11)", () => {
  it("presents Reading, Book Hours, and Library & File summaries", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_reading_progress_command") {
        return { completed_read_count: 1, active_read_in_progress: true, active_pass_progress: 62 };
      }
      if (cmd === "get_actual_reading_time_command") return { total: { secs: 8280, nanos: 0 } };
      if (cmd === "get_book_hours_command") return { base_hours: 7.0, cumulative_hours: 11.3, cumulative_reading_percent: 162 };
      return null;
    });

    render(<BookDetails book={book} onClose={vi.fn()} onRead={vi.fn()} />);

    expect(await screen.findAllByText("162%")).toHaveLength(2); // Progress and Cumulative progress both read 162%
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("2h 18m")).toBeInTheDocument();
    expect(screen.getByText("7.0h")).toBeInTheDocument();
    expect(screen.getByText("11.3h")).toBeInTheDocument();
    expect(screen.getByText("Reference")).toBeInTheDocument();
    expect(screen.getByText("EPUB")).toBeInTheDocument();
    expect(screen.getByText("Available")).toBeInTheDocument();
  });

  it("renders Organization section with Collections management and Reading Profile", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_collections_command") {
        return [
          { id: "c1", name: "Favorites" },
          { id: "c2", name: "Philosophy" },
        ];
      }
      if (cmd === "list_collections_for_book_command") {
        return [{ id: "c1", name: "Favorites" }];
      }
      if (cmd === "get_book_hours_item_command") {
        return {
          book_id: "b1",
          title: "The Little Prince",
          profile_id: "p1",
          profile_name: "Textbook",
          collections: ["Favorites"],
          quantity: 100,
          unit: "pages",
          speed_override: null,
          cumulative_percent: 62,
          calculation: {
            planned_book_hours: 4.0,
            current_book_hours: 2.48,
            cumulative_percent: 62,
            baseline_speed: 60,
            difficulty_multiplier: 2.4,
          },
        };
      }
      if (cmd === "add_book_to_collection_command") return undefined;
      if (cmd === "remove_book_from_collection_command") return undefined;
      return null;
    });

    render(<BookDetails book={book} onClose={vi.fn()} onRead={vi.fn()} initialFocusSection="organization" />);

    expect(await screen.findByText("Favorites")).toBeInTheDocument();
    expect(screen.getAllByText("Textbook").length).toBeGreaterThanOrEqual(1);

    // Add to collection
    const addSelect = screen.getByLabelText("Add to Collection");
    await user.selectOptions(addSelect, "c2");

    expect(invokeMock).toHaveBeenCalledWith("add_book_to_collection_command", {
      bookId: "b1",
      collectionId: "c2",
    });

    // Remove from collection
    const removeBtn = screen.getByRole("button", { name: "Remove from Favorites" });
    await user.click(removeBtn);

    expect(invokeMock).toHaveBeenCalledWith("remove_book_from_collection_command", {
      bookId: "b1",
      collectionId: "c1",
    });
  });

  it("handles Manage in Data button click to deep-link into Book Hours Planning", async () => {
    const user = userEvent.setup();
    const onManageBookHours = vi.fn();

    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_book_hours_item_command") {
        return {
          book_id: "b1",
          title: "The Little Prince",
          profile_id: "p1",
          profile_name: "Textbook",
          collections: [],
          quantity: 100,
          unit: "pages",
          speed_override: null,
          cumulative_percent: 50,
          calculation: {
            planned_book_hours: 4.0,
            current_book_hours: 2.0,
            cumulative_percent: 50,
            baseline_speed: 60,
            difficulty_multiplier: 2.4,
          },
        };
      }
      return null;
    });

    render(
      <BookDetails
        book={book}
        onClose={vi.fn()}
        onRead={vi.fn()}
        onManageBookHours={onManageBookHours}
      />,
    );

    const manageBtn = await screen.findByRole("button", { name: "Manage in Data" });
    await user.click(manageBtn);

    expect(onManageBookHours).toHaveBeenCalledWith("b1");
  });

  it("shows 'Not configured yet' for Book Hours when no workload config exists", async () => {
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_reading_progress_command") {
        return { completed_read_count: 0, active_read_in_progress: false, active_pass_progress: 0 };
      }
      if (cmd === "get_actual_reading_time_command") return { total: { secs: 0, nanos: 0 } };
      if (cmd === "get_book_hours_command") return null;
      return null;
    });

    render(<BookDetails book={book} onClose={vi.fn()} onRead={vi.fn()} />);

    expect(await screen.findByText("Not configured yet.")).toBeInTheDocument();
  });

  it("Read invokes onRead", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    const onRead = vi.fn();

    render(<BookDetails book={book} onClose={vi.fn()} onRead={onRead} />);
    await user.click(screen.getByRole("button", { name: "Read" }));

    expect(onRead).toHaveBeenCalled();
  });

  it("Back invokes onClose", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValue(null);
    const onClose = vi.fn();

    render(<BookDetails book={book} onClose={onClose} onRead={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Back" }));

    expect(onClose).toHaveBeenCalled();
  });

  it("Open Notebook opens the Notebook for this Book", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_reading_assets_command") return [];
      return null;
    });

    render(<BookDetails book={book} onClose={vi.fn()} onRead={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "✎ Open Notebook" }));

    expect(await screen.findByRole("dialog", { name: "Notebook" })).toBeInTheDocument();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_reading_assets_command", { bookId: "b1" }));
  });
});
