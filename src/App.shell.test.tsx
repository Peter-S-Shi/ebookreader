import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

const { invokeMock, openMock, collectionsMock, COLLECTIONS_COMMANDS, updateCheckPrefMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  openMock: vi.fn(),
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
  updateCheckPrefMock: vi.fn(),
}));

const MOUNT_TIME_SETTING_KEYS = new Set([
  "update_awareness.check_on_startup",
  "motion.reduced",
  "files.default_import_mode",
]);

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

beforeEach(() => {
  invokeMock.mockReset();
  openMock.mockReset();
  collectionsMock.mockReset();
  updateCheckPrefMock.mockReset();
  vi.restoreAllMocks();
  collectionsMock.mockImplementation(async () => []);
  updateCheckPrefMock.mockResolvedValue("false");
  delete document.documentElement.dataset.motion;
});

describe("Desktop Shell — Canonical Left Rail & Topbar (Batch 1)", () => {
  it("renders the persistent left rail with ER brand and 5 canonical destinations", async () => {
    invokeMock.mockResolvedValueOnce([]);
    const { container } = render(<App />);

    // Shell container
    expect(container.querySelector(".app")).toBeInTheDocument();

    // Left Rail
    const rail = container.querySelector(".rail");
    expect(rail).toBeInTheDocument();

    // Brand mark
    expect(rail?.querySelector(".brand")).toHaveTextContent("ER");

    // 5 Navigation destinations
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toBeInTheDocument();

    const libraryBtn = screen.getByRole("button", { name: /Library/i });
    const notesBtn = screen.getByRole("button", { name: /Notes/i });
    const calendarBtn = screen.getByRole("button", { name: /Calendar/i });
    const dataBtn = screen.getByRole("button", { name: /Data/i });
    const settingsBtn = screen.getByRole("button", { name: /Settings/i });

    expect(libraryBtn).toBeInTheDocument();
    expect(notesBtn).toBeInTheDocument();
    expect(calendarBtn).toBeInTheDocument();
    expect(dataBtn).toBeInTheDocument();
    expect(settingsBtn).toBeInTheDocument();

    // Default active destination is Library
    expect(libraryBtn).toHaveAttribute("aria-current", "page");

    // Topbar with active title and Search
    const top = container.querySelector(".top");
    expect(top).toBeInTheDocument();
    expect(top?.querySelector(".title")).toHaveTextContent("Library");
    expect(screen.getByRole("region", { name: "Search" })).toBeInTheDocument();

    await waitFor(() => expect(invokeMock).toHaveBeenCalledWith("list_library_command"));
  });

  it("updates topbar title and active nav state when switching destinations", async () => {
    const user = userEvent.setup();
    invokeMock.mockResolvedValueOnce([]); // list_library on mount
    invokeMock.mockResolvedValueOnce([]); // list_all_reading_assets on notes nav

    const { container } = render(<App />);
    await screen.findByText(/library is empty/i);

    const notesBtn = screen.getByRole("button", { name: /Notes/i });
    await user.click(notesBtn);

    expect(notesBtn).toHaveAttribute("aria-current", "page");
    expect(container.querySelector(".top .title")).toHaveTextContent("Notes");

    const settingsBtn = screen.getByRole("button", { name: /Settings/i });
    await user.click(settingsBtn);

    expect(settingsBtn).toHaveAttribute("aria-current", "page");
    expect(container.querySelector(".top .title")).toHaveTextContent("Settings");
  });
});
