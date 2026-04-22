import { escapeHtml, layout } from "./layout";
import type { BookWithDownload, CategoryCount } from "../../store/types";

export type SortKey = "recent" | "title" | "author";

type Opts = {
  pageTitle: string;
  overline: string;
  heading: string;
  tallyHtml?: string;            // raw HTML — caller-escaped
  sort: SortKey;
  sortBasePath: string;          // "/" or "/c/Ficcao" — determines sort links
  backHref?: string;
  categories?: CategoryCount[];
  books: BookWithDownload[];
};

const SEARCH_ICON = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`;

export function renderHome(o: Opts): string {
  const categoriesHtml = (o.categories ?? []).length
    ? `<nav class="categories" aria-label="Categorias">
         ${o.categories!.map(c =>
           `<a href="/c/${encodeURIComponent(c.name)}">${escapeHtml(c.name)} · ${c.count}</a>`
         ).join("")}
       </nav>`
    : "";

  const sortBarHtml = renderSortBar(o.sort, o.sortBasePath);

  const booksHtml = o.books.length === 0
    ? `<div class="empty">Nenhum livro por aqui.</div>`
    : o.sort === "title"
      ? renderGroupedByLetter(o.books, (b) => b.title)
      : o.sort === "author"
        ? renderGroupedByLetter(o.books, (b) => b.author ?? b.title)
        : `<ul class="book-grid">${o.books.map(renderBookItem).join("")}</ul>`;

  const backLink = o.backHref
    ? `<a class="back" href="${escapeHtml(o.backHref)}">todos</a>`
    : `<span></span>`;

  const body = `
<header class="masthead">
  <div class="brand">Farenheit</div>
  ${backLink}
  <a class="icon-btn" href="/search" aria-label="Buscar">${SEARCH_ICON}</a>
</header>

<section class="title-block">
  <div class="overline">${escapeHtml(o.overline)}</div>
  <h1>${escapeHtml(o.heading)}</h1>
  ${o.tallyHtml ? `<div class="tally">${o.tallyHtml}</div>` : ""}
</section>

${categoriesHtml}
${sortBarHtml}
${booksHtml}
`;
  return layout(o.pageTitle, body);
}

function renderSortBar(sort: SortKey, basePath: string): string {
  const link = (key: SortKey, label: string) => {
    const href = key === "recent" ? basePath : `${basePath}?sort=${key}`;
    const cls = sort === key ? "active" : "";
    return `<a class="${cls}" href="${href}">${label}</a>`;
  };
  return `
<div class="sortbar">
  <span class="label">Ordenar por</span>
  <span class="options">
    ${link("recent", "recente")}
    ${link("title", "título")}
    ${link("author", "autor")}
  </span>
</div>`;
}

function renderGroupedByLetter(
  books: BookWithDownload[],
  keyFn: (b: BookWithDownload) => string,
): string {
  const groups = new Map<string, BookWithDownload[]>();
  for (const b of books) {
    const letter = firstLetter(keyFn(b));
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(b);
  }
  const letters = Array.from(groups.keys()).sort(localeCompareLetters);

  const navHtml = `
<nav class="alphanav" aria-label="Jump to letter">
  ${ALPHABET.map((L) =>
    groups.has(L)
      ? `<a href="#L-${L}">${L}</a>`
      : `<span aria-hidden="true">${L}</span>`,
  ).join("")}
  ${groups.has("#")
    ? `<a href="#L-%23">#</a>`
    : `<span aria-hidden="true">#</span>`}
</nav>
`;

  const sectionsHtml = letters
    .map((letter) => {
      const items = groups.get(letter)!;
      return `
<section class="letter-section" id="L-${encodeURIComponent(letter)}">
  <div class="letter-head">
    <span class="letter">${letter === "#" ? "#" : letter}</span>
    <span class="rule"></span>
    <span class="count">${items.length}</span>
  </div>
  <ul class="book-grid">${items.map(renderBookItem).join("")}</ul>
</section>`;
    })
    .join("");

  return navHtml + sectionsHtml;
}

function renderBookItem(b: BookWithDownload): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover" src="/book/${b.id}/cover?v=${b.mtime}" alt="" loading="lazy">`
    : `<div class="cover placeholder">sem capa</div>`;
  const authorHtml = b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : "";
  const classes = [
    b.downloadedAt ? "downloaded" : "",
    !b.onDisk ? "unsynced" : "",
  ].filter(Boolean).join(" ");

  return `
<li class="${classes}">
  <a href="/book/${b.id}">
    <div class="cover-wrap">
      ${coverHtml}
      <span class="marker" aria-hidden="true"></span>
    </div>
    <div class="title">${escapeHtml(b.title)}</div>
    ${authorHtml}
  </a>
</li>`;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function firstLetter(s: string): string {
  // Strip leading punctuation/articles, pick first alpha char (A-Z uppercased
  // and diacritic-folded so "Álvaro" lands under A).
  const trimmed = s.replace(/^[\s"'“”«»¿¡(—–-]+/, "");
  const firstChar = trimmed.charAt(0);
  if (!firstChar) return "#";
  const folded = firstChar.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const up = folded.toUpperCase();
  return /^[A-Z]$/.test(up) ? up : "#";
}

function localeCompareLetters(a: string, b: string): number {
  if (a === "#") return 1;
  if (b === "#") return -1;
  return a.localeCompare(b);
}
