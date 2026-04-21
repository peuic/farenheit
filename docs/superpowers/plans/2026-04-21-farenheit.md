# Farenheit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local HTTP service that watches the iCloud `Livros` folder, indexes epubs with cover thumbnails, and serves them to the Kobo Clara Color's web browser with a list-based UI and per-device download tracking.

**Architecture:** Single Bun/TypeScript process with three isolated modules — Indexer (filesystem + epub parsing), Store (SQLite + cover cache), Server (Bun.serve + HTML templates). Indexer emits events that Store consumes; Server reads from Store. Runs as a macOS launchd user agent on port 1111.

**Tech Stack:** Bun, TypeScript, `bun:sqlite`, `chokidar` (watch), `sharp` (cover resize), `fflate` (epub zip), `fast-xml-parser` (OPF parse). Tests via `bun:test`.

**Prerequisites:** Bun installed (`/opt/homebrew/bin/bun`). If repo isn't initialized, run `git init` before Task 1 — commit steps in this plan assume a git repo. If you don't want to commit yet, skip the commit step at the end of each task; nothing else depends on it.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `README.md` (placeholder — full README in final task)
- Create empty dirs: `src/indexer/`, `src/store/`, `src/server/routes/`, `src/server/templates/`, `data/`, `tests/fixtures/`, `tests/unit/`, `tests/integration/`, `tests/e2e/`, `launchd/`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "farenheit",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun --watch run src/index.ts",
    "test": "bun test",
    "build-fixtures": "bun run tests/fixtures/build.ts"
  },
  "dependencies": {
    "chokidar": "^4.0.1",
    "fast-xml-parser": "^4.5.0",
    "fflate": "^0.8.2",
    "sharp": "^0.33.5"
  },
  "devDependencies": {
    "@types/bun": "^1.1.14",
    "typescript": "^5.6.3"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["bun-types"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true,
    "noUncheckedIndexedAccess": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
data/
.DS_Store
.superpowers/
*.log
.env
.env.local
bun.lockb
```

- [ ] **Step 4: Create placeholder README.md**

```markdown
# Farenheit

Local epub server for the Kobo browser. Watches the iCloud `Livros` folder and serves books over LAN with a list UI.

See `docs/superpowers/specs/2026-04-21-farenheit-design.md` for the design.

Setup instructions: (filled in at end of implementation)
```

- [ ] **Step 5: Create directory structure**

Run:
```bash
mkdir -p src/indexer src/store src/server/routes src/server/templates \
  data tests/fixtures tests/unit tests/integration tests/e2e launchd
```

- [ ] **Step 6: Install dependencies**

Run:
```bash
bun install
```

Expected: `bun.lockb` created, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore README.md bun.lockb
git commit -m "chore: project scaffold"
```

---

## Task 2: Config module

**Files:**
- Create: `src/config.ts`
- Create: `tests/unit/config.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/unit/config.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { loadConfig } from "../../src/config";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "farenheit-cfg-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("throws when BOOKS_DIR is missing", () => {
    expect(() => loadConfig({})).toThrow(/BOOKS_DIR/);
  });

  test("throws when BOOKS_DIR does not exist", () => {
    expect(() => loadConfig({ BOOKS_DIR: "/no/such/path/abc123" })).toThrow(/not found/i);
  });

  test("returns full config with defaults", () => {
    const cfg = loadConfig({ BOOKS_DIR: tmpDir });
    expect(cfg.booksDir).toBe(tmpDir);
    expect(cfg.port).toBe(1111);
    expect(cfg.host).toBe("0.0.0.0");
    expect(cfg.dataDir.endsWith("data")).toBe(true);
    expect(cfg.dbPath.endsWith("farenheit.sqlite")).toBe(true);
    expect(cfg.coversDir.endsWith("covers")).toBe(true);
  });

  test("env overrides apply", () => {
    const cfg = loadConfig({
      BOOKS_DIR: tmpDir,
      PORT: "2222",
      HOST: "127.0.0.1",
      DATA_DIR: tmpDir,
    });
    expect(cfg.port).toBe(2222);
    expect(cfg.host).toBe("127.0.0.1");
    expect(cfg.dataDir).toBe(tmpDir);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test tests/unit/config.test.ts`
Expected: FAIL — cannot find module `../../src/config`.

- [ ] **Step 3: Implement config.ts**

`src/config.ts`:

```typescript
import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

export type Config = {
  booksDir: string;
  dataDir: string;
  dbPath: string;
  coversDir: string;
  logPath: string;
  port: number;
  host: string;
};

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const booksDir = env.BOOKS_DIR;
  if (!booksDir) {
    throw new Error("BOOKS_DIR env var is required");
  }
  if (!existsSync(booksDir) || !statSync(booksDir).isDirectory()) {
    throw new Error(`BOOKS_DIR not found or not a directory: ${booksDir}`);
  }

  const dataDir = resolve(env.DATA_DIR ?? "./data");
  mkdirSync(dataDir, { recursive: true });
  const coversDir = join(dataDir, "covers");
  mkdirSync(coversDir, { recursive: true });

  const portStr = env.PORT ?? "1111";
  const port = Number.parseInt(portStr, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    throw new Error(`invalid PORT: ${portStr}`);
  }

  return {
    booksDir: resolve(booksDir),
    dataDir,
    dbPath: join(dataDir, "farenheit.sqlite"),
    coversDir,
    logPath: join(dataDir, "farenheit.log"),
    port,
    host: env.HOST ?? "0.0.0.0",
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test tests/unit/config.test.ts`
Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/unit/config.test.ts
git commit -m "feat(config): env parsing with defaults and validation"
```

---

## Task 3: Store types and schema

**Files:**
- Create: `src/store/types.ts`
- Create: `src/store/schema.ts`

- [ ] **Step 1: Define types**

`src/store/types.ts`:

```typescript
export type BookInput = {
  relPath: string;
  filename: string;
  title: string;
  author: string | null;
  description: string | null;
  category: string | null;
  coverFilename: string | null;
  sizeBytes: number;
  mtime: number;
};

export type Book = BookInput & {
  id: number;
  addedAt: number;
  indexedAt: number;
};

export type BookWithDownload = Book & {
  downloadedAt: number | null;
};

export type CategoryCount = {
  name: string;
  count: number;
};

export type Device = {
  id: string;
  label: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
};

export type ListOpts = {
  category?: string | null; // null = root; explicit string filters
  search?: string;
  sort?: "recent" | "title";
  deviceId?: string;
  limit?: number;
};
```

- [ ] **Step 2: Define schema + migrations**

`src/store/schema.ts`:

```typescript
import type { Database } from "bun:sqlite";

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS books (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  rel_path        TEXT    NOT NULL UNIQUE,
  filename        TEXT    NOT NULL,
  title           TEXT    NOT NULL,
  author          TEXT,
  description     TEXT,
  category        TEXT,
  cover_filename  TEXT,
  size_bytes      INTEGER NOT NULL,
  mtime           INTEGER NOT NULL,
  added_at        INTEGER NOT NULL,
  indexed_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_books_category ON books(category);
CREATE INDEX IF NOT EXISTS idx_books_added    ON books(added_at DESC);

CREATE TABLE IF NOT EXISTS devices (
  id              TEXT PRIMARY KEY,
  label           TEXT,
  first_seen_at   INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS downloads (
  device_id       TEXT    NOT NULL REFERENCES devices(id)  ON DELETE CASCADE,
  book_id         INTEGER NOT NULL REFERENCES books(id)    ON DELETE CASCADE,
  downloaded_at   INTEGER NOT NULL,
  PRIMARY KEY (device_id, book_id)
);
`;

export function migrate(db: Database): void {
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA_SQL);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/store/types.ts src/store/schema.ts
git commit -m "feat(store): types and SQL schema"
```

---

## Task 4: Store class (CRUD + devices + downloads)

**Files:**
- Create: `src/store/store.ts`
- Create: `tests/unit/store.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/store.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import type { BookInput } from "../../src/store/types";

function baseBook(overrides: Partial<BookInput> = {}): BookInput {
  return {
    relPath: "livro.epub",
    filename: "livro.epub",
    title: "Livro",
    author: "Autor",
    description: null,
    category: null,
    coverFilename: null,
    sizeBytes: 1024,
    mtime: 1000,
    ...overrides,
  };
}

describe("Store", () => {
  let tmp: string;
  let store: Store;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "farenheit-store-"));
    store = new Store(join(tmp, "test.sqlite"));
  });

  afterEach(() => {
    store.close();
    rmSync(tmp, { recursive: true, force: true });
  });

  test("upsert inserts a new book", () => {
    store.upsert(baseBook());
    const rows = store.list({});
    expect(rows).toHaveLength(1);
    expect(rows[0]!.title).toBe("Livro");
    expect(rows[0]!.id).toBeGreaterThan(0);
  });

  test("upsert updates on same relPath without changing id or addedAt", () => {
    store.upsert(baseBook({ title: "Old" }));
    const firstId = store.list({})[0]!.id;
    const firstAddedAt = store.list({})[0]!.addedAt;

    store.upsert(baseBook({ title: "New", mtime: 2000 }));
    const after = store.list({});
    expect(after).toHaveLength(1);
    expect(after[0]!.id).toBe(firstId);
    expect(after[0]!.addedAt).toBe(firstAddedAt);
    expect(after[0]!.title).toBe("New");
    expect(after[0]!.mtime).toBe(2000);
  });

  test("deleteByRelPath removes book and cascades downloads", () => {
    store.upsert(baseBook());
    const bookId = store.list({})[0]!.id;
    const device = store.ensureDevice("dev-1");
    store.markDownloaded(device.id, bookId);

    store.deleteByRelPath("livro.epub");
    expect(store.list({})).toHaveLength(0);
    store.upsert(baseBook());
    const rowsForDev = store.list({ deviceId: device.id });
    expect(rowsForDev[0]!.downloadedAt).toBeNull();
  });

  test("list filters by category", () => {
    store.upsert(baseBook({ relPath: "a.epub", category: null }));
    store.upsert(baseBook({ relPath: "ficcao/b.epub", category: "ficcao" }));
    store.upsert(baseBook({ relPath: "tecnicos/c.epub", category: "tecnicos" }));

    expect(store.list({ category: null })).toHaveLength(1);
    expect(store.list({ category: "ficcao" })).toHaveLength(1);
    expect(store.list({})).toHaveLength(3);
  });

  test("list search matches title OR author case-insensitively", () => {
    store.upsert(baseBook({ relPath: "a.epub", title: "Dom Casmurro", author: "Machado" }));
    store.upsert(baseBook({ relPath: "b.epub", title: "Sapiens",       author: "Harari" }));
    store.upsert(baseBook({ relPath: "c.epub", title: "Another",       author: "Dom X" }));

    const results = store.list({ search: "dom" });
    expect(results).toHaveLength(2);
  });

  test("list sort defaults to recent (added_at DESC)", () => {
    store.upsert(baseBook({ relPath: "a.epub", title: "A" }));
    const before = Date.now();
    while (Date.now() === before) { /* spin until a new ms */ }
    store.upsert(baseBook({ relPath: "b.epub", title: "B" }));
    const rows = store.list({});
    expect(rows[0]!.title).toBe("B");
    expect(rows[1]!.title).toBe("A");
  });

  test("listCategories returns names with counts (excludes root)", () => {
    store.upsert(baseBook({ relPath: "a.epub", category: null }));
    store.upsert(baseBook({ relPath: "ficcao/b.epub", category: "ficcao" }));
    store.upsert(baseBook({ relPath: "ficcao/c.epub", category: "ficcao" }));
    store.upsert(baseBook({ relPath: "tecnicos/d.epub", category: "tecnicos" }));

    const cats = store.listCategories();
    expect(cats).toEqual([
      { name: "ficcao",  count: 2 },
      { name: "tecnicos", count: 1 },
    ]);
  });

  test("ensureDevice creates on first call, reuses on second", () => {
    const d1 = store.ensureDevice("uuid-1");
    const d2 = store.ensureDevice("uuid-1");
    expect(d1.id).toBe("uuid-1");
    expect(d2.firstSeenAt).toBe(d1.firstSeenAt);
    expect(d2.lastSeenAt).toBeGreaterThanOrEqual(d1.lastSeenAt);
  });

  test("markDownloaded joins into list for deviceId", () => {
    store.upsert(baseBook({ relPath: "a.epub", title: "A" }));
    store.upsert(baseBook({ relPath: "b.epub", title: "B" }));
    const a = store.list({}).find(b => b.title === "A")!;

    const dev = store.ensureDevice("dev-1");
    store.markDownloaded(dev.id, a.id);

    const withDownload = store.list({ deviceId: dev.id });
    const aRow = withDownload.find(b => b.title === "A")!;
    const bRow = withDownload.find(b => b.title === "B")!;
    expect(aRow.downloadedAt).not.toBeNull();
    expect(bRow.downloadedAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `bun test tests/unit/store.test.ts`
Expected: FAIL — cannot find module `../../src/store/store`.

- [ ] **Step 3: Implement the Store class**

`src/store/store.ts`:

```typescript
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
        now, // added_at (ignored on conflict)
        now, // indexed_at
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
```

- [ ] **Step 4: Run tests — expect pass**

Run: `bun test tests/unit/store.test.ts`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/store/store.ts tests/unit/store.test.ts
git commit -m "feat(store): Store class with CRUD, search, devices and downloads"
```

---

## Task 5: Fixture builder

Build epub fixtures programmatically so we don't commit binary files. Fixtures are generated on demand.

**Files:**
- Create: `tests/fixtures/build.ts`
- Create: `tests/fixtures/source/valid/` (source files — see below)

- [ ] **Step 1: Create source skeletons**

Create folder `tests/fixtures/source/valid/` with these files:

`tests/fixtures/source/valid/mimetype`:
```
application/epub+zip
```

`tests/fixtures/source/valid/META-INF/container.xml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
```

`tests/fixtures/source/valid/OEBPS/content.opf`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="BookID" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookID">urn:uuid:valid-1</dc:identifier>
    <dc:title>Valid Title</dc:title>
    <dc:creator>Valid Author</dc:creator>
    <dc:description>A valid test description.</dc:description>
    <dc:language>en</dc:language>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover-image" href="cover.png" media-type="image/png" properties="cover-image"/>
    <item id="nav"         href="nav.xhtml"  media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1"         href="ch1.xhtml"  media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>
```

`tests/fixtures/source/valid/OEBPS/nav.xhtml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Nav</title></head>
  <body><nav epub:type="toc"><ol><li><a href="ch1.xhtml">Ch1</a></li></ol></nav></body>
</html>
```

`tests/fixtures/source/valid/OEBPS/ch1.xhtml`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head><title>Chapter 1</title></head>
  <body><p>Hello.</p></body>
</html>
```

- [ ] **Step 2: Write the build script**

`tests/fixtures/build.ts`:

```typescript
import { zipSync, strToU8 } from "fflate";
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import sharp from "sharp";

const FIXTURES = __dirname;
const SOURCE = join(FIXTURES, "source");
const OUT = FIXTURES;

function walkFiles(dir: string, base: string = dir): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(base, full).replace(/\\/g, "/");
    if (statSync(full).isDirectory()) {
      Object.assign(out, walkFiles(full, base));
    } else {
      out[rel] = readFileSync(full);
    }
  }
  return out;
}

async function buildValid(): Promise<void> {
  const src = join(SOURCE, "valid");
  const files = walkFiles(src);

  const cover = await sharp({
    create: { width: 600, height: 900, channels: 3, background: { r: 200, g: 50, b: 50 } },
  }).png().toBuffer();
  files["OEBPS/cover.png"] = cover;

  const zipData = zipSync(files, { level: 6, consume: true });
  writeFileSync(join(OUT, "valid.epub"), zipData);
}

async function buildNoCover(): Promise<void> {
  const src = join(SOURCE, "valid");
  const files = walkFiles(src);
  const opf = new TextDecoder().decode(files["OEBPS/content.opf"]!);
  const modifiedOpf = opf
    .replace(/<meta name="cover"[^/]*\/>/g, "")
    .replace(/<item id="cover-image"[^/]*\/>/g, "");
  files["OEBPS/content.opf"] = strToU8(modifiedOpf);
  delete files["OEBPS/cover.png"];
  const zipData = zipSync(files, { level: 6, consume: true });
  writeFileSync(join(OUT, "no-cover.epub"), zipData);
}

async function buildNoTitle(): Promise<void> {
  const src = join(SOURCE, "valid");
  const files = walkFiles(src);
  const opf = new TextDecoder().decode(files["OEBPS/content.opf"]!);
  const modifiedOpf = opf
    .replace(/<dc:title>[^<]*<\/dc:title>/, "")
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, "");
  files["OEBPS/content.opf"] = strToU8(modifiedOpf);
  const zipData = zipSync(files, { level: 6, consume: true });
  writeFileSync(join(OUT, "no-title.epub"), zipData);
}

async function buildCorrupted(): Promise<void> {
  writeFileSync(join(OUT, "corrupted.epub"), Buffer.from("not a zip, just garbage bytes\n"));
}

async function main() {
  if (!existsSync(SOURCE)) {
    throw new Error(`source fixtures missing at ${SOURCE}`);
  }
  await buildValid();
  await buildNoCover();
  await buildNoTitle();
  await buildCorrupted();
  console.log("fixtures built");
}

main();
```

- [ ] **Step 3: Build fixtures once**

Run: `bun run build-fixtures`
Expected: 4 files appear — `tests/fixtures/valid.epub`, `no-cover.epub`, `no-title.epub`, `corrupted.epub`.

- [ ] **Step 4: Add generated fixtures to .gitignore**

Append to `.gitignore`:
```
tests/fixtures/*.epub
```

Generated fixtures are rebuilt on demand; committing the source files is enough.

- [ ] **Step 5: Commit**

```bash
git add tests/fixtures/build.ts tests/fixtures/source .gitignore
git commit -m "test: epub fixture builder"
```

---

## Task 6: Epub parser

**Files:**
- Create: `src/indexer/parser.ts`
- Create: `tests/unit/parser.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/parser.test.ts`:

```typescript
import { describe, expect, test, beforeAll } from "bun:test";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseEpub } from "../../src/indexer/parser";

const FIXTURES = join(__dirname, "..", "fixtures");

describe("parseEpub", () => {
  beforeAll(() => {
    if (!existsSync(join(FIXTURES, "valid.epub"))) {
      const r = spawnSync("bun", ["run", "build-fixtures"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("failed to build fixtures");
    }
  });

  test("extracts title, author, description from valid.epub", async () => {
    const r = await parseEpub(join(FIXTURES, "valid.epub"));
    expect(r.title).toBe("Valid Title");
    expect(r.author).toBe("Valid Author");
    expect(r.description).toBe("A valid test description.");
    expect(r.cover).not.toBeNull();
    expect(r.cover!.mimeType).toBe("image/png");
    expect(r.cover!.data.byteLength).toBeGreaterThan(0);
  });

  test("returns null cover for no-cover.epub", async () => {
    const r = await parseEpub(join(FIXTURES, "no-cover.epub"));
    expect(r.title).toBe("Valid Title");
    expect(r.cover).toBeNull();
  });

  test("returns null title/author when metadata missing", async () => {
    const r = await parseEpub(join(FIXTURES, "no-title.epub"));
    expect(r.title).toBeNull();
    expect(r.author).toBeNull();
  });

  test("throws on corrupted epub", async () => {
    await expect(parseEpub(join(FIXTURES, "corrupted.epub"))).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun test tests/unit/parser.test.ts`
Expected: FAIL — cannot find module `../../src/indexer/parser`.

- [ ] **Step 3: Implement the parser**

`src/indexer/parser.ts`:

```typescript
import { readFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

export type ParsedCover = {
  data: Buffer;
  mimeType: string;
  extension: string;
};

export type ParsedEpub = {
  title: string | null;
  author: string | null;
  description: string | null;
  cover: ParsedCover | null;
};

const xml = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  isArray: (name) => ["item", "meta", "creator"].includes(name),
});

function findString(val: unknown): string | null {
  if (val == null) return null;
  if (typeof val === "string") return val.trim() || null;
  if (Array.isArray(val)) return findString(val[0]);
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return (obj["#text"] as string).trim() || null;
    for (const v of Object.values(obj)) {
      const s = findString(v);
      if (s) return s;
    }
  }
  return null;
}

export async function parseEpub(path: string): Promise<ParsedEpub> {
  const buf = readFileSync(path);
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(buf);
  } catch (e) {
    throw new Error(`not a valid epub (zip): ${path}: ${(e as Error).message}`);
  }

  const containerRaw = files["META-INF/container.xml"];
  if (!containerRaw) {
    throw new Error(`epub missing META-INF/container.xml: ${path}`);
  }
  const container = xml.parse(strFromU8(containerRaw));
  const opfPath: string | undefined =
    container?.container?.rootfiles?.rootfile?.["@_full-path"] ??
    container?.container?.rootfiles?.rootfile?.[0]?.["@_full-path"];
  if (!opfPath) {
    throw new Error(`epub OPF path not found: ${path}`);
  }

  const opfRaw = files[opfPath];
  if (!opfRaw) {
    throw new Error(`epub OPF file missing at ${opfPath}: ${path}`);
  }
  const opf = xml.parse(strFromU8(opfRaw));

  const meta = opf?.package?.metadata ?? {};
  const title = findString(meta.title);
  const author = findString(meta.creator);
  const description = findString(meta.description);

  // Cover lookup: (1) <meta name="cover" content="manifest-id">, then (2) manifest item with properties="cover-image".
  const manifest = opf?.package?.manifest?.item ?? [];
  const manifestArr: any[] = Array.isArray(manifest) ? manifest : [manifest];

  const metaArr: any[] = Array.isArray(meta.meta) ? meta.meta : meta.meta ? [meta.meta] : [];
  const coverMeta = metaArr.find((m) => m?.["@_name"] === "cover");
  const coverIdFromMeta: string | undefined = coverMeta?.["@_content"];

  const coverItem =
    manifestArr.find((it) => it?.["@_id"] === coverIdFromMeta) ??
    manifestArr.find((it) => (it?.["@_properties"] ?? "").includes("cover-image"));

  let cover: ParsedCover | null = null;
  if (coverItem?.["@_href"]) {
    const href: string = coverItem["@_href"];
    const opfDir = opfPath.includes("/") ? opfPath.replace(/\/[^/]+$/, "") : "";
    const coverPath = opfDir ? `${opfDir}/${href}` : href;
    const data = files[coverPath] ?? files[normalize(coverPath)];
    if (data) {
      const mimeType: string = coverItem["@_media-type"] ?? guessMime(href);
      cover = {
        data: Buffer.from(data),
        mimeType,
        extension: extFromMime(mimeType, href),
      };
    }
  }

  return { title, author, description, cover };
}

function normalize(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function guessMime(href: string): string {
  const lower = href.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "application/octet-stream";
}

function extFromMime(mime: string, href: string): string {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  const m = href.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1]! : "bin";
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `bun test tests/unit/parser.test.ts`
Expected: all 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/indexer/parser.ts tests/unit/parser.test.ts
git commit -m "feat(indexer): epub parser (title, author, description, cover)"
```

---

## Task 7: Cover processor

**Files:**
- Create: `src/indexer/cover.ts`
- Create: `tests/unit/cover.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/cover.test.ts`:

```typescript
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { processCover, COVER_MAX_WIDTH } from "../../src/indexer/cover";

describe("processCover", () => {
  let tmp: string;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "farenheit-cover-"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  test("resizes large image to max width and writes webp", async () => {
    const big = await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: { r: 120, g: 40, b: 40 } },
    }).png().toBuffer();

    const dest = join(tmp, "1.webp");
    await processCover(big, dest);

    expect(existsSync(dest)).toBe(true);
    const meta = await sharp(dest).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(COVER_MAX_WIDTH);
  });

  test("does not upscale small images", async () => {
    const small = await sharp({
      create: { width: 100, height: 150, channels: 3, background: { r: 0, g: 0, b: 0 } },
    }).png().toBuffer();

    const dest = join(tmp, "2.webp");
    await processCover(small, dest);

    const meta = await sharp(dest).metadata();
    expect(meta.width).toBe(100);
  });

  test("throws on invalid image buffer", async () => {
    const dest = join(tmp, "3.webp");
    await expect(processCover(Buffer.from("not an image"), dest)).rejects.toThrow();
    expect(existsSync(dest)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

Run: `bun test tests/unit/cover.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the cover processor**

`src/indexer/cover.ts`:

```typescript
import sharp from "sharp";

export const COVER_MAX_WIDTH = 400;

export async function processCover(
  imageBuffer: Buffer,
  destPath: string,
): Promise<void> {
  await sharp(imageBuffer)
    .resize({ width: COVER_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(destPath);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `bun test tests/unit/cover.test.ts`
Expected: all 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/indexer/cover.ts tests/unit/cover.test.ts
git commit -m "feat(indexer): cover resize to 400w webp"
```

---

## Task 8: iCloud dataless helper

macOS-specific: uses `brctl` to detect and materialize iCloud placeholder files. Uses `spawn` with an argv array — no shell invocation, no string interpolation into a command line — so filenames with spaces or special characters are safe.

**Files:**
- Create: `src/indexer/icloud.ts`
- Create: `tests/unit/icloud.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/icloud.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { isDatalessPlaceholder, ensureMaterialized, __setRunnerForTests } from "../../src/indexer/icloud";

describe("iCloud dataless", () => {
  test("isDatalessPlaceholder true when brctl reports placeholder", async () => {
    __setRunnerForTests(async () => ({ stdout: "isDataless = 1\n", code: 0 }));
    expect(await isDatalessPlaceholder("/x")).toBe(true);
  });

  test("isDatalessPlaceholder false otherwise", async () => {
    __setRunnerForTests(async () => ({ stdout: "isDataless = 0\n", code: 0 }));
    expect(await isDatalessPlaceholder("/x")).toBe(false);
  });

  test("isDatalessPlaceholder false when brctl fails", async () => {
    __setRunnerForTests(async () => ({ stdout: "", code: 1 }));
    expect(await isDatalessPlaceholder("/x")).toBe(false);
  });

  test("ensureMaterialized resolves when not dataless", async () => {
    __setRunnerForTests(async () => ({ stdout: "isDataless = 0\n", code: 0 }));
    await ensureMaterialized("/x", 1000);
    expect(true).toBe(true);
  });

  test("ensureMaterialized issues download and polls until not dataless", async () => {
    let calls = 0;
    __setRunnerForTests(async (command, args) => {
      calls++;
      if (command === "brctl" && args[0] === "download") {
        return { stdout: "", code: 0 };
      }
      // status calls — first two say placeholder, then clear
      if (calls <= 2) return { stdout: "isDataless = 1\n", code: 0 };
      return { stdout: "isDataless = 0\n", code: 0 };
    });
    await ensureMaterialized("/x", 2000);
    expect(calls).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun test tests/unit/icloud.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement (spawn with argv, no shell)**

`src/indexer/icloud.ts`:

```typescript
import { spawn } from "node:child_process";

type RunResult = { stdout: string; code: number };
type Runner = (command: string, args: string[]) => Promise<RunResult>;

async function defaultRunner(command: string, args: string[]): Promise<RunResult> {
  return await new Promise((resolve) => {
    const p = spawn(command, args, { shell: false });
    let stdout = "";
    p.stdout.on("data", (b) => (stdout += b.toString()));
    p.stderr.on("data", () => {});
    p.on("close", (code) => resolve({ stdout, code: code ?? 0 }));
    p.on("error", () => resolve({ stdout: "", code: 1 }));
  });
}

let runner: Runner = defaultRunner;
export function __setRunnerForTests(fn: Runner): void {
  runner = fn;
}

export async function isDatalessPlaceholder(path: string): Promise<boolean> {
  const r = await runner("brctl", ["status", path]);
  if (r.code !== 0) return false;
  return /isDataless\s*=\s*1/.test(r.stdout);
}

export async function ensureMaterialized(path: string, timeoutMs = 60_000): Promise<void> {
  if (!(await isDatalessPlaceholder(path))) return;
  await runner("brctl", ["download", path]);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isDatalessPlaceholder(path))) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for iCloud download: ${path}`);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `bun test tests/unit/icloud.test.ts`
Expected: all 5 pass.

- [ ] **Step 5: Commit**

```bash
git add src/indexer/icloud.ts tests/unit/icloud.test.ts
git commit -m "feat(indexer): iCloud dataless detection via brctl (no shell)"
```

---

## Task 9: Indexer — scanAll + watch + event emission

**Files:**
- Create: `src/indexer/indexer.ts`
- Create: `tests/integration/indexer-store.test.ts`

- [ ] **Step 1: Write the integration test**

`tests/integration/indexer-store.test.ts`:

```typescript
import { describe, expect, test, beforeAll, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, existsSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import { Indexer } from "../../src/indexer/indexer";

const FIXTURES = join(__dirname, "..", "fixtures");

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

describe("Indexer + Store", () => {
  let booksDir: string;
  let dataDir: string;
  let store: Store;
  let indexer: Indexer;

  beforeAll(() => {
    if (!existsSync(join(FIXTURES, "valid.epub"))) {
      const r = spawnSync("bun", ["run", "build-fixtures"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("failed to build fixtures");
    }
  });

  beforeEach(() => {
    booksDir = mkdtempSync(join(tmpdir(), "farenheit-books-"));
    dataDir = mkdtempSync(join(tmpdir(), "farenheit-data-"));
    mkdirSync(join(dataDir, "covers"), { recursive: true });
    store = new Store(join(dataDir, "test.sqlite"));
    indexer = new Indexer({
      booksDir,
      coversDir: join(dataDir, "covers"),
      store,
      skipICloudCheck: true,
    });
  });

  afterEach(async () => {
    await indexer.stop();
    store.close();
    rmSync(booksDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("scanAll indexes root epubs and subfolder epubs with category", async () => {
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "rootbook.epub"));
    mkdirSync(join(booksDir, "Ficcao"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "Ficcao", "other.epub"));

    await indexer.scanAll();

    const all = store.list({});
    expect(all).toHaveLength(2);
    const root = all.find((b) => b.filename === "rootbook.epub")!;
    expect(root.category).toBeNull();
    expect(root.title).toBe("Valid Title");
    expect(root.coverFilename).not.toBeNull();

    const sub = all.find((b) => b.filename === "other.epub")!;
    expect(sub.category).toBe("Ficcao");
  });

  test("scanAll falls back to filename when no title metadata", async () => {
    copyFileSync(join(FIXTURES, "no-title.epub"), join(booksDir, "anon.epub"));
    await indexer.scanAll();
    const books = store.list({});
    expect(books[0]!.title).toBe("anon.epub");
    expect(books[0]!.author).toBeNull();
  });

  test("scanAll handles corrupted epub without throwing", async () => {
    copyFileSync(join(FIXTURES, "corrupted.epub"), join(booksDir, "bad.epub"));
    await indexer.scanAll();
    const books = store.list({});
    expect(books).toHaveLength(1);
    expect(books[0]!.title).toBe("bad.epub");
    expect(books[0]!.coverFilename).toBeNull();
  });

  test("scanAll is idempotent on unchanged files", async () => {
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "book.epub"));
    await indexer.scanAll();
    const first = store.list({})[0]!;
    await indexer.scanAll();
    const second = store.list({})[0]!;
    expect(second.id).toBe(first.id);
  });

  test("watch picks up added file and removed file", async () => {
    await indexer.scanAll();
    indexer.watch();
    await wait(300);

    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "new.epub"));
    for (let i = 0; i < 40; i++) {
      if (store.list({}).length === 1) break;
      await wait(150);
    }
    expect(store.list({})).toHaveLength(1);

    unlinkSync(join(booksDir, "new.epub"));
    for (let i = 0; i < 40; i++) {
      if (store.list({}).length === 0) break;
      await wait(150);
    }
    expect(store.list({})).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun test tests/integration/indexer-store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Indexer**

`src/indexer/indexer.ts`:

```typescript
import { readdirSync, statSync, existsSync, type Stats } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { parseEpub } from "./parser";
import { processCover } from "./cover";
import { ensureMaterialized } from "./icloud";
import type { Store } from "../store/store";
import type { BookInput } from "../store/types";

export type IndexerDeps = {
  booksDir: string;
  coversDir: string;
  store: Store;
  skipICloudCheck?: boolean; // disable brctl calls in tests
};

export class Indexer {
  private watcher: FSWatcher | null = null;

  constructor(private deps: IndexerDeps) {}

  async scanAll(): Promise<void> {
    const files = this.walk(this.deps.booksDir);
    for (const full of files) {
      await this.handleAdd(full);
    }
  }

  watch(): void {
    if (this.watcher) return;
    this.watcher = chokidar.watch(this.deps.booksDir, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      depth: 10,
    });
    this.watcher.on("add", (p) => {
      if (p.toLowerCase().endsWith(".epub")) void this.handleAdd(p);
    });
    this.watcher.on("change", (p) => {
      if (p.toLowerCase().endsWith(".epub")) void this.handleAdd(p);
    });
    this.watcher.on("unlink", (p) => {
      if (p.toLowerCase().endsWith(".epub")) {
        const rel = relative(this.deps.booksDir, p);
        this.deps.store.deleteByRelPath(rel);
      }
    });
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }

  private walk(dir: string): string[] {
    const out: string[] = [];
    if (!existsSync(dir)) return out;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...this.walk(full));
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".epub")) out.push(full);
    }
    return out;
  }

  private async handleAdd(fullPath: string): Promise<void> {
    try {
      if (!this.deps.skipICloudCheck) {
        try {
          await ensureMaterialized(fullPath, 60_000);
        } catch (e) {
          console.warn(`[indexer] iCloud materialization failed for ${fullPath}: ${(e as Error).message}`);
          return;
        }
      }

      let st: Stats;
      try {
        st = statSync(fullPath);
      } catch {
        return;
      }

      const relPath = relative(this.deps.booksDir, fullPath);
      const firstSegment = relPath.split(sep)[0];
      const hasSubdir = relPath.includes(sep);
      const category = hasSubdir ? firstSegment ?? null : null;
      const filename = basename(fullPath);
      const mtime = Math.floor(st.mtimeMs);

      let parseResult;
      try {
        parseResult = await parseEpub(fullPath);
      } catch (e) {
        console.warn(`[indexer] parse failed for ${fullPath}: ${(e as Error).message}`);
        this.deps.store.upsert({
          relPath,
          filename,
          title: filename,
          author: null,
          description: null,
          category,
          coverFilename: null,
          sizeBytes: st.size,
          mtime,
        });
        return;
      }

      const title = parseResult.title ?? filename;
      let coverFilename: string | null = null;
      if (parseResult.cover) {
        const safeBase = relPath.replace(/[^\w.-]+/g, "_");
        const coverFile = `${safeBase}.webp`;
        const destPath = join(this.deps.coversDir, coverFile);
        try {
          await processCover(parseResult.cover.data, destPath);
          coverFilename = coverFile;
        } catch (e) {
          console.warn(`[indexer] cover resize failed for ${fullPath}: ${(e as Error).message}`);
          coverFilename = null;
        }
      }

      const input: BookInput = {
        relPath,
        filename,
        title,
        author: parseResult.author,
        description: parseResult.description,
        category,
        coverFilename,
        sizeBytes: st.size,
        mtime,
      };
      this.deps.store.upsert(input);
    } catch (e) {
      console.warn(`[indexer] unexpected error handling ${fullPath}: ${(e as Error).message}`);
    }
  }
}
```

- [ ] **Step 4: Run tests — expect pass**

Run: `bun test tests/integration/indexer-store.test.ts`
Expected: all 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/indexer/indexer.ts tests/integration/indexer-store.test.ts
git commit -m "feat(indexer): scanAll + chokidar watch wired to Store"
```

---

## Task 10: Server — cookie helpers

**Files:**
- Create: `src/server/cookies.ts`
- Create: `tests/unit/cookies.test.ts`

- [ ] **Step 1: Write the failing tests**

`tests/unit/cookies.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { parseDeviceCookie, buildSetCookieHeader, DEVICE_COOKIE_NAME } from "../../src/server/cookies";

describe("cookies", () => {
  test("parseDeviceCookie returns null when header absent", () => {
    expect(parseDeviceCookie(null)).toBeNull();
    expect(parseDeviceCookie("")).toBeNull();
  });

  test("parseDeviceCookie finds the right cookie among multiple", () => {
    const header = `foo=1; ${DEVICE_COOKIE_NAME}=abc-123; bar=2`;
    expect(parseDeviceCookie(header)).toBe("abc-123");
  });

  test("parseDeviceCookie returns null when cookie absent", () => {
    expect(parseDeviceCookie("foo=1; bar=2")).toBeNull();
  });

  test("buildSetCookieHeader has long max-age and SameSite=Lax", () => {
    const h = buildSetCookieHeader("uuid-xyz");
    expect(h).toContain(`${DEVICE_COOKIE_NAME}=uuid-xyz`);
    expect(h).toContain("Max-Age=31536000");
    expect(h).toContain("SameSite=Lax");
    expect(h).toContain("Path=/");
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun test tests/unit/cookies.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/server/cookies.ts`:

```typescript
export const DEVICE_COOKIE_NAME = "fh_device";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1 year

export function parseDeviceCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((p) => p.trim());
  for (const part of parts) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name === DEVICE_COOKIE_NAME && value.length > 0) return value;
  }
  return null;
}

export function buildSetCookieHeader(deviceId: string): string {
  return [
    `${DEVICE_COOKIE_NAME}=${deviceId}`,
    `Max-Age=${MAX_AGE_SECONDS}`,
    "Path=/",
    "SameSite=Lax",
    "HttpOnly",
  ].join("; ");
}
```

- [ ] **Step 4: Run — expect pass**

Run: `bun test tests/unit/cookies.test.ts`
Expected: all 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/cookies.ts tests/unit/cookies.test.ts
git commit -m "feat(server): device cookie helpers"
```

---

## Task 11: Server — layout template + styles

**Files:**
- Create: `src/server/templates/layout.ts`

- [ ] **Step 1: Implement layout**

`src/server/templates/layout.ts`:

```typescript
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const BASE_CSS = `
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: #f6f4ef;
  color: #111;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 18px;
  line-height: 1.4;
}
body { padding: 12px 14px 32px; max-width: 720px; margin: 0 auto; }
a { color: #111; text-decoration: underline; }
a:active { color: #555; }
h1 { font-size: 22px; margin: 0 0 4px; }
h2 { font-size: 18px; margin: 18px 0 8px; border-bottom: 1px solid #888; padding-bottom: 4px; }
.sub { color: #555; font-size: 14px; margin: 0 0 10px; }
.categories { font-size: 15px; margin-bottom: 10px; }
.categories a { margin-right: 10px; display: inline-block; padding: 6px 0; }
.book-list { list-style: none; margin: 0; padding: 0; }
.book-list li { padding: 12px 0; border-bottom: 1px dotted #999; }
.book-list a {
  display: flex; align-items: center; gap: 12px;
  text-decoration: none; color: inherit;
  min-height: 70px;
}
.book-list .cover {
  width: 48px; height: 72px; flex-shrink: 0;
  background: #ccc;
  object-fit: cover;
  border-radius: 2px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.25);
}
.book-list .cover.placeholder {
  display: flex; align-items: center; justify-content: center;
  font-size: 10px; color: #666; text-align: center; padding: 4px;
}
.book-list .meta .title { font-weight: bold; }
.book-list .meta .author { color: #555; font-size: 14px; margin-top: 2px; }
.book-list li.downloaded { opacity: 0.45; }
.book-list li.downloaded .title::after { content: " ✓"; }
.nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 14px; }
.search input[type="text"] {
  width: 100%; padding: 12px; font-size: 18px;
  border: 2px solid #222; border-radius: 3px; background: white;
}
.search button {
  margin-top: 8px; padding: 12px 16px; font-size: 16px;
  background: #111; color: white; border: none; border-radius: 3px;
}
.detail .cover-big {
  display: block; margin: 16px auto; max-width: 240px;
  box-shadow: 0 3px 8px rgba(0,0,0,0.25);
  border-radius: 3px;
}
.detail .cover-big.placeholder {
  width: 200px; height: 300px;
  display: flex; align-items: center; justify-content: center;
  background: #ddd; color: #666;
}
.detail h1 { text-align: center; font-size: 22px; margin-top: 12px; }
.detail .author { text-align: center; font-style: italic; color: #444; margin: 4px 0 10px; }
.detail .filemeta { text-align: center; font-size: 13px; color: #666; padding-bottom: 12px; border-bottom: 1px dotted #999; }
.detail .description { margin: 16px 0; text-align: justify; font-size: 16px; line-height: 1.5; }
.download-btn {
  display: block; width: 100%; padding: 18px;
  background: #111; color: white;
  font-size: 17px; font-weight: bold; letter-spacing: 0.05em;
  text-align: center; text-decoration: none;
  border-radius: 3px;
  text-transform: uppercase;
}
.download-btn.done {
  background: transparent; color: #333; border: 2px solid #555;
  padding: 16px; font-weight: normal;
}
.empty { color: #666; text-align: center; padding: 40px 0; }
`;

export function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/templates/layout.ts
git commit -m "feat(server): layout template + CSS"
```

---

## Task 12: Server — content templates (home, book, search, 404)

**Files:**
- Create: `src/server/templates/home.ts`
- Create: `src/server/templates/book.ts`
- Create: `src/server/templates/search.ts`
- Create: `src/server/templates/notFound.ts`

- [ ] **Step 1: Implement home.ts**

`src/server/templates/home.ts`:

```typescript
import { escapeHtml, layout } from "./layout";
import type { BookWithDownload, CategoryCount } from "../../store/types";

type Opts = {
  pageTitle: string;
  heading: string;
  subHeading?: string;
  backHref?: string;
  categories?: CategoryCount[];
  books: BookWithDownload[];
};

export function renderHome(o: Opts): string {
  const categoriesHtml = (o.categories ?? []).length
    ? `<h2>Categorias</h2>
       <div class="categories">
         ${o.categories!.map(c =>
           `<a href="/c/${encodeURIComponent(c.name)}">${escapeHtml(c.name)} (${c.count})</a>`
         ).join("")}
       </div>`
    : "";

  const bookItems = o.books.length
    ? `<ul class="book-list">
         ${o.books.map(b => renderBookItem(b)).join("")}
       </ul>`
    : `<p class="empty">Nenhum livro por aqui.</p>`;

  const body = `
<div class="nav">
  ${o.backHref ? `<a href="${escapeHtml(o.backHref)}">← Voltar</a>` : `<span></span>`}
  <span><a href="/search">Buscar</a></span>
</div>
<h1>${escapeHtml(o.heading)}</h1>
${o.subHeading ? `<p class="sub">${escapeHtml(o.subHeading)}</p>` : ""}
${categoriesHtml}
<h2>Livros${o.backHref ? "" : " na raiz"}</h2>
${bookItems}
`;
  return layout(o.pageTitle, body);
}

function renderBookItem(b: BookWithDownload): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover" src="/book/${b.id}/cover?v=${b.mtime}" alt="">`
    : `<div class="cover placeholder">sem capa</div>`;
  const authorHtml = b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : "";
  const cls = b.downloadedAt ? "downloaded" : "";
  return `
<li class="${cls}">
  <a href="/book/${b.id}">
    ${coverHtml}
    <div class="meta">
      <div class="title">${escapeHtml(b.title)}</div>
      ${authorHtml}
    </div>
  </a>
</li>`;
}
```

- [ ] **Step 2: Implement book.ts**

`src/server/templates/book.ts`:

```typescript
import { escapeHtml, layout } from "./layout";
import type { BookWithDownload } from "../../store/types";

export function renderBook(b: BookWithDownload, backHref: string): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover-big" src="/book/${b.id}/cover?v=${b.mtime}" alt="">`
    : `<div class="cover-big placeholder">sem capa</div>`;

  const filemetaParts = [
    "epub",
    formatSize(b.sizeBytes),
    b.downloadedAt ? `baixado ${formatRelTime(b.downloadedAt)}` : `adicionado ${formatRelTime(b.addedAt)}`,
  ];

  const descriptionHtml = b.description
    ? `<div class="description">${escapeHtml(b.description)}</div>`
    : "";

  const btnClass = b.downloadedAt ? "download-btn done" : "download-btn";
  const btnText = b.downloadedAt ? "⬇  Baixar novamente" : "⬇  Baixar no Kobo";

  const body = `
<div class="nav">
  <a href="${escapeHtml(backHref)}">← Voltar</a>
  <a href="/">Farenheit</a>
</div>
<div class="detail">
  ${coverHtml}
  <h1>${escapeHtml(b.title)}</h1>
  ${b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : ""}
  <div class="filemeta">${filemetaParts.join(" · ")}</div>
  ${descriptionHtml}
  <a class="${btnClass}" href="/book/${b.id}/download">${btnText}</a>
</div>
`;
  return layout(b.title, body);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelTime(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "hoje";
  if (diff < 2 * day) return "ontem";
  const days = Math.floor(diff / day);
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}
```

- [ ] **Step 3: Implement search.ts**

`src/server/templates/search.ts`:

```typescript
import { escapeHtml, layout } from "./layout";
import { renderHome } from "./home";
import type { BookWithDownload } from "../../store/types";

export function renderSearchPage(query: string, results: BookWithDownload[]): string {
  const form = `
<div class="nav">
  <a href="/">← Voltar</a>
  <span>Buscar</span>
</div>
<form class="search" method="get" action="/search">
  <input type="text" name="q" value="${escapeHtml(query)}" placeholder="título ou autor" autofocus>
  <button type="submit">Buscar</button>
</form>
`;

  if (!query) {
    return layout("Buscar — Farenheit", form);
  }

  const resultsDoc = renderHome({
    pageTitle: `Busca: ${query}`,
    heading: `Resultados para "${query}"`,
    subHeading: `${results.length} ${results.length === 1 ? "livro" : "livros"}`,
    books: results,
    backHref: undefined,
  });

  const bodyMatch = resultsDoc.match(/<body>([\s\S]*?)<\/body>/);
  const bodyInner = bodyMatch ? bodyMatch[1]! : "";
  const withoutNav = bodyInner.replace(/<div class="nav">[\s\S]*?<\/div>\s*/, "");

  return layout(`Busca: ${query}`, form + withoutNav);
}
```

- [ ] **Step 4: Implement notFound.ts**

`src/server/templates/notFound.ts`:

```typescript
import { layout } from "./layout";

export function renderNotFound(): string {
  const body = `
<div class="nav">
  <a href="/">← Voltar pra home</a>
  <span></span>
</div>
<h1>Página não encontrada</h1>
<p class="sub">Esse caminho não existe no Farenheit.</p>
`;
  return layout("404 — Farenheit", body);
}
```

- [ ] **Step 5: Commit**

```bash
git add src/server/templates/home.ts src/server/templates/book.ts \
        src/server/templates/search.ts src/server/templates/notFound.ts
git commit -m "feat(server): content templates (home, book, search, 404)"
```

---

## Task 13: Server — route handlers

**Files:**
- Create: `src/server/routes/context.ts`
- Create: `src/server/routes/home.ts`
- Create: `src/server/routes/category.ts`
- Create: `src/server/routes/book.ts`
- Create: `src/server/routes/cover.ts`
- Create: `src/server/routes/download.ts`
- Create: `src/server/routes/search.ts`

- [ ] **Step 1: Shared route context type**

`src/server/routes/context.ts`:

```typescript
import type { Store } from "../../store/store";
import type { Config } from "../../config";

export type Ctx = {
  store: Store;
  config: Config;
  deviceId: string;
  skipICloudCheckOnDownload?: boolean;
};
```

- [ ] **Step 2: Home route + html helper**

`src/server/routes/home.ts`:

```typescript
import { renderHome } from "../templates/home";
import type { Ctx } from "./context";

export function handleHome(ctx: Ctx): Response {
  const categories = ctx.store.listCategories();
  const totalBooks = ctx.store.list({}).length;
  const rootBooks = ctx.store.list({
    category: null,
    deviceId: ctx.deviceId,
    limit: 50,
  });
  const html = renderHome({
    pageTitle: "Farenheit",
    heading: "Farenheit",
    subHeading: `${totalBooks} ${totalBooks === 1 ? "livro" : "livros"}`,
    categories,
    books: rootBooks,
  });
  return htmlResponse(html);
}

export function htmlResponse(html: string, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
```

- [ ] **Step 3: Category route**

`src/server/routes/category.ts`:

```typescript
import { renderHome } from "../templates/home";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

export function handleCategory(ctx: Ctx, categoryName: string): Response {
  const books = ctx.store.list({
    category: categoryName,
    deviceId: ctx.deviceId,
  });
  const html = renderHome({
    pageTitle: `${categoryName} — Farenheit`,
    heading: categoryName,
    subHeading: `${books.length} ${books.length === 1 ? "livro" : "livros"}`,
    books,
    backHref: "/",
  });
  return htmlResponse(html);
}
```

- [ ] **Step 4: Book detail route**

`src/server/routes/book.ts`:

```typescript
import { renderBook } from "../templates/book";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

export function handleBook(ctx: Ctx, idStr: string): Response {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);
  const book = ctx.store.getById(id);
  if (!book) return htmlResponse(renderNotFound(), 404);

  const listed = ctx.store.list({ deviceId: ctx.deviceId });
  const withDl = listed.find((b) => b.id === id) ?? book;

  const backHref = book.category ? `/c/${encodeURIComponent(book.category)}` : "/";
  return htmlResponse(renderBook(withDl, backHref));
}
```

- [ ] **Step 5: Cover route**

`src/server/routes/cover.ts`:

```typescript
import { join } from "node:path";
import { existsSync } from "node:fs";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

export function handleCover(ctx: Ctx, idStr: string): Response {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);
  const book = ctx.store.getById(id);
  if (!book || !book.coverFilename) return new Response("no cover", { status: 404 });

  const path = join(ctx.config.coversDir, book.coverFilename);
  if (!existsSync(path)) return new Response("missing cover file", { status: 404 });

  return new Response(Bun.file(path), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=2592000, immutable",
    },
  });
}
```

- [ ] **Step 6: Download route**

`src/server/routes/download.ts`:

```typescript
import { join } from "node:path";
import { existsSync } from "node:fs";
import { renderNotFound } from "../templates/notFound";
import { htmlResponse } from "./home";
import { ensureMaterialized } from "../../indexer/icloud";
import type { Ctx } from "./context";

export async function handleDownload(ctx: Ctx, idStr: string): Promise<Response> {
  const id = Number.parseInt(idStr, 10);
  if (Number.isNaN(id)) return htmlResponse(renderNotFound(), 404);

  const book = ctx.store.getById(id);
  if (!book) return htmlResponse(renderNotFound(), 404);

  const fullPath = join(ctx.config.booksDir, book.relPath);
  if (!existsSync(fullPath)) {
    return new Response("file not found on disk", { status: 410 });
  }

  if (!ctx.skipICloudCheckOnDownload) {
    try {
      await ensureMaterialized(fullPath, 60_000);
    } catch (e) {
      return new Response(`iCloud download failed: ${(e as Error).message}`, { status: 503 });
    }
  }

  ctx.store.markDownloaded(ctx.deviceId, book.id);

  return new Response(Bun.file(fullPath), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(book.filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 7: Search route**

`src/server/routes/search.ts`:

```typescript
import { renderSearchPage } from "../templates/search";
import { htmlResponse } from "./home";
import type { Ctx } from "./context";

export function handleSearch(ctx: Ctx, query: string): Response {
  const q = query.trim();
  const results = q
    ? ctx.store.list({ search: q, deviceId: ctx.deviceId })
    : [];
  return htmlResponse(renderSearchPage(q, results));
}
```

- [ ] **Step 8: Commit**

```bash
git add src/server/routes
git commit -m "feat(server): route handlers"
```

---

## Task 14: Server — dispatcher (Bun.serve) + integration test

**Files:**
- Create: `src/server/server.ts`
- Create: `tests/integration/server-routes.test.ts`

- [ ] **Step 1: Write the failing integration test**

`tests/integration/server-routes.test.ts`:

```typescript
import { describe, expect, test, beforeAll, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../../src/store/store";
import { Indexer } from "../../src/indexer/indexer";
import { startServer } from "../../src/server/server";
import type { Server } from "bun";

const FIXTURES = join(__dirname, "..", "fixtures");

describe("server routes", () => {
  let booksDir: string;
  let dataDir: string;
  let store: Store;
  let indexer: Indexer;
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    if (!existsSync(join(FIXTURES, "valid.epub"))) {
      const r = spawnSync("bun", ["run", "build-fixtures"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("failed to build fixtures");
    }
  });

  beforeEach(async () => {
    booksDir = mkdtempSync(join(tmpdir(), "farenheit-books-"));
    dataDir = mkdtempSync(join(tmpdir(), "farenheit-data-"));
    const coversDir = join(dataDir, "covers");
    mkdirSync(coversDir, { recursive: true });

    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "root-book.epub"));
    mkdirSync(join(booksDir, "Ficcao"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "Ficcao", "sub-book.epub"));

    store = new Store(join(dataDir, "test.sqlite"));
    indexer = new Indexer({ booksDir, coversDir, store, skipICloudCheck: true });
    await indexer.scanAll();

    const config = {
      booksDir,
      dataDir,
      dbPath: join(dataDir, "test.sqlite"),
      coversDir,
      logPath: join(dataDir, "test.log"),
      port: 0,
      host: "127.0.0.1",
    };
    server = startServer({ config, store, skipICloudCheckOnDownload: true });
    baseUrl = `http://${server.hostname}:${server.port}`;
  });

  afterEach(async () => {
    server.stop(true);
    await indexer.stop();
    store.close();
    rmSync(booksDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("GET / returns HTML with books and category", async () => {
    const r = await fetch(baseUrl);
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(body).toContain("Farenheit");
    expect(body).toContain("Ficcao");
  });

  test("GET / sets device cookie on first visit", async () => {
    const r = await fetch(baseUrl);
    const setCookie = r.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("fh_device=");
  });

  test("GET /c/:category lists only that category", async () => {
    const r = await fetch(`${baseUrl}/c/Ficcao`);
    const body = await r.text();
    expect(r.status).toBe(200);
    // Title from fixture metadata; both books have the same title, so check the heading instead.
    expect(body).toContain("Ficcao");
    expect(body).not.toContain("Nenhum livro por aqui");
  });

  test("GET /book/:id returns detail with Baixar button", async () => {
    const first = store.list({})[0]!;
    const r = await fetch(`${baseUrl}/book/${first.id}`);
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(body).toContain("Baixar no Kobo");
  });

  test("GET /book/:id/download returns epub bytes and marks downloaded", async () => {
    const first = store.list({})[0]!;
    const r = await fetch(`${baseUrl}/book/${first.id}/download`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/epub+zip");
    const buf = await r.arrayBuffer();
    expect(buf.byteLength).toBeGreaterThan(0);

    const setCookie = r.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    const cookieHeader = setCookie!.split(";")[0]!;
    const r2 = await fetch(baseUrl, { headers: { cookie: cookieHeader } });
    const body2 = await r2.text();
    expect(body2).toContain("downloaded"); // CSS class on <li>
  });

  test("GET /search?q=... returns filtered results", async () => {
    const r = await fetch(`${baseUrl}/search?q=Valid`);
    const body = await r.text();
    expect(r.status).toBe(200);
    expect(body).toContain("Valid Title");
  });

  test("GET /does-not-exist returns 404", async () => {
    const r = await fetch(`${baseUrl}/no-such-path`);
    expect(r.status).toBe(404);
  });

  test("GET /book/:id/cover returns webp", async () => {
    const first = store.list({})[0]!;
    const r = await fetch(`${baseUrl}/book/${first.id}/cover?v=${first.mtime}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
  });
});
```

- [ ] **Step 2: Run — expect failure**

Run: `bun test tests/integration/server-routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the server**

`src/server/server.ts`:

```typescript
import type { Server } from "bun";
import type { Config } from "../config";
import type { Store } from "../store/store";
import { parseDeviceCookie, buildSetCookieHeader } from "./cookies";
import { randomUUID } from "node:crypto";
import { handleHome, htmlResponse } from "./routes/home";
import { handleCategory } from "./routes/category";
import { handleBook } from "./routes/book";
import { handleCover } from "./routes/cover";
import { handleDownload } from "./routes/download";
import { handleSearch } from "./routes/search";
import { renderNotFound } from "./templates/notFound";
import type { Ctx } from "./routes/context";

export type ServerDeps = {
  config: Config;
  store: Store;
  skipICloudCheckOnDownload?: boolean; // for tests
};

export function startServer(deps: ServerDeps): Server {
  const { config, store } = deps;

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
      const { deviceId, setCookieHeader } = resolveDevice(req, store);
      const ctx: Ctx = {
        store,
        config,
        deviceId,
        skipICloudCheckOnDownload: deps.skipICloudCheckOnDownload,
      };

      let res: Response;
      try {
        res = await route(ctx, req, url);
      } catch (e) {
        console.error(`[server] error on ${url.pathname}:`, e);
        res = new Response("internal error", { status: 500 });
      }

      if (setCookieHeader) {
        const h = new Headers(res.headers);
        h.append("Set-Cookie", setCookieHeader);
        res = new Response(res.body, { status: res.status, headers: h });
      }
      return res;
    },
  });

  return server;
}

function resolveDevice(req: Request, store: Store): { deviceId: string; setCookieHeader: string | null } {
  const cookieId = parseDeviceCookie(req.headers.get("cookie"));
  if (cookieId) {
    store.ensureDevice(cookieId);
    return { deviceId: cookieId, setCookieHeader: null };
  }
  const fresh = randomUUID();
  store.ensureDevice(fresh);
  return { deviceId: fresh, setCookieHeader: buildSetCookieHeader(fresh) };
}

async function route(ctx: Ctx, req: Request, url: URL): Promise<Response> {
  const p = url.pathname;

  if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
  if (p === "/") return handleHome(ctx);
  if (p === "/search") return handleSearch(ctx, url.searchParams.get("q") ?? "");

  let m: RegExpMatchArray | null;

  m = p.match(/^\/c\/([^/]+)\/?$/);
  if (m) return handleCategory(ctx, decodeURIComponent(m[1]!));

  m = p.match(/^\/book\/(\d+)\/?$/);
  if (m) return handleBook(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/cover\/?$/);
  if (m) return handleCover(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/download\/?$/);
  if (m) return handleDownload(ctx, m[1]!);

  return htmlResponse(renderNotFound(), 404);
}
```

- [ ] **Step 4: Run integration tests — expect pass**

Run: `bun test tests/integration/server-routes.test.ts`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/server.ts src/server/routes/context.ts tests/integration/server-routes.test.ts
git commit -m "feat(server): Bun.serve dispatcher with device cookie"
```

---

## Task 15: Entry point + LAN IP logging

**Files:**
- Create: `src/index.ts`

- [ ] **Step 1: Implement entry**

`src/index.ts`:

```typescript
import { networkInterfaces } from "node:os";
import { loadConfig } from "./config";
import { Store } from "./store/store";
import { Indexer } from "./indexer/indexer";
import { startServer } from "./server/server";

function findLanIps(): string[] {
  const out: string[] = [];
  const ifs = networkInterfaces();
  for (const list of Object.values(ifs)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family === "IPv4" && !info.internal) out.push(info.address);
    }
  }
  return out;
}

async function main() {
  const config = loadConfig();
  console.log(`[farenheit] BOOKS_DIR=${config.booksDir}`);
  console.log(`[farenheit] DATA_DIR=${config.dataDir}`);

  const store = new Store(config.dbPath);
  const indexer = new Indexer({
    booksDir: config.booksDir,
    coversDir: config.coversDir,
    store,
  });

  console.log("[farenheit] initial scan…");
  const t0 = Date.now();
  await indexer.scanAll();
  console.log(`[farenheit] scan done in ${Date.now() - t0}ms`);

  indexer.watch();

  const server = startServer({ config, store });
  const ips = findLanIps();
  console.log(`[farenheit] listening on ${server.hostname}:${server.port}`);
  for (const ip of ips) {
    console.log(`[farenheit]   → http://${ip}:${server.port}`);
  }

  const shutdown = async (sig: string) => {
    console.log(`[farenheit] ${sig} received, shutting down…`);
    server.stop(true);
    await indexer.stop();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[farenheit] fatal:", e);
  process.exit(1);
});
```

- [ ] **Step 2: Smoke test**

```bash
mkdir -p /tmp/farenheit-smoke/Livros /tmp/farenheit-smoke/data
cp tests/fixtures/valid.epub /tmp/farenheit-smoke/Livros/test.epub

BOOKS_DIR=/tmp/farenheit-smoke/Livros DATA_DIR=/tmp/farenheit-smoke/data \
  PORT=11111 HOST=127.0.0.1 \
  timeout 3 bun run src/index.ts || true
```

Expected log lines include:
- `[farenheit] BOOKS_DIR=...`
- `[farenheit] initial scan…`
- `[farenheit] scan done in Xms`
- `[farenheit] listening on 127.0.0.1:11111`

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "feat: entry point with scan, watch, serve, graceful shutdown"
```

---

## Task 16: End-to-end test

**Files:**
- Create: `tests/e2e/full-flow.test.ts`

- [ ] **Step 1: Write the E2E test**

`tests/e2e/full-flow.test.ts`:

```typescript
import { describe, expect, test, beforeAll, beforeEach, afterEach } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, mkdirSync, copyFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "bun";

import { loadConfig } from "../../src/config";
import { Store } from "../../src/store/store";
import { Indexer } from "../../src/indexer/indexer";
import { startServer } from "../../src/server/server";

const FIXTURES = join(__dirname, "..", "fixtures");

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

describe("E2E — full flow", () => {
  let booksDir: string;
  let dataDir: string;
  let store: Store;
  let indexer: Indexer;
  let server: Server;
  let baseUrl: string;

  beforeAll(() => {
    if (!existsSync(join(FIXTURES, "valid.epub"))) {
      const r = spawnSync("bun", ["run", "build-fixtures"], { stdio: "inherit" });
      if (r.status !== 0) throw new Error("failed to build fixtures");
    }
  });

  beforeEach(async () => {
    booksDir = mkdtempSync(join(tmpdir(), "farenheit-e2e-books-"));
    dataDir = mkdtempSync(join(tmpdir(), "farenheit-e2e-data-"));
    mkdirSync(join(dataDir, "covers"), { recursive: true });

    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "one.epub"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "two.epub"));
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "three.epub"));

    const config = loadConfig({
      BOOKS_DIR: booksDir,
      DATA_DIR: dataDir,
      PORT: "0",
      HOST: "127.0.0.1",
    });
    store = new Store(config.dbPath);
    indexer = new Indexer({
      booksDir: config.booksDir,
      coversDir: config.coversDir,
      store,
      skipICloudCheck: true,
    });
    await indexer.scanAll();
    indexer.watch();

    server = startServer({ config, store, skipICloudCheckOnDownload: true });
    baseUrl = `http://${server.hostname}:${server.port}`;
    await wait(200);
  });

  afterEach(async () => {
    server.stop(true);
    await indexer.stop();
    store.close();
    rmSync(booksDir, { recursive: true, force: true });
    rmSync(dataDir, { recursive: true, force: true });
  });

  test("full flow: list, download, mark, reload, add file", async () => {
    // 1. home has 3 books
    let r = await fetch(baseUrl);
    let body = await r.text();
    expect(body).toContain("3 livros");

    // 2. download first book
    const first = store.list({})[0]!;
    r = await fetch(`${baseUrl}/book/${first.id}/download`);
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")!.split(";")[0]!;

    // 3. reload home with cookie — one book is marked downloaded
    r = await fetch(baseUrl, { headers: { cookie } });
    body = await r.text();
    expect(body).toContain("downloaded");

    // 4. add a 4th epub to the watched folder
    copyFileSync(join(FIXTURES, "valid.epub"), join(booksDir, "four.epub"));
    for (let i = 0; i < 40; i++) {
      const list = store.list({});
      if (list.length === 4) break;
      await wait(150);
    }
    expect(store.list({})).toHaveLength(4);

    r = await fetch(baseUrl, { headers: { cookie } });
    body = await r.text();
    expect(body).toContain("4 livros");
  });
});
```

- [ ] **Step 2: Run — expect pass**

Run: `bun test tests/e2e/full-flow.test.ts`
Expected: passes (single test exercises scan → download → cookie → mark → add → watcher → reload).

- [ ] **Step 3: Full test suite**

Run: `bun test`
Expected: all unit + integration + e2e pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/full-flow.test.ts
git commit -m "test: end-to-end flow"
```

---

## Task 17: launchd plist + setup docs

**Files:**
- Create: `launchd/com.farenheit.plist.template`
- Create: `launchd/install.sh`
- Modify: `README.md` (replace placeholder with full docs)

- [ ] **Step 1: Create the plist template**

`launchd/com.farenheit.plist.template`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.farenheit</string>
  <key>ProgramArguments</key>
  <array>
    <string>__BUN_PATH__</string>
    <string>run</string>
    <string>__PROJECT_DIR__/src/index.ts</string>
  </array>
  <key>WorkingDirectory</key>
  <string>__PROJECT_DIR__</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key>
  <string>__PROJECT_DIR__/data/farenheit.log</string>
  <key>StandardErrorPath</key>
  <string>__PROJECT_DIR__/data/farenheit.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>BOOKS_DIR</key>
    <string>__BOOKS_DIR__</string>
    <key>PORT</key>
    <string>1111</string>
    <key>DATA_DIR</key>
    <string>__PROJECT_DIR__/data</string>
  </dict>
</dict>
</plist>
```

- [ ] **Step 2: Create the install script**

`launchd/install.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.."; pwd)"
BUN_PATH="$(command -v bun || echo /opt/homebrew/bin/bun)"
BOOKS_DIR_DEFAULT="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Livros"
BOOKS_DIR="${BOOKS_DIR:-$BOOKS_DIR_DEFAULT}"

if [[ ! -d "$BOOKS_DIR" ]]; then
  echo "error: BOOKS_DIR does not exist: $BOOKS_DIR" >&2
  echo "set BOOKS_DIR env var and re-run, e.g.:" >&2
  echo "  BOOKS_DIR=/path/to/Livros ./launchd/install.sh" >&2
  exit 1
fi

OUT="$HOME/Library/LaunchAgents/com.farenheit.plist"
mkdir -p "$(dirname "$OUT")"

sed \
  -e "s|__PROJECT_DIR__|$PROJECT_DIR|g" \
  -e "s|__BUN_PATH__|$BUN_PATH|g" \
  -e "s|__BOOKS_DIR__|$BOOKS_DIR|g" \
  "$PROJECT_DIR/launchd/com.farenheit.plist.template" > "$OUT"

echo "wrote $OUT"

launchctl unload "$OUT" 2>/dev/null || true
launchctl load "$OUT"

echo "installed. Check status:"
echo "  launchctl list | grep farenheit"
echo "  tail -f $PROJECT_DIR/data/farenheit.log"
```

Make it executable:
```bash
chmod +x launchd/install.sh
```

- [ ] **Step 3: Write the full README**

`README.md`:

````markdown
# Farenheit

Local HTTP service that watches your iCloud `Livros` folder and serves epubs to the Kobo's experimental web browser. List-style UI, per-device download tracking, capas em cor.

Design: `docs/superpowers/specs/2026-04-21-farenheit-design.md`

## Requirements

- macOS (watcher uses filesystem events; download path uses `brctl` for iCloud dataless)
- [Bun](https://bun.sh) (install via Homebrew: `brew install oven-sh/bun/bun`)
- iCloud Drive enabled with a `Livros` folder containing `.epub` files

## Quick start (manual run)

```bash
bun install
bun run build-fixtures          # one-time: builds test fixtures

BOOKS_DIR="$HOME/Library/Mobile Documents/com~apple~CloudDocs/Livros" \
  bun run start
```

Output includes the LAN URL, e.g. `http://10.0.0.31:1111`.

## Run tests

```bash
bun test
```

## Run as a macOS service (launchd)

```bash
./launchd/install.sh
```

Override the books dir:
```bash
BOOKS_DIR="/path/to/Livros" ./launchd/install.sh
```

Operations:
```bash
launchctl list | grep farenheit                              # status
launchctl unload ~/Library/LaunchAgents/com.farenheit.plist  # stop
launchctl load   ~/Library/LaunchAgents/com.farenheit.plist  # start
tail -f data/farenheit.log                                   # logs
```

## Accessing from the Kobo

1. Mac on the same wifi as the Kobo.
2. Find the LAN IP in `data/farenheit.log` (line `→ http://10.0.0.x:1111`).
3. On the Kobo: **More → Settings → Beta Features → Web Browser**.
4. Type the URL. Bookmark for next time.
5. Tap a book → tap **Baixar no Kobo** → epub downloads and appears in the library.

## Configuration

Env vars:

| var          | default                                          | notes                              |
|--------------|--------------------------------------------------|------------------------------------|
| `BOOKS_DIR`  | _required_                                       | path to your Livros folder         |
| `PORT`       | `1111`                                           | HTTP port                          |
| `HOST`       | `0.0.0.0`                                        | bind host                          |
| `DATA_DIR`   | `./data`                                         | SQLite + covers + log location     |

## Project layout

```
src/
  indexer/    # scan folder + parse epubs + build covers
  store/      # SQLite persistence
  server/     # Bun.serve + templates + routes
tests/        # unit / integration / e2e
launchd/      # macOS service install
```
````

- [ ] **Step 4: Final smoke test**

```bash
mkdir -p /tmp/farenheit-smoke/Livros
cp tests/fixtures/valid.epub /tmp/farenheit-smoke/Livros/book.epub

BOOKS_DIR=/tmp/farenheit-smoke/Livros DATA_DIR=/tmp/farenheit-smoke/data \
  PORT=11111 HOST=127.0.0.1 \
  bun run start &

SERVER_PID=$!
sleep 1

curl -si http://127.0.0.1:11111/ | head -20
curl -si http://127.0.0.1:11111/search?q=valid | head -20

kill $SERVER_PID || true
wait 2>/dev/null || true
```

Expected: both responses are `200 OK` with HTML content.

- [ ] **Step 5: Commit**

```bash
git add launchd/com.farenheit.plist.template launchd/install.sh README.md
git commit -m "docs: launchd install + full README"
```

---

## Self-review checklist (for the implementer)

When you finish the plan, run:

```bash
bun test
```

Verify:

- [ ] All three buckets pass: `tests/unit/`, `tests/integration/`, `tests/e2e/`.
- [ ] `bun run start` (with `BOOKS_DIR` set) boots, scans, logs a LAN URL.
- [ ] Hitting `GET /` from another device on the LAN renders the list.
- [ ] Adding an epub to `BOOKS_DIR` makes it appear after a few seconds without restarting.
- [ ] Removing an epub makes it disappear.
- [ ] Downloading the same book twice from the same device keeps it marked as downloaded (cookie roundtrip).
- [ ] `launchctl load ~/Library/LaunchAgents/com.farenheit.plist` starts the service; killing the process shows it restart (`KeepAlive`).

Spec coverage: every section of `docs/superpowers/specs/2026-04-21-farenheit-design.md` has a corresponding task above.
