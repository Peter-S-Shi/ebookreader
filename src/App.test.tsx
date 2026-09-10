import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { invokeMock, openMock, collectionsMock, COLLECTIONS_COMMANDS, updateCheckPrefMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
  // FC-A01: App now fetches Collections on every mount alongside the
  // Library listing. Routing these commands to their own mock (with sane
  // defaults set in beforeEach) keeps every pre-existing test's
  // invokeMock.mockResolvedValueOnce(...) call sequence -- written before
  // Collections existed -- valid without editing each of them.
  collectionsMock: vi.fn(),
  COLLECTIONS_COMMANDS: new Set([
    "list_collections_command",
    "create_collection_command",
    "rename_collection_command",
    "delete_collection_command",
    "add_book_to_collection_command",
    "remove_book_from_collection_command",
    "list_book_ids_in_collection_command",
    "list_collections_for_book_command",
    "add_tag_to_book_command",
    "remove_tag_from_book_command",
    "list_tags_for_book_command",
  ]),
  // FC-C08 / FC-A09: App also reads these settings on every mount
  // (whether to run the startup Update Awareness check; the Reduced
  // Motion preference). Routed separately (keyed on the
  // `get_setting_command` call's specific `key` argument, not the whole
  // command, since Settings-destination tests already exercise
  // `get_setting_command` for other keys through invokeMock) and
  // defaulted in beforeEach so pre-existing tests never trigger a real
  // `fetch` via `checkForUpdate` and never see an extra queue-shifting
  // call for a setting they don't know about.
  updateCheckPrefMock: vi.fn(),
}));

const MOUNT_TIME_SETTING_KEYS = new Set(["update_awareness.check_on_startup", "motion.reduced"]);

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: [string, ...unknown[]]) => {
    const [cmd, callArgs] = args;
    if (cmd === "get_setting_command" && MOUNT_TIME_SETTING_KEYS.has((callArgs as { key?: string } | undefined)?.key ?? "")) {
      return updateCheckPrefMock(...args);
    }
    return (COLLECTIONS_COMMANDS.has(cmd) ? collectionsMock : invokeMock)(...args);
  },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openMock }));
vi.mock("./Reader", () => ({
  Reader: ({
    bookId,
    title,
    onBack,
    initialAnchor,
  }: {
    bookId: string;
    title: string;
    onBack: () => void;
    initialAnchor?: { primary_anchor: string };
  }) => (
    <div>
      <p>Reading: {title} ({bookId})</p>
      {initialAnchor && <p>Jump target: {initialAnchor.primary_anchor}</p>}
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  ),
}));
vi.mock("./PdfReader", () => ({
  PdfReader: ({ bookId, title, onBack }: { bookId: string; title: string; onBack: () => void }) => (
    <div>
      <p>Reading PDF: {title} ({bookId})</p>
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  ),
}));
vi.mock("./TxtReader", () => ({
  TxtReader: ({ bookId, title, onBack }: { bookId: string; title: string; onBack: () => void }) => (
    <div>
      <p>Reading TXT: {title} ({bookId})</p>
      <button type="button" onClick={onBack}>
        Back to Library
      </button>
    </div>
  ),
}));

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
  collectionsMock.mockReset();
  updateCheckPrefMock.mockReset();
  vi.restoreAllMocks();
  collectionsMock.mockImplementation(async (cmd: string) => {
    switch (cmd) {
      case "list_collections_command":
      case "list_collections_for_book_command":
      case "list_tags_for_book_command":
      case "list_book_ids_in_collection_command":
        return [];
      case "create_collection_command":
        return "new-collection-id";
      default:
        return undefined;
    }
  });
  updateCheckPrefMock.mockResolvedValue("false");
  delete document.documentElement.dataset.motion;
});

describe("App shell", () => {
  it("renders the EbookReader application shell", async () => {
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    expect(screen.getByRole("heading", { name: "EbookReader" })).toBeInTheDocument();
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_library_command"));
  });
});

