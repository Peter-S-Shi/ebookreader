import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";

interface BookSummary {
  book_id: string;
  title: string;
  path: string;
  format: string;
  ownership_mode: string;
  available: boolean;
}

function App() {
  const [books, setBooks] = useState<BookSummary[] | null>(null);

  const refreshLibrary = useCallback(async () => {
    const result = await invoke<BookSummary[]>("list_library_command");
    setBooks(result);
  }, []);

  useEffect(() => {
    refreshLibrary();
  }, [refreshLibrary]);

  async function importBook() {
    const path = await open({
      multiple: false,
      filters: [{ name: "Books", extensions: ["epub", "pdf", "txt"] }],
    });
    if (!path || Array.isArray(path)) {
      return;
    }
    await invoke("import_book_command", { path, ownershipMode: "reference" });
    await refreshLibrary();
  }

  async function removeBook(bookId: string) {
    await invoke("remove_book_command", { bookId });
    await refreshLibrary();
  }

  return (
    <main className="container">
      <h1>EbookReader</h1>

      <section aria-label="Library">
        <button type="button" onClick={importBook}>
          Import Book
        </button>

        {books === null ? null : books.length === 0 ? (
          <p>Library is empty. Import a book to get started.</p>
        ) : (
          <ul>
            {books.map((book) => (
              <li key={book.book_id}>
                {book.title}
                {!book.available && <span> — Needs Relink</span>}
                <button type="button" onClick={() => removeBook(book.book_id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

export default App;
