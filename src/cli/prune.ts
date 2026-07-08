import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { resolve, join } from "node:path";

// Prune ghost device rows: clients that hit the server once, got a cookie,
// and never came back (OPDS readers without cookie support, public scanners,
// HEAD probes). They have 0 downloads and last_seen_at == first_seen_at
// (within 1s tolerance). Real users either come back later (span > 1s) or
// download something (downloads row exists).
//
// Destructive — pass --dry-run to preview without deleting.

const argv = process.argv.slice(2);
const dryRun = argv.includes("--dry-run") || argv.includes("-n");
const dbFlagIdx = argv.indexOf("--db");
const customDb = dbFlagIdx >= 0 ? argv[dbFlagIdx + 1] : null;
const dataDir = resolve(process.env.DATA_DIR ?? "./data");
const dbPath = customDb || join(dataDir, "farenheit.sqlite");

if (!existsSync(dbPath)) {
  console.error(`error: db not found at ${dbPath}`);
  process.exit(1);
}

// Open readonly when previewing; default (readwrite) when actually deleting.
const db = dryRun
  ? new Database(dbPath, { readonly: true })
  : new Database(dbPath);

const SELECT_GHOSTS = `
  SELECT id, first_seen_at, last_seen_at
  FROM devices d
  WHERE NOT EXISTS (SELECT 1 FROM downloads WHERE device_id = d.id)
    AND last_seen_at - first_seen_at < 1000
`;

const ghosts = db.query(SELECT_GHOSTS).all() as {
  id: string;
  first_seen_at: number;
  last_seen_at: number;
}[];

const totalBefore = (db.query(`SELECT COUNT(*) AS c FROM devices`).get() as any).c as number;

console.log();
console.log(`  db: ${dbPath}`);
console.log(`  devices total ........... ${totalBefore}`);
console.log(`  ghost candidates ........ ${ghosts.length}  (0 downloads, lifespan < 1s)`);

if (ghosts.length === 0) {
  console.log(`  nothing to prune.`);
  console.log();
  db.close();
  process.exit(0);
}

if (dryRun) {
  console.log(`  --dry-run set, not deleting.`);
  console.log();
  db.close();
  process.exit(0);
}

const result = db.run(`
  DELETE FROM devices
  WHERE NOT EXISTS (SELECT 1 FROM downloads WHERE device_id = devices.id)
    AND last_seen_at - first_seen_at < 1000
`);

const totalAfter = (db.query(`SELECT COUNT(*) AS c FROM devices`).get() as any).c as number;

console.log(`  deleted ................. ${result.changes}`);
console.log(`  devices remaining ....... ${totalAfter}`);
console.log();
db.close();