describe("Library", () => {
  it("shows an empty-library message when there are no books", async () => {
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    expect(await screen.findByText(/library is empty/i)).toBeInTheDocument();
  });

  it("lists books returned by list_library_command", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "abc", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    expect(await screen.findByText("Alice's Adventures in Wonderland")).toBeInTheDocument();
  });

  it("imports a book via the native file picker and refreshes the list", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // initial list on mount
    openMock.mockResolvedValueOnce("C:/books/new-book.epub");
    invokeMock.mockResolvedValueOnce({ kind: "imported", book_id: "new-book-id" }); // import_book_command
    invokeMock.mockResolvedValueOnce([
      { book_id: "new-book-id", title: "new-book", path: "C:/books/new-book.epub", format: "epub", ownership_mode: "reference", available: true },
    ]); // refreshed list

    render(<App />);
    await screen.findByText(/library is empty/i);

    await user.click(screen.getByRole("button", { name: /import book/i }));

    expect(await screen.findByText("new-book")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("import_book_command", {
      path: "C:/books/new-book.epub",
      ownershipMode: "reference",
    });
  });

  it("shows Needs Relink for a book whose file is missing, not for one that's present", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "missing", title: "Missing Book", path: "C:/books/gone.epub", format: "epub", ownership_mode: "reference", available: false },
      { book_id: "present", title: "Present Book", path: "C:/books/here.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    const missingItem = (await screen.findByText("Missing Book")).closest("li")!;
    expect(within(missingItem).getByText(/needs relink/i)).toBeInTheDocument();

    const presentItem = screen.getByText("Present Book").closest("li")!;
    expect(within(presentItem).queryByText(/needs relink/i)).not.toBeInTheDocument();
  });

  it("removes a book from the Library only after confirming the separated consequence", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([
      { book_id: "to-remove", title: "Removable Book", path: "C:/books/removable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]); // initial list
    invokeMock.mockResolvedValueOnce(undefined); // remove_book_command
    invokeMock.mockResolvedValueOnce([]); // refreshed list

    render(<App />);
    await screen.findByText("Removable Book");

    await user.click(screen.getByRole("button", { name: "Remove from Library" }));

    expect(await screen.findByText(/library is empty/i)).toBeInTheDocument();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Reading data is kept"));
    expect(invokeMock).toHaveBeenCalledWith("remove_book_command", { bookId: "to-remove" });
  });

  it("does not remove a book when Remove from Library confirmation is cancelled", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    invokeMock.mockResolvedValueOnce([
      { book_id: "keep", title: "Keep Book", path: "C:/books/keep.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);

    render(<App />);
    await screen.findByText("Keep Book");

    await user.click(screen.getByRole("button", { name: "Remove from Library" }));

    expect(invokeMock).not.toHaveBeenCalledWith("remove_book_command", { bookId: "keep" });
    expect(screen.getByText("Keep Book")).toBeInTheDocument();
  });

  it("deletes reading data through an explicitly labeled destructive action while keeping file semantics separate", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([
      { book_id: "data-book", title: "Data Book", path: "C:/books/data.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    invokeMock.mockResolvedValueOnce(undefined); // delete_reading_data_command
    invokeMock.mockResolvedValueOnce([
      { book_id: "data-book", title: "Data Book", path: "C:/books/data.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);

    render(<App />);
    await screen.findByText("Data Book");

    await user.click(screen.getByRole("button", { name: "Delete Reading Data" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("The Book file stays in place"));
    expect(invokeMock).toHaveBeenCalledWith("delete_reading_data_command", { bookId: "data-book" });
    expect(await screen.findByText("Data Book")).toBeInTheDocument();
  });

  it("offers Managed-Copy file deletion only for managed-copy books", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([
      { book_id: "managed", title: "Managed Book", path: "C:/app/managed.epub", format: "epub", ownership_mode: "managed_copy", available: true },
      { book_id: "reference", title: "Reference Book", path: "C:/books/reference.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    invokeMock.mockResolvedValueOnce(undefined); // delete_managed_copy_file_command
    invokeMock.mockResolvedValueOnce([
      { book_id: "managed", title: "Managed Book", path: "C:/app/managed.epub", format: "epub", ownership_mode: "managed_copy", available: false },
      { book_id: "reference", title: "Reference Book", path: "C:/books/reference.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);

    render(<App />);
    const managedItem = (await screen.findByText("Managed Book")).closest("li")!;
    const referenceItem = screen.getByText("Reference Book").closest("li")!;

    expect(within(managedItem).getByRole("button", { name: "Delete Managed-Copy File" })).toBeInTheDocument();
    expect(within(referenceItem).queryByRole("button", { name: "Delete Managed-Copy File" })).not.toBeInTheDocument();

    await user.click(within(managedItem).getByRole("button", { name: "Delete Managed-Copy File" }));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Reference source files are never deleted"));
    expect(invokeMock).toHaveBeenCalledWith("delete_managed_copy_file_command", { bookId: "managed" });
  });

  describe("Duplicate Fingerprint (PRODUCT_SPEC.md 'Duplicate import'; FC-A03)", () => {
    it("offers Open Existing / Relink Existing Book / Cancel instead of silently resolving a duplicate", async () => {
      const user = userEvent.setup();
      invokeMock.mockResolvedValueOnce([]); // initial list
      openMock.mockResolvedValueOnce("C:/books/dup-source.epub");
      invokeMock.mockResolvedValueOnce({ kind: "duplicate", book_id: "existing-id", title: "Existing Book" }); // import_book_command

      render(<App />);
      await screen.findByText(/library is empty/i);

      await user.click(screen.getByRole("button", { name: /import book/i }));

      expect(await screen.findByText("This book already exists.")).toBeInTheDocument();
      const dialog = screen.getByRole("dialog", { name: "Duplicate Book" });
      expect(within(dialog).getByText("Existing Book")).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Open Existing" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Relink Existing Book" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeInTheDocument();
      // The duplicate report must not itself have refreshed/mutated the Library
      // beyond the one load on mount.
      expect(invokeMock.mock.calls.filter((call) => call[0] === "list_library_command")).toHaveLength(1);
    });

    it("Open Existing opens the already-in-Library book without importing the picked file", async () => {
      const user = userEvent.setup();
      invokeMock.mockResolvedValueOnce([
        { book_id: "existing-id", title: "Existing Book", path: "C:/books/existing.epub", format: "epub", ownership_mode: "reference", available: true },
      ]); // initial list
      openMock.mockResolvedValueOnce("C:/books/dup-source.epub");
      invokeMock.mockResolvedValueOnce({ kind: "duplicate", book_id: "existing-id", title: "Existing Book" }); // import_book_command

      render(<App />);
      await screen.findByText("Existing Book");

      await user.click(screen.getByRole("button", { name: /import book/i }));
      await screen.findByRole("dialog", { name: "Duplicate Book" });
      await user.click(screen.getByRole("button", { name: "Open Existing" }));

      expect(await screen.findByText("Reading: Existing Book (existing-id)")).toBeInTheDocument();
      expect(invokeMock).not.toHaveBeenCalledWith("relink_book_command", expect.anything());
    });

    it("Relink Existing Book relinks the existing Book to the picked file's path", async () => {
      const user = userEvent.setup();
      invokeMock.mockResolvedValueOnce([]); // initial list
      openMock.mockResolvedValueOnce("C:/books/moved-copy.epub");
      invokeMock.mockResolvedValueOnce({ kind: "duplicate", book_id: "existing-id", title: "Existing Book" }); // import_book_command
      invokeMock.mockResolvedValueOnce("relinked"); // relink_book_command
      invokeMock.mockResolvedValueOnce([
        { book_id: "existing-id", title: "Existing Book", path: "C:/books/moved-copy.epub", format: "epub", ownership_mode: "reference", available: true },
      ]); // refreshed list

      render(<App />);
      await screen.findByText(/library is empty/i);

      await user.click(screen.getByRole("button", { name: /import book/i }));
      await screen.findByRole("dialog", { name: "Duplicate Book" });
      await user.click(screen.getByRole("button", { name: "Relink Existing Book" }));

      expect(invokeMock).toHaveBeenCalledWith("relink_book_command", {
        bookId: "existing-id",
        candidatePath: "C:/books/moved-copy.epub",
      });
      expect(await screen.findByText("Existing Book")).toBeInTheDocument();
      expect(screen.queryByRole("dialog", { name: "Duplicate Book" })).not.toBeInTheDocument();
    });

    it("Cancel dismisses the dialog without opening, relinking, or refreshing", async () => {
      const user = userEvent.setup();
      invokeMock.mockResolvedValueOnce([]); // initial list
      openMock.mockResolvedValueOnce("C:/books/dup-source.epub");
      invokeMock.mockResolvedValueOnce({ kind: "duplicate", book_id: "existing-id", title: "Existing Book" }); // import_book_command

      render(<App />);
      await screen.findByText(/library is empty/i);

      await user.click(screen.getByRole("button", { name: /import book/i }));
      await screen.findByRole("dialog", { name: "Duplicate Book" });
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      expect(screen.queryByRole("dialog", { name: "Duplicate Book" })).not.toBeInTheDocument();
      expect(invokeMock).not.toHaveBeenCalledWith("relink_book_command", expect.anything());
      expect(invokeMock.mock.calls.filter((call) => call[0] === "list_library_command")).toHaveLength(1);
    });
  });
});

describe("Reduced Motion reachability (DESIGN.md SS17; FC-A09)", () => {
  it("applies a persisted Reduced Motion preference to the document on mount, without visiting Settings", async () => {
    invokeMock.mockResolvedValueOnce([]);
    updateCheckPrefMock.mockImplementation(async (cmd: string, args: { key?: string }) => {
      if (cmd === "get_setting_command" && args?.key === "motion.reduced") return "true";
      return "false";
    });

    render(<App />);
    await screen.findByText(/library is empty/i);

    await waitFor(() => expect(document.documentElement.dataset.motion).toBe("reduced"));
  });
});

describe("Startup Update Awareness check (PRODUCT_SPEC.md SS17; FC-C08)", () => {
  it("does not check for updates on startup when the preference is off (the beforeEach default)", async () => {
    invokeMock.mockResolvedValueOnce([]); // initial list
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(<App />);
    await screen.findByText(/library is empty/i);

    expect(updateCheckPrefMock).toHaveBeenCalledWith("get_setting_command", { key: "update_awareness.check_on_startup" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows an update-available banner when the startup check finds a newer stable release", async () => {
    invokeMock.mockResolvedValueOnce([]); // initial list
    updateCheckPrefMock.mockResolvedValue("true");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v99.0.0", html_url: "https://example.invalid/releases/v99.0.0" }),
    } as Response);

    render(<App />);

    expect(await screen.findByText(/update available: 99\.0\.0/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Release notes" })).toHaveAttribute(
      "href",
      "https://example.invalid/releases/v99.0.0",
    );
  });

  it("never shows a banner when already up to date, and does not block the Library from rendering", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "A Book", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    updateCheckPrefMock.mockResolvedValue("true");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v0.1.0", html_url: "https://example.invalid/releases/v0.1.0" }),
    } as Response);

    render(<App />);

    expect(await screen.findByText("A Book")).toBeInTheDocument();
    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument();
  });

  it("Dismiss hides the banner", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    updateCheckPrefMock.mockResolvedValue("true");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ tag_name: "v99.0.0", html_url: "https://example.invalid/releases/v99.0.0" }),
    } as Response);

    render(<App />);
    await screen.findByText(/update available/i);

    await user.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(screen.queryByText(/update available/i)).not.toBeInTheDocument();
  });
});

describe("Metadata editing (PRODUCT_SPEC.md SS3.4 'user-corrected metadata wins'; FC-A02)", () => {
  it("edits a Book's title and refreshes the Library with the correction", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "Detected Title", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]); // initial list
    invokeMock.mockResolvedValueOnce(undefined); // update_book_title_command
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "Corrected Title", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]); // refreshed list

    render(<App />);
    await screen.findByText("Detected Title");

    await user.click(screen.getByRole("button", { name: "Edit Title" }));
    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Corrected Title");
    await user.click(screen.getByRole("button", { name: "Save Title" }));

    expect(invokeMock).toHaveBeenCalledWith("update_book_title_command", { bookId: "b1", title: "Corrected Title" });
    expect(await screen.findByText("Corrected Title")).toBeInTheDocument();
  });

  it("Cancel discards the draft title without calling the update command", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "Original Title", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);

    render(<App />);
    await screen.findByText("Original Title");

    await user.click(screen.getByRole("button", { name: "Edit Title" }));
    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Discarded Draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByText("Original Title")).toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("update_book_title_command", expect.anything());
  });
});

