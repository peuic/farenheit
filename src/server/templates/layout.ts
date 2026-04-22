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
  --ember-warm: #d2652b;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  background: var(--paper);
  color: var(--ink);
  font-family: Charter, "Iowan Old Style", "Hoefler Text", "Palatino Linotype", Palatino, Georgia, serif;
  font-size: 17px;
  line-height: 1.5;
  font-variant-numeric: oldstyle-nums;
  -webkit-font-smoothing: antialiased;
}
body {
  max-width: 680px;
  margin: 0 auto;
  padding: 18px 22px 56px;
}
a { color: var(--ink); text-decoration: none; }

/* ————— MASTHEAD ————— */
.masthead {
  display: flex;
  align-items: center;
  padding: 8px 0 22px;
  border-bottom: 1px solid var(--hair);
  margin-bottom: 28px;
}
.masthead .brand {
  flex: 1;
  font-style: italic;
  font-size: 20px;
  letter-spacing: 0.01em;
}
.masthead .brand::before {
  content: "§";
  color: var(--ember);
  font-style: normal;
  margin-right: 6px;
}
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  color: var(--ink);
  border: 1px solid transparent;
}
.icon-btn:active {
  background: var(--paper-warm);
  border-color: var(--hair);
}

/* ————— TITLE BLOCK ————— */
.title-block { margin-bottom: 20px; }
.overline {
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 10px;
  color: var(--fade);
  margin-bottom: 6px;
}
.title-block h1 {
  font-style: italic;
  font-weight: normal;
  font-size: 34px;
  line-height: 1.05;
  letter-spacing: -0.01em;
}
.tally {
  margin-top: 10px;
  font-size: 13px;
  color: var(--fade);
}
.tally .sep {
  display: inline-block;
  margin: 0 7px;
  color: var(--fade-light);
}
.tally strong {
  font-weight: normal;
  color: var(--ink);
}
.retry-link {
  color: var(--ember);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
  margin-left: 6px;
  font-style: italic;
}
.retry-link::before { content: "↻ "; text-decoration: none; display: inline-block; }

/* ————— SORT BAR ————— */
.sortbar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  border-top: 1px solid var(--hair);
  padding: 10px 0 12px;
  margin-bottom: 18px;
  font-size: 13px;
}
.sortbar .label {
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-size: 10px;
  color: var(--fade);
}
.sortbar .options a {
  color: var(--fade);
  margin-left: 14px;
  font-style: italic;
  font-size: 14px;
}
.sortbar .options a.active {
  color: var(--ink);
  text-decoration: underline;
  text-underline-offset: 3px;
  text-decoration-thickness: 1px;
}

/* ————— ALPHABET JUMP ————— */
.alphanav {
  display: flex;
  flex-wrap: wrap;
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  padding: 4px 0;
  margin-bottom: 24px;
}
.alphanav a,
.alphanav span {
  flex: 1 1 0;
  text-align: center;
  min-width: 28px;
  min-height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-style: italic;
  font-size: 14px;
}
.alphanav a { color: var(--ink); }
.alphanav span { color: var(--hair); }
.alphanav a:active { background: var(--paper-warm); }

