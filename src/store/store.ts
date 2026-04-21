import { Database } from "bun:sqlite";
import { randomUUID } from "node:crypto";
import { migrate } from "./schema";
import type {
  Book,
  BookInput,
  BookWithDownload,
  CategoryCount,
  Device,
  ListOpts,
} from "./types";

const rowToBook = (r: any): Book => ({
  id: r.id,
  relPath: r.rel_path,
  filename: r.filename,
  title: r.title,
  author: r.author,
  description: r.description,
  category: r.category,
  coverFilename: r.cover_filename,
  sizeBytes: r.size_bytes,
  mtime: r.mtime,
  addedAt: r.added_at,
  indexedAt: r.indexed_at,
});

const rowToBookWithDl = (r: any): BookWithDownload => ({
  ...rowToBook(r),
  downloadedAt: r.downloaded_at ?? null,
});

export class Store {
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    migrate(this.db);
  }

  close(): void {
    this.db.close();
  }

  upsert(input: BookInput): void {
    const now = Date.now();
    this.db.run(
      `
      INSERT INTO books
        (rel_path, filename, title, author, description, category, cover_filename, size_bytes, mtime, added_at, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(rel_path) DO UPDATE SET
        filename       = excluded.filename,
        title          = excluded.title,
        author         = excluded.author,
        description    = excluded.description,
        category       = excluded.category,
        cover_filename = excluded.cover_filename,
        size_bytes     = excluded.size_bytes,
        mtime          = excluded.mtime,
        indexed_at     = excluded.indexed_at
      `,
      [
        input.relPath,
        input.filename,
        input.title,
        input.author,
        input.description,
        input.category,
        input.coverFilename,
        input.sizeBytes,
        input.mtime,
        now,
        now,
      ],
    );
  }

  deleteByRelPath(relPath: string): void {
    this.db.run(`DELETE FROM books WHERE rel_path = ?`, [relPath]);
  }

  getById(id: number): BookWithDownload | null {
    const row = this.db
      .query(`SELECT *, NULL AS downloaded_at FROM books WHERE id = ?`)
      .get(id);
    return row ? rowToBookWithDl(row) : null;
  }

  list(opts: ListOpts): BookWithDownload[] {
    const where: string[] = [];
    const params: unknown[] = [];

    if (opts.category === null) {
      where.push("b.category IS NULL");
    } else if (typeof opts.category === "string") {
      where.push("b.category = ?");
      params.push(opts.category);
    }

    if (opts.search) {
      where.push(
        "(LOWER(b.title) LIKE ? OR LOWER(IFNULL(b.author,'')) LIKE ?)",
      );
      const needle = `%${opts.search.toLowerCase()}%`;
      params.push(needle, needle);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const orderSql =
      opts.sort === "title"
        ? "ORDER BY LOWER(b.title) ASC"
        : "ORDER BY b.added_at DESC";
    const limitSql = opts.limit ? `LIMIT ${Number(opts.limit)}` : "";

    const join = opts.deviceId
      ? "LEFT JOIN downloads d ON d.book_id = b.id AND d.device_id = ?"
      : "";
    if (opts.deviceId) params.unshift(opts.deviceId);

    const selectDl = opts.deviceId ? "d.downloaded_at" : "NULL AS downloaded_at";

    const sql = `
      SELECT b.*, ${selectDl}
      FROM books b
      ${join}
      ${whereSql}
      ${orderSql}
      ${limitSql}
    `;

    return this.db.query(sql).all(...(params as any[])).map(rowToBookWithDl);
  }

  listCategories(): CategoryCount[] {
    const rows = this.db
      .query(
        `SELECT category AS name, COUNT(*) AS count
         FROM books
         WHERE category IS NOT NULL
         GROUP BY category
         ORDER BY category ASC`,
      )
      .all() as { name: string; count: number }[];
    return rows;
  }

  ensureDevice(cookieId: string): Device {
    const now = Date.now();
    const existing = this.db
      .query(`SELECT * FROM devices WHERE id = ?`)
      .get(cookieId) as any;
    if (existing) {
      this.db.run(`UPDATE devices SET last_seen_at = ? WHERE id = ?`, [now, cookieId]);
      return {
        id: existing.id,
        label: existing.label,
        firstSeenAt: existing.first_seen_at,
        lastSeenAt: now,
      };
    }
    this.db.run(
      `INSERT INTO devices (id, label, first_seen_at, last_seen_at) VALUES (?, NULL, ?, ?)`,
      [cookieId, now, now],
    );
    return { id: cookieId, label: null, firstSeenAt: now, lastSeenAt: now };
  }

  markDownloaded(deviceId: string, bookId: number): void {
    const now = Date.now();
    this.db.run(
      `
      INSERT INTO downloads (device_id, book_id, downloaded_at)
      VALUES (?, ?, ?)
      ON CONFLICT(device_id, book_id) DO UPDATE SET downloaded_at = excluded.downloaded_at
      `,
      [deviceId, bookId, now],
    );
  }
}

export function newDeviceId(): string {
  return randomUUID();
}