describe("Collections and Tags (PRODUCT_SPEC.md SS4.3/4.4; FC-A01)", () => {
  it("creates a Collection and lists it as a filter option", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // initial library list
    collectionsMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_collections_command") return [{ id: "col-1", name: "Favorites" }];
      if (cmd === "create_collection_command") return "col-1";
      return [];
    });

    render(<App />);
    await screen.findByText(/library is empty/i);

    await user.type(screen.getByLabelText("New Collection"), "Favorites");
    await user.click(screen.getByRole("button", { name: "Create Collection" }));

    expect(collectionsMock).toHaveBeenCalledWith("create_collection_command", { name: "Favorites" });
    expect(await screen.findByRole("button", { name: "Favorites" })).toBeInTheDocument();
  });

  it("filtering by a Collection shows only its member Books", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "In Collection", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
      { book_id: "b2", title: "Not In Collection", path: "C:/books/b2.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    collectionsMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_collections_command") return [{ id: "col-1", name: "Favorites" }];
      if (cmd === "list_book_ids_in_collection_command") return ["b1"];
      return [];
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByText("In Collection");
    expect(screen.getByText("Not In Collection")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Favorites" }));

    expect(await screen.findByText("In Collection")).toBeInTheDocument();
    expect(screen.queryByText("Not In Collection")).not.toBeInTheDocument();
    expect(collectionsMock).toHaveBeenCalledWith("list_book_ids_in_collection_command", { collectionId: "col-1" });
  });

  it("deleting a Collection removes it as a filter option without touching its Books", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "A Book", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    collectionsMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_collections_command") return [{ id: "col-1", name: "Temporary" }];
      return [];
    });

    render(<App />);
    await screen.findByText("A Book");
    await screen.findByRole("button", { name: "Temporary" });

    await user.click(screen.getByRole("button", { name: "Delete Collection" }));

    expect(collectionsMock).toHaveBeenCalledWith("delete_collection_command", { collectionId: "col-1" });
    expect(screen.getByText("A Book")).toBeInTheDocument();
  });

  it("the Organize panel adds/removes a Book's Collection membership and Tags", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "A Book", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    let bookCollections: { id: string; name: string }[] = [];
    let bookTags: string[] = [];
    collectionsMock.mockImplementation(async (cmd: string) => {
      if (cmd === "list_collections_command") return [{ id: "col-1", name: "Favorites" }];
      if (cmd === "list_collections_for_book_command") return bookCollections;
      if (cmd === "list_tags_for_book_command") return bookTags;
      if (cmd === "add_book_to_collection_command") {
        bookCollections = [{ id: "col-1", name: "Favorites" }];
        return undefined;
      }
      if (cmd === "remove_book_from_collection_command") {
        bookCollections = [];
        return undefined;
      }
      if (cmd === "add_tag_to_book_command") {
        bookTags = ["reread"];
        return undefined;
      }
      if (cmd === "remove_tag_from_book_command") {
        bookTags = [];
        return undefined;
      }
      return undefined;
    });
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_book_hours_command") return null;
      if (cmd === "list_workload_config_revisions_command") return [];
      return undefined;
    });

    render(<App />);
    await screen.findByText("A Book");

    await user.click(screen.getByRole("button", { name: "Organize" }));
    const panel = await screen.findByRole("region", { name: "Organize A Book" });

    await user.selectOptions(within(panel).getByLabelText("Add to Collection"), "col-1");
    expect(collectionsMock).toHaveBeenCalledWith("add_book_to_collection_command", { bookId: "b1", collectionId: "col-1" });
    await waitFor(() => expect(panel.querySelector(".collection-chip")).toHaveTextContent("Favorites"));

    await user.click(within(panel).getByRole("button", { name: "Remove" }));
    expect(collectionsMock).toHaveBeenCalledWith("remove_book_from_collection_command", { bookId: "b1", collectionId: "col-1" });

    await user.type(within(panel).getByLabelText("New Tag"), "reread");
    await user.click(within(panel).getByRole("button", { name: "Add Tag" }));
    expect(collectionsMock).toHaveBeenCalledWith("add_tag_to_book_command", { bookId: "b1", tagName: "reread" });
    expect(await within(panel).findByText("reread")).toBeInTheDocument();
  });
});

