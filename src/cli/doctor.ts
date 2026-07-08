import { Database } from "bun:sqlite";
import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { brctlStatus, requestDownload } from "../indexer/icloud";

// Read-mostly diagnostic tool for the "why is this book stuck in
// sync-retry?" question. Runs brctl status and brctl download against a
// book and shows the *real* stdout/stderr/exit code — the same call the
// server makes silently in a background loop. Also updates
// sync_last_error / sync_retry_count so a subsequent web view reflects
// what we saw here.
//
// Usage:
//   farenheit doctor <id>              — diagnose one book by DB id
//   farenheit doctor --unsynced        — walk every unsynced book
//   farenheit doctor --failed          — walk only sync_failed books
//   farenheit doctor --file <relPath>  — by rel_path when you don't know the id

const argv = process.argv.slice(2);
const dbFlagIdx = argv.indexOf("--db");
const customDb = dbFlagIdx >= 0 ? argv[dbFlagIdx + 1] : null;
const booksFlagIdx = argv.indexOf("--books-dir");
const customBooks = booksFlagIdx >= 0 ? argv[booksFlagIdx + 1] : null;
const fileFlagIdx = argv.indexOf("--file");
const relPathArg = fileFlagIdx >= 0 ? argv[fileFlagIdx + 1] : null;
const listUnsynced = argv.includes("--unsynced");
const listFailed = argv.includes("--failed");

const dataDir = resolve(process.env.DATA_DIR ?? "./data");
const dbPath = customDb || join(dataDir, "farenheit.sqlite");
const booksDir = resolve(customBooks || process.env.BOOKS_DIR || "");

if (!existsSync(dbPath)) {
  console.error(`error: db not found at ${dbPath}`);
  console.error(`hint: pass --db <path> or set DATA_DIR`);
  process.exit(1);
}
if (!booksDir || !existsSync(booksDir)) {
  console.error(`error: books dir not found at ${booksDir || "(unset)"}`);
  console.error(`hint: pass --books-dir <path> or set BOOKS_DIR`);
  process.exit(1);
}

const db = new Database(dbPath);

type Row = {
  id: number;
  rel_path: string;
  filename: string;
  title: string;
  size_bytes: number;
  on_disk: number;
  sync_retry_count: number;
  sync_last_error: string | null;
  sync_last_attempted_at: number | null;
  sync_failed: number;
};

function loadTargets(): Row[] {
  if (relPathArg) {
    const row = db
      .query<Row, [string]>(`SELECT * FROM books WHERE rel_path = ?`)
      .get(relPathArg);
    return row ? [row] : [];
  }
  if (listFailed) {
    return db
      .query<Row, []>(`SELECT * FROM books WHERE sync_failed = 1 ORDER BY id`)
      .all();
  }
  if (listUnsynced) {
    return db
      .query<Row, []>(`SELECT * FROM books WHERE on_disk = 0 ORDER BY id`)
      .all();
  }
  // Positional id
  const idArg = argv.find((a) => /^\d+$/.test(a));
  if (!idArg) {
    console.error(
      "usage: farenheit doctor <id> | --unsynced | --failed | --file <relPath>",
    );
    process.exit(2);
  }
  const row = db
    .query<Row, [number]>(`SELECT * FROM books WHERE id = ?`)
    .get(Number.parseInt(idArg, 10));
  return row ? [row] : [];
}

const rows = loadTargets();
if (rows.length === 0) {
  console.error("no matching books");
  process.exit(1);
}

const updateOk = db.query<unknown, [number, string]>(
  `UPDATE books SET sync_last_attempted_at = ?, sync_last_error = NULL, sync_failed = 0 WHERE rel_path = ?`,
);
const updateFail = db.query<unknown, [number, string, string]>(
  `UPDATE books SET sync_retry_count = sync_retry_count + 1, sync_last_attempted_at = ?, sync_last_error = ? WHERE rel_path = ?`,
);

function indent(s: string): string {
  return s
    .split("\n")
    .map((l) => `      ${l}`)
    .join("\n");
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function relTime(ms: number | null): string {
  if (!ms) return "never";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86_400)}d ago`;
}

for (const row of rows) {
  const full = join(booksDir, row.rel_path);
  const exists = existsSync(full);
  console.log(`\n═══ #${row.id} · ${row.title} ═══`);
  console.log(`  rel_path       : ${row.rel_path}`);
  console.log(`  full path      : ${full}`);
  console.log(`  filesystem     : ${exists ? "exists" : "MISSING"}`);
  if (exists) {
    try {
      const st = statSync(full);
      const materialRatio = st.size === 0 ? 1 : (st.blocks * 512) / st.size;
      console.log(
        `  size (logical) : ${fmtBytes(st.size)} · blocks*512: ${fmtBytes(st.blocks * 512)} · ratio ${materialRatio.toFixed(2)}`,
      );
    } catch (e) {
      console.log(`  stat failed    : ${(e as Error).message}`);
    }
  }
  console.log(`  db size        : ${fmtBytes(row.size_bytes)}`);
  console.log(`  on_disk        : ${row.on_disk === 1}`);
  console.log(`  sync_failed    : ${row.sync_failed === 1}`);
  console.log(`  retry count    : ${row.sync_retry_count}`);
  console.log(`  last attempt   : ${relTime(row.sync_last_attempted_at)}`);
  console.log(`  last error     : ${row.sync_last_error ?? "(none)"}`);

  if (!exists) continue;

  console.log(`\n  → brctl status ${row.rel_path}`);
  const statusRes = await brctlStatus(full);
  console.log(`    exit ${statusRes.code}`);
  if (statusRes.stdout.trim()) console.log(indent(statusRes.stdout.trim()));
  if (statusRes.stderr.trim()) console.log("    stderr:\n" + indent(statusRes.stderr.trim()));

  console.log(`\n  → brctl download ${row.rel_path}`);
  const dlRes = await requestDownload(full);
  console.log(`    exit ${dlRes.code}`);
  if (dlRes.stdout.trim()) console.log(indent(dlRes.stdout.trim()));
  if (dlRes.stderr.trim()) console.log("    stderr:\n" + indent(dlRes.stderr.trim()));

  const now = Date.now();
  if (dlRes.code === 0) {
    updateOk.run(now, row.rel_path);
    console.log("    → recorded as ok (sync_failed cleared, last_error cleared)");
  } else {
    const msg = `code ${dlRes.code}: ${dlRes.stderr.trim().replace(/\s+/g, " ") || "(no stderr)"}`;
    updateFail.run(now, msg, row.rel_path);
    console.log(`    → recorded as failed (retry counter bumped)`);
  }
}

db.close();
