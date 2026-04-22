import { escapeHtml, layout } from "./layout";
import type { BookWithDownload, CategoryCount } from "../../store/types";

export type SortKey = "recent" | "title" | "author";

export const PAGE_SIZE = 5;

type Opts = {
  pageTitle: string;
  heading: string;                                 // category name OR "" for home
  sort: SortKey;
  sortBasePath: string;                            // "/" or "/c/Ficcao"
  backHref?: string;                               // "/" for category page
  categories?: CategoryCount[];                    // (unused in topbar layout)
  books: BookWithDownload[];                       // already paginated
  page: number;
  totalPages: number;
  letterIndex?: Record<string, number> | null;
  tallyHtml?: string;                              // compact count + retry
};

const SEARCH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`;

export function renderHome(o: Opts): string {
  const sortLink = (key: SortKey, label: string) => {
    const href = pageUrl(o.sortBasePath, key, 1);
    const cls = o.sort === key ? "active" : "";
    return `<a class="${cls}" href="${href}">${label}</a>`;
  };

  const primaryLeft = o.backHref
    ? `<a class="back" href="${escapeHtml(o.backHref)}">todos</a>
       <span class="heading">${escapeHtml(o.heading)}</span>`
    : `<span class="brand">Farenheit</span>
       <span class="heading"></span>`;

  const topbar = `
<header class="topbar">
  <div class="line primary">
    ${primaryLeft}
    <span class="icons">
      <a class="icon-btn" href="/search" aria-label="Buscar">${SEARCH_ICON}</a>
    </span>
  </div>
  <div class="line meta">
    ${o.tallyHtml ? `<span class="count">${o.tallyHtml}</span>` : ""}
    <span class="sort">
      ${sortLink("recent", "recente")}
      ${sortLink("title", "título")}
      ${sortLink("author", "autor")}
    </span>
  </div>
</header>`;

  const alphanavHtml = o.letterIndex
    ? renderAlphanav(o.letterIndex, o.sortBasePath, o.sort)
    : "";

  const booksHtml = o.books.length === 0
    ? `<div class="empty" style="flex:1;display:flex;flex-direction:column;justify-content:center">Nenhum livro por aqui.</div>`
    : `<ul class="book-list fill">${o.books.map(renderBookItem).join("")}</ul>`;

  const pagerHtml = renderPager(o.page, o.totalPages, o.sortBasePath, o.sort);

  const body = `${topbar}${alphanavHtml}${booksHtml}${pagerHtml}`;
  return layout(o.pageTitle, body);
}

function renderAlphanav(
  letterIndex: Record<string, number>,
  basePath: string,
  sort: SortKey,
): string {
  const cells: string[] = [];
  for (const L of ALPHABET) {
    const p = letterIndex[L];
    cells.push(p !== undefined
      ? `<a href="${pageUrl(basePath, sort, p)}">${L}</a>`
      : `<span aria-hidden="true">${L}</span>`);
  }
  const hashPage = letterIndex["#"];
  cells.push(hashPage !== undefined
    ? `<a href="${pageUrl(basePath, sort, hashPage)}">#</a>`
    : `<span aria-hidden="true">#</span>`);
  return `<nav class="alphanav" aria-label="Pular para letra">${cells.join("")}</nav>`;
}

function renderPager(
  page: number,
  totalPages: number,
  basePath: string,
  sort: SortKey,
): string {
  // Always render the pager so it sticks to the bottom even on single-page
  // results — gives the layout a consistent footer across refreshes.
  const prevHref = page > 1 ? pageUrl(basePath, sort, page - 1) : null;
  const nextHref = page < totalPages ? pageUrl(basePath, sort, page + 1) : null;
  const prev = prevHref
    ? `<a class="pager-btn prev" href="${prevHref}">← anterior</a>`
    : `<span class="pager-btn prev disabled" aria-hidden="true">← anterior</span>`;
  const next = nextHref
    ? `<a class="pager-btn next" href="${nextHref}">próximo →</a>`
    : `<span class="pager-btn next disabled" aria-hidden="true">próximo →</span>`;
  return `
<nav class="pager" aria-label="Paginação">
  ${prev}
  <span class="pager-label">
    <strong>${page}</strong><span class="pager-of">de</span><strong>${Math.max(1, totalPages)}</strong>
  </span>
  ${next}
</nav>`;
}

function renderBookItem(b: BookWithDownload): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover" src="/book/${b.id}/cover?v=${b.mtime}" alt="" loading="lazy" width="42" height="63">`
    : `<div class="cover placeholder">sem capa</div>`;
  const authorHtml = b.author ? `<div class="author">${escapeHtml(b.author)}</div>` : "";
  const classes = [
    b.downloadedAt ? "downloaded" : "",
    !b.onDisk ? "unsynced" : "",
  ].filter(Boolean).join(" ");
  return `
<li class="${classes}">
  <span class="marker" aria-hidden="true"></span>
  <a href="/book/${b.id}">
    ${coverHtml}
    <div class="meta">
      <div class="title">${escapeHtml(b.title)}</div>
      ${authorHtml}
    </div>
  </a>
</li>`;
}

// ——— helpers ———

export function pageUrl(basePath: string, sort: SortKey, page: number): string {
  const params: string[] = [];
  if (sort !== "recent") params.push(`sort=${sort}`);
  if (page > 1) params.push(`page=${page}`);
  return params.length ? `${basePath}?${params.join("&")}` : basePath;
}

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function firstLetter(s: string): string {
  const trimmed = s.replace(/^[\s"'“”«»¿¡(—–-]+/, "");
  const firstChar = trimmed.charAt(0);
  if (!firstChar) return "#";
  const folded = firstChar.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const up = folded.toUpperCase();
  return /^[A-Z]$/.test(up) ? up : "#";
}

export function buildLetterIndex(
  sortedBooks: BookWithDownload[],
  pageSize: number,
  keyFn: (b: BookWithDownload) => string,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (let i = 0; i < sortedBooks.length; i++) {
    const L = firstLetter(keyFn(sortedBooks[i]!));
    if (map[L] === undefined) {
      map[L] = Math.floor(i / pageSize) + 1;
    }
  }
  return map;
}