describe("Book Hours configuration + revision history (PRODUCT_SPEC.md SS9; FC-A05)", () => {
  it("shows 'Not configured yet' before any workload config exists", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "A Book", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_book_hours_command") return null;
      if (cmd === "list_workload_config_revisions_command") return [];
      return undefined;
    });

    render(<App />);
    await screen.findByText("A Book");
    await user.click(screen.getByRole("button", { name: "Organize" }));

    expect(await screen.findByText("Not configured yet.")).toBeInTheDocument();
  });

  it("displays the current Base/Cumulative Book Hours estimate and its revision history", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "A Book", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    invokeMock.mockImplementation(async (cmd: string) => {
      if (cmd === "get_book_hours_command") {
        return { base_hours: 20, cumulative_hours: 10, cumulative_reading_percent: 50 };
      }
      if (cmd === "list_workload_config_revisions_command") {
        return [
          { quantity: 100_000, baseline_speed: 250, difficulty_coefficient: 1.2, recorded_at: "2026-09-09T01:00:00Z" },
          { quantity: 80_000, baseline_speed: 250, difficulty_coefficient: 1.0, recorded_at: "2026-09-08T00:00:00Z" },
        ];
      }
      return undefined;
    });

    render(<App />);
    await screen.findByText("A Book");
    await user.click(screen.getByRole("button", { name: "Organize" }));
    const panel = await screen.findByRole("region", { name: "Book Hours for A Book" });

    expect(within(panel).getByText(/base 20\.0h, cumulative 10\.0h/i)).toBeInTheDocument();
    expect(within(panel).getByText(/2026-09-09T01:00:00Z/)).toBeInTheDocument();
    expect(within(panel).getByText(/2026-09-08T00:00:00Z/)).toBeInTheDocument();
  });

  it("saves a workload config change, records a revision, and refreshes the estimate", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "b1", title: "A Book", path: "C:/books/b1.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    let saved: { quantity: number; baselineSpeed: number; difficultyCoefficient: number } | null = null;
    invokeMock.mockImplementation(async (cmd: string, args) => {
      if (cmd === "get_book_hours_command") {
        return saved
          ? { base_hours: saved.quantity / saved.baselineSpeed, cumulative_hours: 0, cumulative_reading_percent: 0 }
          : null;
      }
      if (cmd === "list_workload_config_revisions_command") {
        return saved
          ? [{ quantity: saved.quantity, baseline_speed: saved.baselineSpeed, difficulty_coefficient: saved.difficultyCoefficient, recorded_at: "2026-09-09T00:00:00Z" }]
          : [];
      }
      if (cmd === "save_workload_config_command") {
        const a = args as { quantity: number; baselineSpeed: number; difficultyCoefficient: number };
        saved = { quantity: a.quantity, baselineSpeed: a.baselineSpeed, difficultyCoefficient: a.difficultyCoefficient };
        return undefined;
      }
      return undefined;
    });

    render(<App />);
    await screen.findByText("A Book");
    await user.click(screen.getByRole("button", { name: "Organize" }));
    const panel = await screen.findByRole("region", { name: "Book Hours for A Book" });
    await within(panel).findByText("Not configured yet.");

    await user.clear(within(panel).getByLabelText("Quantity"));
    await user.type(within(panel).getByLabelText("Quantity"), "100000");
    await user.clear(within(panel).getByLabelText("Baseline Speed"));
    await user.type(within(panel).getByLabelText("Baseline Speed"), "250");
    await user.click(within(panel).getByRole("button", { name: "Save Book Hours Config" }));

    expect(invokeMock).toHaveBeenCalledWith(
      "save_workload_config_command",
      expect.objectContaining({ bookId: "b1", quantity: 100000, baselineSpeed: 250, difficultyCoefficient: 1 }),
    );
    expect(await within(panel).findByText(/base 400\.0h/i)).toBeInTheDocument();
    expect(within(panel).getByText(/2026-09-09T00:00:00Z/)).toBeInTheDocument();
  });
});

