import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

// Read-only stats CLI for the Farenheit SQLite DB. Aggregates only — no
// writes, no schema changes. Safe to run while the server is up.

const argv = process.argv.slice(2);
const dbFlagIdx = argv.indexOf("--db");
const customDb = dbFlagIdx >= 0 ? argv[dbFlagIdx + 1] : null;
const deviceFlagIdx = argv.indexOf("--device");
const devicePrefix = deviceFlagIdx >= 0 ? argv[deviceFlagIdx + 1] : null;
const dataDir = resolve(process.env.DATA_DIR ?? "./data");
const dbPath = customDb || join(dataDir, "farenheit.sqlite");

if (!existsSync(dbPath)) {
  console.error(`error: db not found at ${dbPath}`);
  console.error(`hint: pass --db <path> or set DATA_DIR`);
  process.exit(1);
}

const db = new Database(dbPath, { readonly: true });

const NOW = Date.now();
const DAY = 24 * 60 * 60 * 1000;
const startOfToday = (() => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
})();
const sevenDaysAgo = NOW - 7 * DAY;
const thirtyDaysAgo = NOW - 30 * DAY;

// ─── helpers ────────────────────────────────────────────────────────

function humanBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function pct(n: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((n / total) * 100)}%`;
}

function relative(ts: number): string {
  const diff = NOW - ts;
  if (diff < 60_000) return "now";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}min ago`;
  if (diff < DAY) return `${Math.floor(diff / 3600_000)}h ago`;
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(ts).toISOString().slice(0, 10);
}

