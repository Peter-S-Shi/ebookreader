//! Collections and Tags: user-controlled Book organization.
//!
//! Per `PRODUCT_SPEC.md` SS3.3, Collections/Tags are canonical user data,
//! not derived/rebuildable state -- same durability guarantee as Notes or
//! Book Hours. SS4.3: a Book may belong to multiple Collections. SS4.4: a
//! Tag is a descriptive label and does not drive Book Hours (this module
//! carries no Book Hours coupling).

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
}

pub fn create_collection(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
    conn.execute("INSERT INTO collection (id, name) VALUES (?1, ?2)", (id, name))?;
    Ok(())
}

pub fn rename_collection(conn: &Connection, id: &str, name: &str) -> rusqlite::Result<()> {
    conn.execute("UPDATE collection SET name = ?1 WHERE id = ?2", (name, id))?;
    Ok(())
}

/// Deletes the Collection and its Book memberships. Books themselves, and
/// every other kind of canonical user data attached to them, are
/// untouched -- a Collection is only a grouping.
pub fn delete_collection(conn: &Connection, id: &str) -> rusqlite::Result<()> {
    conn.execute("DELETE FROM book_collection WHERE collection_id = ?1", [id])?;
    conn.execute("DELETE FROM collection WHERE id = ?1", [id])?;
    Ok(())
}

pub fn list_collections(conn: &Connection) -> rusqlite::Result<Vec<Collection>> {
    let mut stmt = conn.prepare("SELECT id, name FROM collection ORDER BY name")?;
    let rows = stmt.query_map([], |row| Ok(Collection { id: row.get(0)?, name: row.get(1)? }))?;
    rows.collect()
}

/// Adds `book_id` to `collection_id`. Idempotent: adding an already-member
/// Book again is a no-op, not an error (`PRODUCT_SPEC.md` SS4.3 "may
/// belong to multiple Collections" implies membership is a set, not a log).
pub fn add_book_to_collection(conn: &Connection, book_id: &str, collection_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "INSERT OR IGNORE INTO book_collection (book_id, collection_id) VALUES (?1, ?2)",
        (book_id, collection_id),
    )?;
    Ok(())
}

pub fn remove_book_from_collection(conn: &Connection, book_id: &str, collection_id: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM book_collection WHERE book_id = ?1 AND collection_id = ?2",
        (book_id, collection_id),
    )?;
    Ok(())
}

/// `book_id`s of every Book currently in `collection_id`, for the caller
/// to cross-reference against its own already-loaded Library listing.
pub fn list_book_ids_in_collection(conn: &Connection, collection_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare("SELECT book_id FROM book_collection WHERE collection_id = ?1")?;
    let rows = stmt.query_map([collection_id], |row| row.get(0))?;
    rows.collect()
}

pub fn list_collections_for_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Vec<Collection>> {
    let mut stmt = conn.prepare(
        "SELECT collection.id, collection.name
         FROM collection JOIN book_collection ON book_collection.collection_id = collection.id
         WHERE book_collection.book_id = ?1
         ORDER BY collection.name",
    )?;
    let rows = stmt.query_map([book_id], |row| Ok(Collection { id: row.get(0)?, name: row.get(1)? }))?;
    rows.collect()
}

fn get_or_create_tag(conn: &Connection, name: &str) -> rusqlite::Result<String> {
    let existing: Option<String> =
        conn.query_row("SELECT id FROM tag WHERE name = ?1", [name], |row| row.get(0)).optional()?;
    if let Some(id) = existing {
        return Ok(id);
    }
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute("INSERT INTO tag (id, name) VALUES (?1, ?2)", (&id, name))?;
    Ok(id)
}

/// Applies `tag_name` to `book_id`, creating the Tag if this is its first
/// use. Idempotent, matching Collection membership semantics.
pub fn add_tag_to_book(conn: &Connection, book_id: &str, tag_name: &str) -> rusqlite::Result<()> {
    let tag_id = get_or_create_tag(conn, tag_name)?;
    conn.execute("INSERT OR IGNORE INTO book_tag (book_id, tag_id) VALUES (?1, ?2)", (book_id, &tag_id))?;
    Ok(())
}

/// Removes `tag_name` from `book_id`. The Tag itself (and its application
/// to any other Book) is untouched even if this was its last use --
/// deleting the label itself is a separate, explicit operation.
pub fn remove_tag_from_book(conn: &Connection, book_id: &str, tag_name: &str) -> rusqlite::Result<()> {
    conn.execute(
        "DELETE FROM book_tag WHERE book_id = ?1 AND tag_id = (SELECT id FROM tag WHERE name = ?2)",
        (book_id, tag_name),
    )?;
    Ok(())
}