describe("Top-level navigation (DESIGN.md; FC-C06)", () => {
  it("shows Library by default and marks it as the current destination", async () => {
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    expect(screen.getByRole("button", { name: "Library" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Notes" })).not.toHaveAttribute("aria-current");
  });

  it("switching to another destination hides the Library panel, and back shows it again", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    invokeMock.mockResolvedValueOnce([]); // list_all_reading_assets_command
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.queryByText("Book One")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Notes" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Library" }));
    expect(await screen.findByText("Book One")).toBeInTheDocument();
  });

  it("keeps Search visible regardless of which destination is active", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([]); // list_all_reading_assets_command
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(screen.getByLabelText("Search the library")).toBeInTheDocument();
  });

  it("Reader stays contextual: opening a Book does not add a new nav destination", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "epub-1", title: "Openable EPUB", path: "C:/books/openable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Openable EPUB" }));

    await screen.findByText(/Reading: Openable EPUB/);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("Settings", () => {
  it("opens the Settings panel and loads Appearance", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // initial list
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce(null).mockResolvedValueOnce(null); // get_setting_command x2
    await user.click(screen.getByRole("button", { name: "Settings" }));

    expect(await screen.findByText("Appearance")).toBeInTheDocument();
    expect(invokeMock).toHaveBeenCalledWith("get_setting_command", { key: "appearance.theme_mode" });
  });
});

