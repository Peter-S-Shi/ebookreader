import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DataRecovery } from "./DataRecovery";

const { invokeMock, saveMock, openMock, confirmMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  saveMock: vi.fn(),
  openMock: vi.fn(),
  confirmMock: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: invokeMock }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ save: saveMock, open: openMock, confirm: confirmMock }));

beforeEach(() => {
  invokeMock.mockReset();
  saveMock.mockReset();
  openMock.mockReset();
  confirmMock.mockReset();
});

describe("DataRecovery", () => {
  it("allows Data Book Data to override completed reads only after the required warning confirmation", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_library_command") {
        return Promise.resolve([
          { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
        ]);
      }
      if (cmd === "override_completed_reads_command") {
        return Promise.resolve({
          completed_read_count: 3,
          active_read_in_progress: false,
          active_pass_progress: 0,
        });
      }
      return Promise.resolve(undefined);
    });
    confirmMock.mockResolvedValue(true);

    render(<DataRecovery />);

    await user.click(screen.getByRole("button", { name: "Load Book Data" }));
    await screen.findByLabelText("Completed reads for Book One");
    await user.clear(screen.getByLabelText("Completed reads for Book One"));
    await user.type(screen.getByLabelText("Completed reads for Book One"), "3");
    await user.click(screen.getByRole("button", { name: "Set completed reads for Book One" }));

    expect(confirmMock).toHaveBeenCalledWith(
      expect.stringContaining("Actual Reading Time stays unchanged"),
      expect.objectContaining({ title: "Confirm Completed-Read Override", kind: "warning" }),
    );
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("override_completed_reads_command", {
        bookId: "book-1",
        completedReadCount: 3,
      }),
    );
    expect(await screen.findByText("Book One completed reads set to 3.")).toBeInTheDocument();
  });

  it("does not override completed reads when the warning confirmation is declined", async () => {
    const user = userEvent.setup();
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "list_library_command") {
        return Promise.resolve([
          { book_id: "book-1", title: "Book One", path: "C:/books/one.epub", format: "epub", ownership_mode: "reference", available: true },
        ]);
      }
      return Promise.resolve(undefined);
    });
    confirmMock.mockResolvedValue(false);

    render(<DataRecovery />);

    await user.click(screen.getByRole("button", { name: "Load Book Data" }));
    await screen.findByRole("button", { name: "Set completed reads for Book One" });
    await user.click(screen.getByRole("button", { name: "Set completed reads for Book One" }));

    expect(confirmMock).toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("override_completed_reads_command", expect.anything());
  });

  it("creating an App Data Backup calls the command with the chosen path and reports the book count", async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue("C:/backups/app-data.zip");
    invokeMock.mockResolvedValue({ kind: "AppData", created_at: "2026-09-09T00:00:00Z", book_count: 3, files: [] });

    render(<DataRecovery />);
    await user.click(screen.getByRole("button", { name: "Create App Data Backup" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "create_app_data_backup_command",
        expect.objectContaining({ destPath: "C:/backups/app-data.zip" }),
      ),
    );
    expect(await screen.findByText(/3 book\(s\)/)).toBeInTheDocument();
  });

  it("does nothing when the save dialog is cancelled", async () => {
    const user = userEvent.setup();
    saveMock.mockResolvedValue(null);

    render(<DataRecovery />);
    await user.click(screen.getByRole("button", { name: "Create App Data Backup" }));

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("previewing a complete archive enables Restore", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/backups/app-data.zip");
    invokeMock.mockResolvedValue({
      manifest: { kind: "AppData", created_at: "2026-09-09T00:00:00Z", book_count: 2, files: [] },
      schema_ok: true,
      missing: [],
    });

    render(<DataRecovery />);
    await user.click(screen.getByRole("button", { name: "Choose Backup to Restore…" }));

    expect(await screen.findByText("This archive is complete and can be restored.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore This Backup" })).toBeEnabled();
  });

  it("previewing an incomplete archive disables Restore and shows what's missing", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/backups/broken.zip");
    invokeMock.mockResolvedValue({
      manifest: { kind: "FullLibrary", created_at: "2026-09-09T00:00:00Z", book_count: 1, files: ["managed/x.epub"] },
      schema_ok: true,
      missing: ["managed/x.epub"],
    });

    render(<DataRecovery />);
    await user.click(screen.getByRole("button", { name: "Choose Backup to Restore…" }));

    expect(await screen.findByText(/incomplete/)).toBeInTheDocument();
    expect(screen.getByText(/managed\/x\.epub/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Restore This Backup" })).toBeDisabled();
  });

  it("restoring asks for confirmation and calls restore_backup_command only when confirmed", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/backups/app-data.zip");
    invokeMock.mockImplementation((cmd: string) => {
      if (cmd === "preview_backup_command") {
        return Promise.resolve({
          manifest: { kind: "AppData", created_at: "2026-09-09T00:00:00Z", book_count: 2, files: [] },
          schema_ok: true,
          missing: [],
        });
      }
      if (cmd === "restore_backup_command") {
        return Promise.resolve({ kind: "AppData", created_at: "2026-09-09T00:00:00Z", book_count: 2, files: [] });
      }
      return Promise.resolve(undefined);
    });
    confirmMock.mockResolvedValue(true);

    render(<DataRecovery />);
    await user.click(screen.getByRole("button", { name: "Choose Backup to Restore…" }));
    await screen.findByRole("button", { name: "Restore This Backup" });

    await user.click(screen.getByRole("button", { name: "Restore This Backup" }));

    expect(confirmMock).toHaveBeenCalled();
    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith(
        "restore_backup_command",
        expect.objectContaining({ archivePath: "C:/backups/app-data.zip" }),
      ),
    );
  });

  it("declining the confirmation dialog does not call restore_backup_command", async () => {
    const user = userEvent.setup();
    openMock.mockResolvedValue("C:/backups/app-data.zip");
    invokeMock.mockResolvedValue({
      manifest: { kind: "AppData", created_at: "2026-09-09T00:00:00Z", book_count: 2, files: [] },
      schema_ok: true,
      missing: [],
    });
    confirmMock.mockResolvedValue(false);

    render(<DataRecovery />);
    await user.click(screen.getByRole("button", { name: "Choose Backup to Restore…" }));
    await screen.findByRole("button", { name: "Restore This Backup" });

    await user.click(screen.getByRole("button", { name: "Restore This Backup" }));

    expect(confirmMock).toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalledWith("restore_backup_command", expect.anything());
  });
});