/* ————— CATEGORIES ————— */
.categories {
  padding: 14px 0;
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  margin-bottom: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.categories a {
  font-style: italic;
  font-size: 14px;
  padding: 6px 12px;
  border: 1px solid var(--hair);
}
.categories a:active { background: var(--paper-warm); }

/* ————— LETTER SECTIONS ————— */
.letter-head {
  display: flex;
  align-items: baseline;
  gap: 12px;
  margin: 18px 0 6px;
  padding-top: 8px;
}
.letter-head:first-of-type { margin-top: 0; padding-top: 0; }
.letter-head .letter {
  font-style: italic;
  font-size: 26px;
  color: var(--ember);
  min-width: 18px;
}
.letter-head .rule {
  flex: 1;
  height: 1px;
  background: var(--hair);
  align-self: center;
}
.letter-head .count {
  font-size: 11px;
  color: var(--fade);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* ————— BOOK LIST ————— */
.book-list {
  list-style: none;
  margin-bottom: 28px;
}
.book-list li {
  border-bottom: 1px solid var(--hair);
  position: relative;
}
.book-list li:last-child { border-bottom: 0; }
.book-list a {
  display: flex;
  gap: 14px;
  padding: 12px 4px 12px 22px;
  color: inherit;
  align-items: center;
  min-height: 72px;
}
.book-list .marker {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  line-height: 1;
  color: var(--fade-light);
  font-family: "Courier New", Courier, monospace;
  font-size: 13px;
  text-align: center;
}
.book-list li.downloaded .marker::before { content: "✓"; color: var(--ember); }
.book-list li.unsynced .marker::before { content: "⊙"; color: var(--fade-light); }
.book-list .cover {
  width: 44px;
  height: 66px;
  flex-shrink: 0;
  object-fit: cover;
  border: 1px solid var(--hair);
  background: var(--paper-warm);
}
.book-list .cover.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  font-size: 9px;
  color: var(--fade);
  font-style: italic;
  text-align: center;
  line-height: 1.15;
}
.book-list .meta { flex: 1; min-width: 0; }
.book-list .meta .title {
  font-size: 16px;
  line-height: 1.22;
  margin-bottom: 2px;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.book-list .meta .author {
  font-size: 12px;
  font-style: italic;
  color: var(--fade);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.book-list li.downloaded .meta .title { color: var(--fade); }
.book-list li.unsynced .meta .title { color: var(--fade); font-style: italic; }

/* ————— DETAIL ————— */
.nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 16px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--hair);
  font-size: 13px;
}
.nav a { color: var(--fade); font-style: italic; }
.nav a.back::before { content: "← "; }

.detail .cover-big {
  display: block;
  width: 200px;
  margin: 4px auto 22px;
  border: 1px solid var(--hair);
  background: var(--paper-warm);
}
.detail .cover-big.placeholder {
  width: 200px;
  height: 300px;
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
  font-size: 28px;
  line-height: 1.1;
  text-align: center;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
}
.detail .byline {
  text-align: center;
  font-size: 15px;
  color: var(--fade);
  font-style: italic;
  margin-bottom: 18px;
}
.detail .byline::before { content: "— "; }
.detail .byline::after { content: " —"; }
.detail .specs {
  text-align: center;
  font-size: 10px;
  color: var(--fade);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  padding: 12px 0;
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  margin-bottom: 22px;
}
.detail .specs .sep {
  display: inline-block;
  margin: 0 10px;
  color: var(--fade-light);
}
.detail .description {
  font-size: 15px;
  line-height: 1.7;
  color: var(--ink-soft);
  text-align: justify;
  hyphens: auto;
  -webkit-hyphens: auto;
  margin-bottom: 28px;
  padding: 0 4px;
}
.detail .description::first-letter {
  font-size: 2.6em;
  float: left;
  line-height: 0.9;
  padding: 4px 8px 0 0;
  font-style: italic;
  color: var(--ember);
}

/* ————— BUTTONS ————— */
.download-btn {
  display: block;
  padding: 18px;
  text-align: center;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  border: 1.5px solid var(--ink);
  background: var(--paper);
  color: var(--ink);
}
.download-btn::before {
  content: "❖";
  color: var(--ember);
  margin-right: 10px;
}
.download-btn.done {
  color: var(--fade);
  border: 1px dashed var(--hair);
  padding: 16px;
}
.download-btn.done::before { content: "✓"; color: var(--fade); }
.download-btn.retry {
  color: var(--ember);
  border: 1.5px solid var(--ember);
}
.download-btn.retry::before { content: "↻"; }
.download-btn:active { background: var(--paper-warm); }

/* ————— WARN ————— */
.warn {
  padding: 14px 16px;
  border-left: 3px solid var(--ember);
  background: var(--paper-warm);
  font-size: 14px;
  font-style: italic;
  color: var(--ink-soft);
  margin: 14px 0 20px;
}
.warn::before { content: "⏳ "; font-style: normal; margin-right: 4px; }

/* ————— SEARCH ————— */
.search-inline { margin-bottom: 24px; }
.search-inline input {
  width: 100%;
  padding: 12px 0 10px;
  font-size: 18px;
  font-family: inherit;
  font-style: italic;
  border: 0;
  border-bottom: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  outline: none;
}
.search-inline input::placeholder { color: var(--fade-light); }
.search { margin-bottom: 28px; }
.search input[type="text"] {
  width: 100%;
  padding: 14px 0;
  font-size: 22px;
  font-family: inherit;
  font-style: italic;
  border: 0;
  border-bottom: 1px solid var(--ink);
  background: transparent;
  color: var(--ink);
  outline: none;
}
.search input[type="text"]::placeholder {
  color: var(--fade-light);
}
.search button {
  margin-top: 12px;
  padding: 12px 22px;
  background: var(--ink);
  color: var(--paper);
  border: 0;
  font-family: inherit;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
}

/* ————— EMPTY STATE ————— */
.empty {
  text-align: center;
  padding: 48px 0 32px;
  color: var(--fade);
  font-style: italic;
}
.empty::before {
  content: "✦";
  display: block;
  font-size: 24px;
  color: var(--hair);
  margin-bottom: 12px;
}
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
