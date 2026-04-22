export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { height: 100%; }
html, body, input, button {
  font-family: Charter, "Iowan Old Style", "Hoefler Text", "Palatino Linotype", Palatino, Georgia, serif;
  font-variant-numeric: oldstyle-nums;
  -webkit-font-smoothing: antialiased;
}
body {
  background: var(--paper);
  color: var(--ink);
  font-size: 16px;
  line-height: 1.35;
  min-height: 100vh;
  min-height: 100svh;
  display: flex;
  flex-direction: column;
}
a { color: var(--ink); text-decoration: none; }

/* ═════════════ TOPBAR (compact 2-line header) ═════════════ */
.topbar {
  flex: 0 0 auto;
  padding: 6px 14px 4px;
  border-bottom: 1px solid var(--hair);
}
.topbar .line {
  display: flex;
  align-items: center;
  gap: 10px;
}
.topbar .line.primary { min-height: 30px; }
.topbar .line.meta    { min-height: 22px; padding-top: 2px; }
.topbar .brand {
  font-style: italic;
  font-size: 17px;
}
.topbar .brand::before {
  content: "§";
  color: var(--ember);
  font-style: normal;
  margin-right: 5px;
}
.topbar .heading {
  flex: 1;
  font-size: 12px;
  color: var(--fade);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.topbar .back {
  color: var(--fade);
  font-size: 13px;
  font-style: italic;
}
.topbar .back::before { content: "← "; }
.topbar .icons { margin-left: auto; display: flex; gap: 2px; }
.topbar .icon-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--ink);
}
.topbar .icon-btn:active { background: var(--paper-warm); }
.topbar .count { font-size: 12px; color: var(--fade); }
.topbar .count strong {
  color: var(--ink);
  font-weight: normal;
  font-style: italic;
  font-size: 14px;
  margin-right: 2px;
}
.topbar .retry {
  color: var(--ember);
  margin-left: 4px;
  text-decoration: underline;
  text-underline-offset: 2px;
  font-style: italic;
  font-size: 12px;
}
.topbar .sort {
  margin-left: auto;
  display: flex;
  gap: 8px;
  font-size: 12px;
  font-style: italic;
}
.topbar .sort a { color: var(--fade); }
.topbar .sort a.active {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* ═════════════ ALPHANAV (compact letter strip) ═════════════ */
.alphanav {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  padding: 0 6px;
  border-bottom: 1px solid var(--hair);
}
.alphanav a, .alphanav span {
  flex: 1 1 0;
  min-width: 20px;
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-style: italic;
  font-size: 12px;
}
.alphanav a { color: var(--ink); }
.alphanav span { color: var(--hair); }
.alphanav a:active { background: var(--paper-warm); }

/* ═════════════ BOOK LIST ═════════════ */
.book-list {
  list-style: none;
}
.book-list li {
  border-bottom: 1px solid var(--hair);
  position: relative;
}
.book-list li:last-child { border-bottom: 0; }
.book-list a {
  display: flex;
  gap: 12px;
  padding: 6px 14px 6px 30px;
  color: inherit;
  align-items: center;
  min-height: 62px;
}
.book-list .marker {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  font-family: "Courier New", Courier, monospace;
  font-size: 12px;
  color: var(--fade-light);
  text-align: center;
}
.book-list li.downloaded .marker::before { content: "✓"; color: var(--ember); }
.book-list li.unsynced .marker::before   { content: "⊙"; color: var(--fade-light); }
.book-list .cover {
  width: 42px;
  height: 63px;
  flex-shrink: 0;
  object-fit: cover;
  border: 1px solid var(--hair);
  background: var(--paper-warm);
}
.book-list .cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2px;
  font-size: 8px;
  color: var(--fade);
  font-style: italic;
  text-align: center;
  line-height: 1.1;
}
.book-list .meta { flex: 1; min-width: 0; }
.book-list .meta .title {
  font-size: 15px;
  line-height: 1.2;
  color: var(--ink);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-list .meta .author {
  font-size: 12px;
  font-style: italic;
  color: var(--fade);
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-list li.downloaded .meta .title { color: var(--fade); }
.book-list li.unsynced   .meta .title { color: var(--fade); font-style: italic; }

/* Fill mode — distribute 10 rows uniformly between topbar and pager. */
.book-list.fill {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}
.book-list.fill li {
  flex: 1 1 0;
  display: flex;
  min-height: 56px;
}
.book-list.fill li a {
  width: 100%;
  min-height: 0;
}

/* ═════════════ PAGER (sticks to bottom via body flex) ═════════════ */
.pager {
  flex: 0 0 auto;
  display: flex;
  align-items: stretch;
  border-top: 1px solid var(--hair);
  min-height: 52px;
}
.pager-btn {
  flex: 1;
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 13px;
  font-style: italic;
  color: var(--ink);
  text-decoration: none;
}
.pager-btn.prev { justify-content: flex-start; }
.pager-btn.next { justify-content: flex-end; }
.pager-btn:active { background: var(--paper-warm); }
.pager-btn.disabled { color: var(--fade-light); pointer-events: none; cursor: default; }
.pager-label {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 14px;
  font-size: 11px;
  color: var(--fade);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  border-left: 1px solid var(--hair);
  border-right: 1px solid var(--hair);
  min-width: 86px;
  white-space: nowrap;
}
.pager-label strong {
  color: var(--ink);
  font-weight: normal;
  font-style: italic;
  font-size: 15px;
  margin: 0 3px;
  letter-spacing: 0;
}
.pager-label .pager-of { color: var(--fade-light); }

/* ═════════════ NARROW PAGES (detail / search / 404) ═════════════ */
.page-narrow {
  flex: 1 1 auto;
  max-width: 640px;
  width: 100%;
  margin: 0 auto;
  padding: 14px 18px 24px;
}
.page-narrow .overline {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 10px;
  color: var(--fade);
  margin-bottom: 4px;
}
.page-narrow h1 {
  font-style: italic;
  font-weight: normal;
  font-size: 28px;
  line-height: 1.05;
  letter-spacing: -0.01em;
  margin-bottom: 16px;
}

/* ═════════════ DETAIL ═════════════ */
.detail .cover-big {
  display: block;
  width: 180px;
  margin: 4px auto 16px;
  border: 1px solid var(--hair);
  background: var(--paper-warm);
}
.detail .cover-big.placeholder {
  width: 180px;
  height: 270px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--fade);
  font-style: italic;
  font-size: 13px;
}
.detail h1 {
  font-style: italic;
  font-weight: normal;
  font-size: 26px;
  line-height: 1.1;
  text-align: center;
  margin-bottom: 4px;
}
.detail .byline {
  text-align: center;
  font-size: 14px;
  color: var(--fade);
  font-style: italic;
  margin-bottom: 12px;
}
.detail .byline::before { content: "— "; }
.detail .byline::after  { content: " —"; }
.detail .specs {
  text-align: center;
  font-size: 10px;
  color: var(--fade);
  text-transform: uppercase;
  letter-spacing: 0.14em;
  padding: 8px 0;
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  margin-bottom: 14px;
}
.detail .specs .sep {
  display: inline-block;
  margin: 0 8px;
  color: var(--fade-light);
}
.detail .description {
  font-size: 14px;
  line-height: 1.55;
  color: var(--ink-soft);
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
  margin-bottom: 18px;
}
.detail .description::first-letter {
  font-size: 2.4em;
  float: left;
  line-height: 0.9;
  padding: 2px 6px 0 0;
  font-style: italic;
  color: var(--ember);
}

/* ═════════════ BUTTONS ═════════════ */
.download-btn {
  display: block;
  padding: 14px;
  text-align: center;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  border: 1.5px solid var(--ink);
  background: var(--paper);
  color: var(--ink);
}
.download-btn::before {
  content: "❖";
  color: var(--ember);
  margin-right: 8px;
}
.download-btn.done {
  color: var(--fade);
  border: 1px dashed var(--hair);
  padding: 13px;
}
.download-btn.done::before { content: "✓"; color: var(--fade); }
.download-btn.retry { color: var(--ember); border: 1.5px solid var(--ember); }
.download-btn.retry::before { content: "↻"; }
.download-btn:active { background: var(--paper-warm); }

/* ═════════════ WARN / EMPTY ═════════════ */
.warn {
  padding: 10px 12px;
  border-left: 3px solid var(--ember);
  background: var(--paper-warm);
  font-size: 13px;
  font-style: italic;
  color: var(--ink-soft);
  margin-bottom: 14px;
}
.warn::before { content: "⏳ "; font-style: normal; }
.empty {
  text-align: center;
  padding: 36px 0 20px;
  color: var(--fade);
  font-style: italic;
}
.empty::before {
  content: "✦";
  display: block;
  font-size: 22px;
  color: var(--hair);
  margin-bottom: 8px;
}

/* ═════════════ SEARCH PAGE INPUT ═════════════ */
.search-form {
  margin-bottom: 20px;
}
.search-form input {
  width: 100%;
  padding: 10px 0;
  font-size: 20px;
  font-family: inherit;
  font-style: italic;
  border: 0;
  border-bottom: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  outline: none;
}
.search-form input::placeholder { color: var(--fade-light); }
.search-form button {
  margin-top: 10px;
  padding: 10px 18px;
  background: var(--ink);
  color: var(--paper);
  border: 0;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-family: inherit;
}
`;

// Bumped once at process start — visible to confirm the browser is seeing
// this build (Safari/Kobo caches can lie otherwise).
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
