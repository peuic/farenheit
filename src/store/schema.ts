import type { Database } from "bun:sqlite";

export const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS books (
    id                        INTEGER PRIMARY KEY AUTOINCREMENT,
    rel_path                  TEXT    NOT NULL UNIQUE,
    filename                  TEXT    NOT NULL,
    title                     TEXT    NOT NULL,
    author                    TEXT,
    description               TEXT,
    category                  TEXT,
    cover_filename            TEXT,
    size_bytes                INTEGER NOT NULL,
    mtime                     INTEGER NOT NULL,
    added_at                  INTEGER NOT NULL,
    indexed_at                INTEGER NOT NULL,
    on_disk                   INTEGER NOT NULL DEFAULT 1,
    sync_retry_count          INTEGER NOT NULL DEFAULT 0,
    sync_last_error           TEXT,
    sync_last_attempted_at    INTEGER,
    sync_failed               INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS idx_books_category ON books(category)`,
  `CREATE INDEX IF NOT EXISTS idx_books_added    ON books(added_at DESC)`,
  `CREATE TABLE IF NOT EXISTS devices (
    id              TEXT PRIMARY KEY,
    label           TEXT,
    first_seen_at   INTEGER NOT NULL,
    last_seen_at    INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS downloads (
    device_id       TEXT    NOT NULL REFERENCES devices(id)  ON DELETE CASCADE,
    book_id         INTEGER NOT NULL REFERENCES books(id)    ON DELETE CASCADE,
    downloaded_at   INTEGER NOT NULL,
    PRIMARY KEY (device_id, book_id)
  )`,
];

function hasColumn(db: Database, table: string, column: string): boolean {
  const rows = db.query(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return rows.some((r) => r.name === column);
}

export function migrate(db: Database): void {
  db.run("PRAGMA foreign_keys = ON");
  for (const stmt of SCHEMA_STATEMENTS) {
    db.run(stmt);
  }
  // Additive migrations — safe to run repeatedly.
  if (!hasColumn(db, "books", "on_disk")) {
    db.run("ALTER TABLE books ADD COLUMN on_disk INTEGER NOT NULL DEFAULT 1");
  }
  if (!hasColumn(db, "books", "sync_retry_count")) {
    db.run("ALTER TABLE books ADD COLUMN sync_retry_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn(db, "books", "sync_last_error")) {
    db.run("ALTER TABLE books ADD COLUMN sync_last_error TEXT");
  }
  if (!hasColumn(db, "books", "sync_last_attempted_at")) {
    db.run("ALTER TABLE books ADD COLUMN sync_last_attempted_at INTEGER");
  }
  if (!hasColumn(db, "books", "sync_failed")) {
    db.run("ALTER TABLE books ADD COLUMN sync_failed INTEGER NOT NULL DEFAULT 0");
  }
}