pub fn list_tags_for_book(conn: &Connection, book_id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT tag.name FROM tag JOIN book_tag ON book_tag.tag_id = tag.id
         WHERE book_tag.book_id = ?1
         ORDER BY tag.name",
    )?;
    let rows = stmt.query_map([book_id], |row| row.get(0))?;
    rows.collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::run_migrations;

    fn conn_with_book(book_id: &str) -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        run_migrations(&conn).unwrap();
        conn.execute("INSERT INTO book (id, title) VALUES (?1, 'A Book')", [book_id]).unwrap();
        conn
    }

    #[test]
    fn a_book_can_belong_to_multiple_collections() {
        let conn = conn_with_book("book-1");
        create_collection(&conn, "col-fiction", "Fiction").unwrap();
        create_collection(&conn, "col-favorites", "Favorites").unwrap();

        add_book_to_collection(&conn, "book-1", "col-fiction").unwrap();
        add_book_to_collection(&conn, "book-1", "col-favorites").unwrap();

        let mut names: Vec<String> = list_collections_for_book(&conn, "book-1").unwrap().into_iter().map(|c| c.name).collect();
        names.sort();
        assert_eq!(names, vec!["Favorites".to_string(), "Fiction".to_string()]);
    }

    #[test]
    fn adding_a_book_to_the_same_collection_twice_is_a_no_op() {
        let conn = conn_with_book("book-1");
        create_collection(&conn, "col-1", "Reading Now").unwrap();

        add_book_to_collection(&conn, "book-1", "col-1").unwrap();
        add_book_to_collection(&conn, "book-1", "col-1").unwrap();

        assert_eq!(list_book_ids_in_collection(&conn, "col-1").unwrap(), vec!["book-1".to_string()]);
    }

    #[test]
    fn removing_a_book_from_a_collection_leaves_other_memberships_intact() {
        let conn = conn_with_book("book-1");
        create_collection(&conn, "col-a", "A").unwrap();
        create_collection(&conn, "col-b", "B").unwrap();
        add_book_to_collection(&conn, "book-1", "col-a").unwrap();
        add_book_to_collection(&conn, "book-1", "col-b").unwrap();

        remove_book_from_collection(&conn, "book-1", "col-a").unwrap();

        let names: Vec<String> = list_collections_for_book(&conn, "book-1").unwrap().into_iter().map(|c| c.name).collect();
        assert_eq!(names, vec!["B".to_string()]);
    }

    #[test]
    fn renaming_a_collection_is_visible_to_every_member_book() {
        let conn = conn_with_book("book-1");
        create_collection(&conn, "col-1", "Old Name").unwrap();
        add_book_to_collection(&conn, "book-1", "col-1").unwrap();

        rename_collection(&conn, "col-1", "New Name").unwrap();

        assert_eq!(list_collections_for_book(&conn, "book-1").unwrap()[0].name, "New Name");
    }

    #[test]
    fn deleting_a_collection_removes_its_memberships_but_not_the_book() {
        let conn = conn_with_book("book-1");
        create_collection(&conn, "col-1", "Temporary").unwrap();
        add_book_to_collection(&conn, "book-1", "col-1").unwrap();

        delete_collection(&conn, "col-1").unwrap();

        assert!(list_collections(&conn).unwrap().is_empty());
        let title: String = conn.query_row("SELECT title FROM book WHERE id = 'book-1'", [], |r| r.get(0)).unwrap();
        assert_eq!(title, "A Book", "deleting a Collection must not delete its member Books");
    }

    #[test]
    fn tagging_a_book_creates_the_tag_on_first_use_and_reuses_it_after() {
        let conn = conn_with_book("book-1");
        conn.execute("INSERT INTO book (id, title) VALUES ('book-2', 'Another Book')", []).unwrap();

        add_tag_to_book(&conn, "book-1", "favorites").unwrap();
        add_tag_to_book(&conn, "book-2", "favorites").unwrap();

        let tag_count: i64 = conn.query_row("SELECT COUNT(*) FROM tag WHERE name = 'favorites'", [], |r| r.get(0)).unwrap();
        assert_eq!(tag_count, 1, "the same tag name applied to two Books must not create two Tag rows");
        assert_eq!(list_tags_for_book(&conn, "book-1").unwrap(), vec!["favorites".to_string()]);
        assert_eq!(list_tags_for_book(&conn, "book-2").unwrap(), vec!["favorites".to_string()]);
    }

    #[test]
    fn removing_a_tag_from_one_book_does_not_affect_another_books_tagging() {
        let conn = conn_with_book("book-1");
        conn.execute("INSERT INTO book (id, title) VALUES ('book-2', 'Another Book')", []).unwrap();
        add_tag_to_book(&conn, "book-1", "to-read").unwrap();
        add_tag_to_book(&conn, "book-2", "to-read").unwrap();

        remove_tag_from_book(&conn, "book-1", "to-read").unwrap();

        assert!(list_tags_for_book(&conn, "book-1").unwrap().is_empty());
        assert_eq!(list_tags_for_book(&conn, "book-2").unwrap(), vec!["to-read".to_string()]);
    }

    #[test]
    fn tagging_a_book_twice_with_the_same_tag_is_a_no_op() {
        let conn = conn_with_book("book-1");
        add_tag_to_book(&conn, "book-1", "reread").unwrap();
        add_tag_to_book(&conn, "book-1", "reread").unwrap();

        assert_eq!(list_tags_for_book(&conn, "book-1").unwrap(), vec!["reread".to_string()]);
    }
}