describe("Library-wide Search", () => {
  it("runs a search and shows results with the matching book's title", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole" }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(invokeMock).toHaveBeenCalledWith("search_library_command", { query: "rabbit" });
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;
    expect(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" })).toBeInTheDocument();
  });

  it("shows a no-results message for an empty result set", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([]);
    await user.type(screen.getByLabelText("Search the library"), "nothing");
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(await screen.findByText("No results.")).toBeInTheDocument();
  });

  it("clicking a search result opens its book", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole" }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;

    await user.click(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" }));

    expect(await screen.findByText(/Reading: Alice's Adventures in Wonderland \(book-1\)/)).toBeInTheDocument();
  });

  const sampleAnchor = {
    book_id: "book-1",
    format: "epub",
    progression_hint: 0.2,
    primary_anchor: "epubcfi(/6/4!/4/2/1:0)",
    fallback_anchors: [],
    context_selector: null,
  };

  it("FC-C01: opening a search result with a real anchor seeks the Reader there", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole", anchor: sampleAnchor }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;

    await user.click(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" }));

    expect(await screen.findByText(`Jump target: ${sampleAnchor.primary_anchor}`)).toBeInTheDocument();
  });

  it("a search result with no anchor opens the Book plainly (truthful, not a guessed jump)", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Alice's Adventures in Wonderland", path: "C:/books/alice.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Alice's Adventures in Wonderland");

    invokeMock.mockResolvedValueOnce([{ book_id: "book-1", kind: "excerpt:1", content: "the rabbit hole", anchor: null }]);
    await user.type(screen.getByLabelText("Search the library"), "rabbit");
    await user.click(screen.getByRole("button", { name: "Search" }));
    const resultItem = (await screen.findByText("the rabbit hole")).closest("li")!;

    await user.click(within(resultItem).getByRole("button", { name: "Alice's Adventures in Wonderland" }));

    await screen.findByText(/Reading: Alice's Adventures in Wonderland/);
    expect(screen.queryByText(/Jump target:/)).not.toBeInTheDocument();
  });
});

describe("Global Notes", () => {
  it("lists Notebook assets across all books when opened", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A cross-book thought", orphaned: false },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(invokeMock).toHaveBeenCalledWith("list_all_reading_assets_command", { kind: null });
    expect(await screen.findByText("A cross-book thought")).toBeInTheDocument();
  });

  it("filtering by asset type re-queries with the selected kind", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([]);
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_all_reading_assets_command", { kind: null }));

    invokeMock.mockResolvedValueOnce([
      { id: "e1", book_id: "book-1", kind: "excerpt", text: "a collected passage", orphaned: false },
    ]);
    await user.selectOptions(screen.getByLabelText("Filter Notes by type"), "excerpt");

    expect(invokeMock).toHaveBeenCalledWith("list_all_reading_assets_command", { kind: "excerpt" });
    expect(await screen.findByText("a collected passage")).toBeInTheDocument();
  });

  it("FC-C02: opening a Global Notes asset with a real anchor seeks the Reader there", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    const anchor = {
      book_id: "book-1",
      format: "epub",
      progression_hint: 0.1,
      primary_anchor: "epubcfi(/6/2!/4/2/1:0)",
      fallback_anchors: [],
      context_selector: "chapter 1",
    };
    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A source-anchored thought", orphaned: false, anchor },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(await screen.findByRole("button", { name: "Book One" }));

    expect(await screen.findByText(`Jump target: ${anchor.primary_anchor}`)).toBeInTheDocument();
  });

  it("a free-standing Note (no anchor) opens the Book plainly", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await screen.findByText("Book One");

    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "note", text: "A free-standing thought", orphaned: false, anchor: null },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await user.click(await screen.findByRole("button", { name: "Book One" }));

    await screen.findByText(/Reading: Book One/);
    expect(screen.queryByText(/Jump target:/)).not.toBeInTheDocument();
  });

  it("marks an orphaned Global Notes entry as Detached", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]);
    render(<App />);
    await screen.findByText(/library is empty/i);

    invokeMock.mockResolvedValueOnce([
      { id: "a1", book_id: "book-1", kind: "annotation", text: "stale highlight", orphaned: true },
    ]);
    await user.click(screen.getByRole("button", { name: "Notes" }));

    expect(await screen.findByText("stale highlight")).toBeInTheDocument();
    expect(screen.getByText("Detached")).toBeInTheDocument();
  });
});

