export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* Layout philosophy:
 *   The Kobo browser runs ancient WebKit. Flex/grid/aspect-ratio are
 *   unreliable. Everything below uses ONLY: block, inline-block, float,
 *   and HTML tables for multi-column alignment. No media queries.
 */

const BASE_CSS = `
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
  margin: 0;
  padding: 0;
  background: #f5efe0;
  color: #1a1714;
  font-family: Charter, "Iowan Old Style", "Hoefler Text", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 19px;
  line-height: 1.35;
}
a { color: #1a1714; text-decoration: none; }

/* ═════════════ TOPBAR ═════════════ */
table.topbar-main, table.topbar-meta, table.alphanav, table.pager {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
table.topbar-main {
  border-bottom: 1px solid #c9bfa8;
}
table.topbar-main td {
  padding: 8px 14px;
  vertical-align: middle;
  height: 44px;
}
table.topbar-main td.col-left  { text-align: left;   width: 30%; }
table.topbar-main td.col-center{ text-align: center; }
table.topbar-main td.col-right { text-align: right;  width: 30%; }

.brand { font-style: italic; font-size: 22px; color: #1a1714; }
.brand-mark { color: #b84318; font-style: normal; margin-right: 6px; }

.back {
  display: inline-block;
  color: #f5efe0;
  font-size: 15px;
  font-style: italic;
  border: 0;
  padding: 8px 14px;
  text-decoration: none;
  background: #1a1714;
}
.back-arrow { font-style: normal; margin-right: 4px; color: #f5efe0; }

.heading {
  font-size: 14px;
  color: #6b5f4f;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.icon-btn {
  display: inline-block;
  width: 36px;
  height: 36px;
  line-height: 36px;
  text-align: center;
  color: #1a1714;
  vertical-align: middle;
}
.icon-btn svg { vertical-align: middle; }

/* Meta row (count · sort) */
table.topbar-meta {
  border-bottom: 1px solid #c9bfa8;
}
table.topbar-meta td {
  padding: 4px 14px 6px;
  vertical-align: middle;
  font-size: 14px;
  color: #6b5f4f;
  height: 30px;
}
table.topbar-meta td.col-left  { text-align: left; }
table.topbar-meta td.col-right { text-align: right; }

.count strong {
  color: #1a1714;
  font-weight: normal;
  font-style: italic;
  font-size: 16px;
  margin-right: 3px;
}
.retry {
  color: #b84318;
  margin-left: 6px;
  text-decoration: underline;
  font-style: italic;
  font-size: 14px;
}

.sort a {
  color: #6b5f4f;
  font-style: italic;
  font-size: 14px;
  margin-left: 10px;
}
.sort a.active {
  color: #1a1714;
  text-decoration: underline;
}

/* ═════════════ ALPHANAV ═════════════ */
table.alphanav {
  border-bottom: 1px solid #c9bfa8;
}
table.alphanav td {
  text-align: center;
  vertical-align: middle;
  height: 36px;
  font-style: italic;
  font-size: 14px;
}
table.alphanav td a { color: #1a1714; display: block; padding: 9px 0; }
table.alphanav td .empty { color: #c9bfa8; display: block; padding: 9px 0; }

/* ═════════════ BOOK LIST (fixed-height rows, float cover) ═════════════ */
ul.book-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: block;
}
ul.book-list li {
  display: block;
  height: 110px;
  border-bottom: 1px solid #c9bfa8;
  position: relative;
  overflow: hidden;
}
ul.book-list li a {
  display: block;
  height: 110px;
  padding: 12px 14px 12px 34px;
  color: #1a1714;
  text-decoration: none;
}
.marker {
  position: absolute;
  left: 8px;
  top: 46px;
  width: 18px;
  font-family: "Courier New", Courier, monospace;
  font-size: 14px;
  color: #958873;
  text-align: center;
}
li.downloaded .marker::before { content: "✓"; color: #b84318; }
li.unsynced   .marker::before { content: "⊙"; color: #958873; }
img.cover, div.cover {
  float: left;
  width: 58px;
  height: 87px;
  margin-right: 14px;
  border: 1px solid #c9bfa8;
  background: #ece3cd;
  display: block;
}
div.cover.placeholder {
  text-align: center;
  padding: 32px 2px 0;
  font-size: 10px;
  color: #6b5f4f;
  font-style: italic;
  line-height: 1.1;
}
.meta {
  display: block;
  overflow: hidden; /* contains the floated cover's side */
  padding-top: 6px;
}
.meta .title {
  font-size: 18px;
  font-weight: bold;
  line-height: 1.25;
  color: #1a1714;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 5px;
}
.meta .author {
  font-size: 17px;
  font-style: italic;
  color: #3e362d;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
li.downloaded .meta .title { color: #6b5f4f; font-weight: normal; }
li.unsynced   .meta .title { color: #6b5f4f; font-style: italic; font-weight: normal; }

/* ═════════════ PAGER (natural block flow, not fixed) ═════════════ */
table.pager {
  border-bottom: 1px solid #c9bfa8;
  margin-top: 0;
}
table.pager td {
  vertical-align: middle;
  height: 60px;
  padding: 6px;
}
table.pager td.col-left  { width: 35%; }
table.pager td.col-right { width: 35%; }
table.pager td.col-center{
  text-align: center;
  font-size: 13px;
  color: #6b5f4f;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  padding: 0;
}
table.pager td.col-center strong {
  color: #1a1714;
  font-weight: normal;
  font-style: italic;
  font-size: 18px;
  letter-spacing: 0;
  margin: 0 4px;
}
.pager-btn {
  display: block;
  padding: 12px 16px;
  background: #1a1714;
  color: #f5efe0;
  text-align: center;
  text-decoration: none;
  border: 0;
}
.pager-btn svg {
  display: inline-block;
  width: 24px;
  height: 24px;
  vertical-align: middle;
  stroke: currentColor;
  fill: none;
}
.pager-btn.disabled {
  background: #ece3cd;
  color: #c9bfa8;
}

/* ═════════════ NARROW PAGES (detail / search / 404) ═════════════ */
.page-narrow {
  max-width: 640px;
  margin: 0 auto;
  padding: 14px 18px 24px;
}
.page-narrow .overline {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 12px;
  color: #6b5f4f;
  margin-bottom: 4px;
}
.page-narrow h1 {
  font-style: italic;
  font-weight: normal;
  font-size: 30px;
  line-height: 1.05;
  letter-spacing: -0.01em;
  margin: 0 0 16px;
}

/* ═════════════ DETAIL ═════════════ */
.detail .cover-big {
  display: block;
  width: 180px;
  margin: 4px auto 16px;
  border: 1px solid #c9bfa8;
  background: #ece3cd;
}
.detail .cover-big.placeholder {
  width: 180px;
  height: 270px;
  text-align: center;
  padding-top: 130px;
  color: #6b5f4f;
  font-style: italic;
  font-size: 13px;
}
.detail h1 {
  font-style: italic;
  font-weight: normal;
  font-size: 28px;
  line-height: 1.1;
  text-align: center;
  margin: 0 0 6px;
}
.detail .byline {
  text-align: center;
  font-size: 16px;
  color: #6b5f4f;
  font-style: italic;
  margin-bottom: 14px;
}
.detail .specs {
  text-align: center;
  font-size: 12px;
  color: #6b5f4f;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  padding: 10px 0;
  border-top: 1px solid #c9bfa8;
  border-bottom: 1px solid #c9bfa8;
  margin-bottom: 16px;
}
.detail .specs .sep {
  display: inline-block;
  margin: 0 8px;
  color: #958873;
}
.detail .description {
  font-size: 16px;
  line-height: 1.55;
  color: #3e362d;
  text-align: justify;
  margin-bottom: 20px;
}

/* ═════════════ BUTTONS ═════════════ */
/* Solid fills only — outlines disappear on E Ink screens. */
.download-btn {
  display: block;
  padding: 18px;
  text-align: center;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  border: 0;
  background: #1a1714;
  color: #f5efe0;
  text-decoration: none;
  font-weight: bold;
}
.download-btn .mark {
  color: #f5efe0;
  margin-right: 8px;
  font-weight: normal;
}
.download-btn.done {
  background: #6b5f4f;
  color: #f5efe0;
}
.download-btn.done .mark { color: #f5efe0; }
.download-btn.retry {
  background: #b84318;
  color: #f5efe0;
}
.download-btn.retry .mark { color: #f5efe0; }
.download-btn.secondary {
  background: #3e362d;
  color: #f5efe0;
  padding: 14px;
  font-size: 13px;
  margin-top: 10px;
}
.download-btn.secondary .mark { color: #f5efe0; }

/* ═════════════ WARN / EMPTY ═════════════ */
.warn {
  padding: 12px 14px;
  border-left: 3px solid #b84318;
  background: #ece3cd;
  font-size: 15px;
  font-style: italic;
  color: #3e362d;
  margin-bottom: 16px;
}
.empty {
  text-align: center;
  padding: 36px 0 20px;
  color: #6b5f4f;
  font-style: italic;
  font-size: 16px;
}

/* ═════════════ SEARCH PAGE INPUT ═════════════ */
.search-form { margin-bottom: 20px; }
.search-form input {
  width: 100%;
  padding: 12px 0;
  font-size: 22px;
  font-style: italic;
  font-family: inherit;
  border: 0;
  border-bottom: 1px solid #1a1714;
  background: transparent;
  color: #1a1714;
}
.search-form button {
  margin-top: 12px;
  padding: 12px 22px;
  background: #1a1714;
  color: #f5efe0;
  border: 0;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-family: inherit;
}
`;

const BUILD_STAMP = new Date().toISOString();

export function layout(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="fh-build" content="${BUILD_STAMP}">
<title>${escapeHtml(title)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${bodyHtml}
<!-- fh-build ${BUILD_STAMP} -->
</body>
</html>`;
}