function trunc(s: string, max: number): string {
  if (!s) return "";
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

function get1<T = any>(sql: string, ...params: unknown[]): T {
  return db.query(sql).get(...(params as any[])) as T;
}

function num(sql: string, ...params: unknown[]): number {
  return (get1<{ c: number }>(sql, ...params)?.c ?? 0) as number;
}

// ─── device drilldown (--device <prefix>) ───────────────────────────
// When --device is passed, show that one device's detail and exit; we
// skip the full overview to keep the output focused.

if (devicePrefix) {
  if (devicePrefix.length < 4) {
    console.error("error: --device prefix must be at least 4 chars");
    process.exit(1);
  }
  const matches = db.query(
    `SELECT id, first_seen_at, last_seen_at FROM devices WHERE id LIKE ? ORDER BY last_seen_at DESC`,
  ).all(`${devicePrefix}%`) as { id: string; first_seen_at: number; last_seen_at: number }[];

  if (matches.length === 0) {
    console.error(`no device matches prefix "${devicePrefix}"`);
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log();
    console.log(`  ambiguous prefix "${devicePrefix}" — ${matches.length} matches:`);
    console.log();
    for (const d of matches) {
      const dls = num(`SELECT COUNT(*) AS c FROM downloads WHERE device_id = ?`, d.id);
      console.log(`    ${d.id.slice(0, 12)}…   ${dls} dl   · last ${relative(d.last_seen_at)}`);
    }
    console.log();
    console.log("  re-run with a longer prefix.");
    db.close();
    process.exit(0);
  }

  const dev = matches[0]!;
  const downloads = db.query(`
    SELECT b.title, b.author, d.downloaded_at
    FROM downloads d
    JOIN books b ON b.id = d.book_id
    WHERE d.device_id = ?
    ORDER BY d.downloaded_at DESC
  `).all(dev.id) as { title: string; author: string | null; downloaded_at: number }[];

  console.log();
  console.log(`  device ${dev.id}`);
  console.log(`  ${"─".repeat(64)}`);
  console.log(`    first seen      ${new Date(dev.first_seen_at).toISOString().slice(0, 16).replace("T", " ")}Z`);
  console.log(`    last seen       ${relative(dev.last_seen_at)}  (${new Date(dev.last_seen_at).toISOString().slice(0, 16).replace("T", " ")}Z)`);
  console.log(`    downloads       ${downloads.length}`);

  if (downloads.length > 0) {
    console.log();
    downloads.forEach((d, i) => {
      const rank = String(i + 1).padStart(3);
      const when = relative(d.downloaded_at).padEnd(10);
      const titlePart = `"${trunc(d.title, 44)}"`;
      const authorPart = d.author ? ` — ${trunc(d.author, 24)}` : "";
      console.log(`    ${rank}.  ${when}  ${titlePart}${authorPart}`);
    });
  } else {
    console.log();
    console.log("    (no downloads yet)");
  }
  console.log();
  db.close();
  process.exit(0);
}

// ─── library ────────────────────────────────────────────────────────

const totalBooks  = num(`SELECT COUNT(*) AS c FROM books`);
const onDisk      = num(`SELECT COUNT(*) AS c FROM books WHERE on_disk = 1`);
const unsynced    = totalBooks - onDisk;
const totalSize   = num(`SELECT COALESCE(SUM(size_bytes), 0) AS c FROM books WHERE on_disk = 1`);
const avgSize     = onDisk > 0 ? totalSize / onDisk : 0;
const added30d    = num(`SELECT COUNT(*) AS c FROM books WHERE added_at >= ?`, thirtyDaysAgo);

const largest = get1<{ title: string; size_bytes: number } | null>(
  `SELECT title, size_bytes FROM books WHERE on_disk = 1 ORDER BY size_bytes DESC LIMIT 1`,
);
const newest = get1<{ title: string; added_at: number } | null>(
  `SELECT title, added_at FROM books ORDER BY added_at DESC LIMIT 1`,
);
const categories = db.query(
  `SELECT category, COUNT(*) AS c FROM books
   WHERE category IS NOT NULL
   GROUP BY category ORDER BY c DESC LIMIT 6`,
).all() as { category: string; c: number }[];

// ─── downloads ──────────────────────────────────────────────────────

const totalDl     = num(`SELECT COUNT(*) AS c FROM downloads`);
const uniqueBooks = num(`SELECT COUNT(DISTINCT book_id) AS c FROM downloads`);
const todayDl     = num(`SELECT COUNT(*) AS c FROM downloads WHERE downloaded_at >= ?`, startOfToday);
const weekDl      = num(`SELECT COUNT(*) AS c FROM downloads WHERE downloaded_at >= ?`, sevenDaysAgo);
const monthDl     = num(`SELECT COUNT(*) AS c FROM downloads WHERE downloaded_at >= ?`, thirtyDaysAgo);
const neverDl     = totalBooks - uniqueBooks;

const lastDlRow = get1<{ ts: number } | null>(
  `SELECT MAX(downloaded_at) AS ts FROM downloads`,
);
const lastDl = lastDlRow?.ts ?? null;

const topBooks = db.query(`
  SELECT b.title, b.author, COUNT(*) AS dls, MAX(d.downloaded_at) AS last
  FROM downloads d
  JOIN books b ON b.id = d.book_id
  GROUP BY d.book_id
  ORDER BY dls DESC, last DESC
  LIMIT 10
`).all() as { title: string; author: string | null; dls: number; last: number }[];

const recentDownloads = db.query(`
  SELECT b.title, b.author, d.downloaded_at, d.device_id
  FROM downloads d
  JOIN books b ON b.id = d.book_id
  ORDER BY d.downloaded_at DESC
  LIMIT 20
`).all() as { title: string; author: string | null; downloaded_at: number; device_id: string }[];

// ─── devices ────────────────────────────────────────────────────────

const totalDevices = num(`SELECT COUNT(*) AS c FROM devices`);
const active7d     = num(`SELECT COUNT(*) AS c FROM devices WHERE last_seen_at >= ?`, sevenDaysAgo);

const devices = db.query(`
  SELECT d.id, d.first_seen_at, d.last_seen_at, COUNT(dl.book_id) AS dls
  FROM devices d
  LEFT JOIN downloads dl ON dl.device_id = d.id
  GROUP BY d.id
  ORDER BY d.last_seen_at DESC
  LIMIT 10
`).all() as { id: string; first_seen_at: number; last_seen_at: number; dls: number }[];

// ─── format ─────────────────────────────────────────────────────────

const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + "Z";
const RULE = "─".repeat(64);

function section(name: string): void {
  console.log();
  console.log(`  ${name}`);
}

function row(label: string, ...values: string[]): void {
  console.log(`    ${label.padEnd(18)}${values.join("   ")}`);
}

console.log();
console.log(`  FARENHEIT · stats                          ${stamp}`);
console.log(`  ${RULE}`);
console.log(`  db: ${dbPath}`);

section("library");
row("books", String(totalBooks).padEnd(8), `on disk ${onDisk}`, `unsynced ${unsynced}`);
row("total size", humanBytes(totalSize).padEnd(8), `avg/book ${humanBytes(avgSize)}`);
if (largest) {
  row("largest", `${humanBytes(largest.size_bytes).padEnd(8)} "${trunc(largest.title, 40)}"`);
}
if (newest) {
  row("newest", `"${trunc(newest.title, 40)}" · added ${relative(newest.added_at)}`);
}
row("added (30d)", String(added30d));
if (categories.length > 0) {
  const cats = categories.map((c) => `${c.category} (${c.c})`).join(" · ");
  row("categories", cats);
}

section("downloads");
row("total", String(totalDl).padEnd(8), `today ${todayDl}`, `7d ${weekDl}`, `30d ${monthDl}`);
row("unique books", `${uniqueBooks} / ${totalBooks}   (${pct(uniqueBooks, totalBooks)} do catálogo)`);
row("never baixados", String(neverDl));
if (lastDl) row("last download", relative(lastDl));

if (topBooks.length > 0) {
  console.log();
  console.log("    top 10 mais baixados");
  topBooks.forEach((b, i) => {
    const rank = String(i + 1).padStart(2);
    const cnt = String(b.dls).padStart(3);
    const titlePart = `"${trunc(b.title, 38)}"`;
    const authorPart = b.author ? ` — ${trunc(b.author, 22)}` : "";
    console.log(`      ${rank}.  ${cnt}×  ${titlePart}${authorPart}`);
  });
} else if (totalDl === 0) {
  console.log();
  console.log("    (nenhum download ainda)");
}

if (recentDownloads.length > 0) {
  console.log();
  console.log("    últimos 20 baixados");
  recentDownloads.forEach((d, i) => {
    const rank = String(i + 1).padStart(2);
    const when = relative(d.downloaded_at).padEnd(10);
    const titlePart = `"${trunc(d.title, 36)}"`;
    const authorPart = d.author ? ` — ${trunc(d.author, 20)}` : "";
    const dev = d.device_id.slice(0, 8);
    console.log(`      ${rank}.  ${when}  ${titlePart}${authorPart}  · ${dev}…`);
  });
}

section("devices");
row("total", String(totalDevices).padEnd(8), `active 7d ${active7d}`);

if (devices.length > 0) {
  console.log();
  devices.forEach((d, i) => {
    const rank = String(i + 1).padStart(2);
    const shortId = d.id.slice(0, 8);
    const dls = `${d.dls} dl`.padEnd(7);
    const last = relative(d.last_seen_at).padEnd(10);
    const first = `since ${new Date(d.first_seen_at).toISOString().slice(0, 10)}`;
    console.log(`      ${rank}.  ${shortId}…  ${dls}  · last ${last}  · ${first}`);
  });
}

console.log();
db.close();