describe("Opening a book", () => {
  it("opens the Reader for an available EPUB when its title is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "epub-1", title: "Openable EPUB", path: "C:/books/openable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Openable EPUB" }));

    expect(await screen.findByText(/Reading: Openable EPUB \(epub-1\)/)).toBeInTheDocument();
  });

  it("returns to the Library when the Reader's Back to Library is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "epub-1", title: "Openable EPUB", path: "C:/books/openable.epub", format: "epub", ownership_mode: "reference", available: true },
    ]);
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Openable EPUB" }));
    await screen.findByText(/Reading: Openable EPUB/);

    await user.click(screen.getByRole("button", { name: /back to library/i }));

    expect(await screen.findByText("Openable EPUB")).toBeInTheDocument();
    expect(screen.queryByText(/Reading: Openable EPUB/)).not.toBeInTheDocument();
  });

  it("opens the PdfReader for an available PDF when its title is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "pdf-1", title: "A PDF Book", path: "C:/books/a.pdf", format: "pdf", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "A PDF Book" }));

    expect(await screen.findByText(/Reading PDF: A PDF Book \(pdf-1\)/)).toBeInTheDocument();
  });

  it("opens the TxtReader for an available TXT when its title is clicked", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([
      { book_id: "txt-1", title: "A TXT Book", path: "C:/books/a.txt", format: "txt", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "A TXT Book" }));

    expect(await screen.findByText(/Reading TXT: A TXT Book \(txt-1\)/)).toBeInTheDocument();
  });

  it("does not offer to open a format with no renderer at all", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "mystery-1", title: "A Mystery Format", path: "C:/books/a.xyz", format: "xyz", ownership_mode: "reference", available: true },
    ]);
    render(<App />);

    await screen.findByText("A Mystery Format");
    expect(screen.queryByRole("button", { name: "A Mystery Format" })).not.toBeInTheDocument();
  });

  it("does not offer to open a book that Needs Relink", async () => {
    invokeMock.mockResolvedValueOnce([
      { book_id: "missing-1", title: "Missing EPUB", path: "C:/books/gone.epub", format: "epub", ownership_mode: "reference", available: false },
    ]);
    render(<App />);

    await screen.findByText("Missing EPUB");
    expect(screen.queryByRole("button", { name: "Missing EPUB" })).not.toBeInTheDocument();
  });
});
