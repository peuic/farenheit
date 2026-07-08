import type { Database } from "bun:sqlite";
import { escapeHtml } from "./layout";

// Admin dashboard — internal-only analytics for the curator. Bound to a
// separate port that's not exposed via Tailscale Funnel.
//
// Four sections:
//   1. Curation health (KPIs)
//   2. Hottest titles by distinct-device consensus
//   3. Per-book overlap (who picked what)
//   4. Per-device picks (what each person picked)

export function renderAdmin(db: Database): string {
  const NOW = Date.now();
  const DAY = 24 * 60 * 60 * 1000;

  const totalBooks  = scalar(db, `SELECT COUNT(*) AS c FROM books`);
  const onDisk      = scalar(db, `SELECT COUNT(*) AS c FROM books WHERE on_disk = 1`);
  const totalDl     = scalar(db, `SELECT COUNT(*) AS c FROM downloads`);
  const uniqueBooks = scalar(db, `SELECT COUNT(DISTINCT book_id) AS c FROM downloads`);
  const neverDl     = totalBooks - uniqueBooks;
  const totalDevs   = scalar(db, `SELECT COUNT(*) AS c FROM devices`);
  const activeDevs  = scalar(db, `SELECT COUNT(*) AS c FROM devices WHERE last_seen_at >= ?`, NOW - 7 * DAY);
  const downloadingDevs = scalar(db, `SELECT COUNT(DISTINCT device_id) AS c FROM downloads`);

  // Books ordered by distinct-device consensus, with the device prefixes
  // that picked each book (so the curator can scan crossings at a glance).
  const bookRows = db.query(`
    SELECT b.id, b.title, b.author,
           COUNT(DISTINCT d.device_id) AS distinct_devs,
           COUNT(d.device_id)          AS total_dls,
           MAX(d.downloaded_at)        AS last_dl
    FROM books b
    JOIN downloads d ON d.book_id = b.id
    GROUP BY b.id
    ORDER BY distinct_devs DESC, total_dls DESC, last_dl DESC
  `).all() as {
    id: number; title: string; author: string | null;
    distinct_devs: number; total_dls: number; last_dl: number;
  }[];

  // For every (book, device) pair we need the prefix list — cheaper to
  // pull all rows once and group in memory than to run N queries.
  const pickRows = db.query(`
    SELECT book_id, device_id, downloaded_at
    FROM downloads
    ORDER BY downloaded_at DESC
  `).all() as { book_id: number; device_id: string; downloaded_at: number }[];

  // Last 20 downloads, joined with book metadata for the timeline.
  const recentDownloads = db.query(`
    SELECT b.title, b.author, d.downloaded_at, d.device_id
    FROM downloads d
    JOIN books b ON b.id = d.book_id
    ORDER BY d.downloaded_at DESC
    LIMIT 20
  `).all() as { title: string; author: string | null; downloaded_at: number; device_id: string }[];

  const devicesByBook = new Map<number, { devicePrefix: string; when: number }[]>();
  for (const p of pickRows) {
    if (!devicesByBook.has(p.book_id)) devicesByBook.set(p.book_id, []);
    devicesByBook.get(p.book_id)!.push({ devicePrefix: p.device_id.slice(0, 8), when: p.downloaded_at });
  }

  // Per-device picks (only devices that downloaded something — ghosts
  // have already been filtered by the prune workflow but we exclude them
  // here too in case they slip back in).
  const deviceRows = db.query(`
    SELECT d.id, d.first_seen_at, d.last_seen_at,
           COUNT(dl.book_id) AS dls
    FROM devices d
    JOIN downloads dl ON dl.device_id = d.id
    GROUP BY d.id
    ORDER BY dls DESC, d.last_seen_at DESC
  `).all() as { id: string; first_seen_at: number; last_seen_at: number; dls: number }[];

  const booksByDevice = new Map<string, { title: string; author: string | null; when: number }[]>();
  const titleById = new Map<number, { title: string; author: string | null }>();
  for (const b of bookRows) titleById.set(b.id, { title: b.title, author: b.author });
  for (const p of pickRows) {
    const t = titleById.get(p.book_id);
    if (!t) continue;
    if (!booksByDevice.has(p.device_id)) booksByDevice.set(p.device_id, []);
    booksByDevice.get(p.device_id)!.push({ title: t.title, author: t.author, when: p.downloaded_at });
  }

  const pct = (n: number, total: number) => total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
  const rel = (ts: number) => {
    const diff = NOW - ts;
    if (diff < 60_000) return "now";
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}min ago`;
    if (diff < DAY) return `${Math.floor(diff / 3600_000)}h ago`;
    if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`;
    return new Date(ts).toISOString().slice(0, 10);
  };

  // ── KPIs ──
  const kpiBlock = `
<div class="kpis">
  <div class="kpi"><div class="kpi-num">${totalBooks}</div><div class="kpi-lbl">books in catalog</div></div>
  <div class="kpi"><div class="kpi-num">${uniqueBooks}</div><div class="kpi-lbl">unique downloaded (${pct(uniqueBooks, totalBooks)})</div></div>
  <div class="kpi"><div class="kpi-num">${neverDl}</div><div class="kpi-lbl">never picked</div></div>
  <div class="kpi"><div class="kpi-num">${downloadingDevs}</div><div class="kpi-lbl">people who picked</div></div>
  <div class="kpi"><div class="kpi-num">${totalDl}</div><div class="kpi-lbl">total downloads</div></div>
  <div class="kpi"><div class="kpi-num">${activeDevs}/${totalDevs}</div><div class="kpi-lbl">active 7d / known</div></div>
</div>`;

  // ── Recent activity timeline ──
  const recentSection = recentDownloads.length === 0
    ? `<p class="muted">No downloads yet.</p>`
    : `<ol class="timeline">
${recentDownloads.map((d) => {
  const author = d.author ? ` <span class="byline">— ${escapeHtml(d.author)}</span>` : "";
  return `    <li>
      <span class="when">${rel(d.downloaded_at)}</span>
      <span class="ttl">${escapeHtml(d.title)}${author}</span>
      <span class="chip">${d.device_id.slice(0, 8)}</span>
    </li>`;
}).join("\n")}
  </ol>`;

  // ── Per-book overlap table ──
  const bookSection = bookRows.length === 0
    ? `<p class="muted">No downloads yet — this view will fill in as people use the catalog.</p>`
    : `<table class="grid">
  <thead><tr><th class="num">×</th><th class="num">∑</th><th>title</th><th>last</th><th class="picks">picked by</th></tr></thead>
  <tbody>
${bookRows.map((b) => {
  const picks = devicesByBook.get(b.id) ?? [];
  const prefixes = picks.map((p) => `<span class="chip" title="${escapeHtml(rel(p.when))}">${p.devicePrefix}</span>`).join(" ");
  const author = b.author ? `<span class="byline">— ${escapeHtml(b.author)}</span>` : "";
  return `    <tr>
      <td class="num"><strong>${b.distinct_devs}</strong></td>
      <td class="num muted">${b.total_dls}</td>
      <td class="title">${escapeHtml(b.title)} ${author}</td>
      <td class="muted">${rel(b.last_dl)}</td>
      <td class="picks">${prefixes}</td>
    </tr>`;
}).join("\n")}
  </tbody>
</table>`;

  // ── Per-device picks ──
  const deviceSection = deviceRows.length === 0
    ? `<p class="muted">No active readers yet.</p>`
    : deviceRows.map((d) => {
        const picks = booksByDevice.get(d.id) ?? [];
        const items = picks.map((p) => {
          const author = p.author ? ` <span class="byline">— ${escapeHtml(p.author)}</span>` : "";
          return `<li><span class="when">${rel(p.when)}</span> ${escapeHtml(p.title)}${author}</li>`;
        }).join("\n");
        return `<section class="dev">
  <header>
    <code class="devid">${d.id.slice(0, 8)}…</code>
    <span class="muted">${d.dls} pick${d.dls === 1 ? "" : "s"} · last ${rel(d.last_seen_at)} · since ${new Date(d.first_seen_at).toISOString().slice(0, 10)}</span>
  </header>
  <ol class="picks-list">${items}</ol>
</section>`;
      }).join("\n");

  const css = `
:root {
  --paper: #f5efe0;
  --paper-warm: #ece3cd;
  --ink: #1a1714;
  --ink-soft: #3e362d;
  --fade: #6b5f4f;
  --fade-light: #958873;
  --hair: #c9bfa8;
  --ember: #b84318;
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: Charter, "Iowan Old Style", "Hoefler Text", Palatino, Georgia, serif;
  font-size: 16px;
  line-height: 1.4;
}
.wrap { max-width: 1100px; margin: 0 auto; padding: 24px 28px 60px; }
h1 {
  font-style: italic; font-weight: normal; font-size: 32px;
  margin: 0 0 6px; letter-spacing: -0.01em;
}
h1 .mark { color: var(--ember); font-style: normal; margin-right: 8px; }
.subtitle {
  color: var(--fade); font-style: italic;
  margin: 0 0 28px; font-size: 14px;
}
h2 {
  font-style: italic; font-weight: normal; font-size: 22px;
  margin: 36px 0 12px;
  border-bottom: 1px solid var(--hair); padding-bottom: 6px;
}
.muted { color: var(--fade); font-size: 13px; }
.byline { color: var(--fade); font-style: italic; }

/* KPIs */
.kpis {
  display: grid; grid-template-columns: repeat(3, 1fr);
  gap: 14px; margin-bottom: 8px;
}
@media (min-width: 720px) { .kpis { grid-template-columns: repeat(6, 1fr); } }
.kpi {
  background: var(--paper-warm);
  padding: 14px 12px;
  border-left: 3px solid var(--ember);
}
.kpi-num {
  font-size: 28px; font-style: italic; line-height: 1;
  margin-bottom: 4px; color: var(--ink);
}
.kpi-lbl {
  font-size: 12px; text-transform: uppercase;
  letter-spacing: 0.08em; color: var(--fade);
}

/* Books table */
table.grid { width: 100%; border-collapse: collapse; font-size: 14px; }
table.grid th {
  text-align: left; font-weight: normal; font-style: italic;
  color: var(--fade); padding: 6px 10px; border-bottom: 1px solid var(--hair);
  font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em;
}
table.grid td {
  padding: 8px 10px; border-bottom: 1px solid var(--hair);
  vertical-align: top;
}
table.grid td.num { text-align: right; width: 36px; font-variant-numeric: tabular-nums; }
table.grid td.title { max-width: 360px; }
table.grid td.picks { font-family: "SF Mono", Menlo, monospace; font-size: 12px; }
.chip {
  display: inline-block;
  background: var(--paper-warm);
  padding: 2px 6px;
  margin: 0 2px 2px 0;
  border: 1px solid var(--hair);
  font-size: 11px;
  color: var(--ink-soft);
}

/* Timeline (recent downloads) */
ol.timeline {
  list-style: none; margin: 0; padding: 0;
  border-top: 1px solid var(--hair);
}
ol.timeline li {
  display: flex; align-items: baseline; gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--hair);
  font-size: 14px;
}
ol.timeline li .when {
  color: var(--fade); font-style: italic; font-size: 12px;
  min-width: 80px; font-variant-numeric: tabular-nums;
}
ol.timeline li .ttl { flex: 1; }
ol.timeline li .chip {
  margin: 0; flex-shrink: 0;
}

/* Per-device sections */
section.dev {
  margin-bottom: 18px;
  padding: 12px 14px;
  background: var(--paper-warm);
  border-left: 3px solid var(--hair);
}
section.dev header {
  display: flex; align-items: baseline; gap: 14px;
  margin-bottom: 8px;
}
.devid {
  font-family: "SF Mono", Menlo, monospace;
  font-size: 14px; color: var(--ember);
  background: var(--paper); padding: 2px 8px;
}
ol.picks-list {
  list-style: decimal inside; margin: 0; padding: 0;
  columns: 2; column-gap: 24px;
}
@media (max-width: 640px) { ol.picks-list { columns: 1; } }
ol.picks-list li {
  margin-bottom: 4px;
  break-inside: avoid;
  font-size: 14px;
}
ol.picks-list li .when {
  color: var(--fade); font-style: italic; font-size: 12px;
  margin-right: 6px;
  font-variant-numeric: tabular-nums;
}
`;

  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Farenheit · admin</title>
<style>${css}</style>
</head>
<body>
<div class="wrap">
  <h1><span class="mark">§</span>Farenheit · admin</h1>
  <p class="subtitle">Curation crossings — internal view, not exposed via Funnel.</p>

  ${kpiBlock}

  <h2>Recent activity</h2>
  <p class="muted">Last 20 downloads across all devices, newest first.</p>
  ${recentSection}

  <h2>Hottest by consensus</h2>
  <p class="muted">Books ordered by how many distinct people picked them. The chips show device prefixes — same chip across rows means the same person.</p>
  ${bookSection}

  <h2>People &amp; their picks</h2>
  <p class="muted">One section per device that downloaded at least once. Ordered by number of picks.</p>
  ${deviceSection}
</div>
</body>
</html>`;
}

function scalar(db: Database, sql: string, ...params: unknown[]): number {
  const row = db.query(sql).get(...(params as any[])) as { c: number } | null;
  return row?.c ?? 0;
}
