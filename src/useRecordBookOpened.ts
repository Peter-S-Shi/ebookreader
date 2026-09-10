import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/// FC-A11 (`DESIGN.md` SS4 "Continue Reading"): records real open recency
/// once per Reader mount, so Continue Reading can rank by "last actually
/// opened" instead of import order or another heuristic.
export function useRecordBookOpened(bookId: string) {
  useEffect(() => {
    invoke("record_book_opened_command", { bookId, openedAt: new Date().toISOString() }).catch(() => {});
  }, [bookId]);
}
