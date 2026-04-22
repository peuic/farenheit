import { escapeHtml, layout } from "./layout";
import type { BookWithDownload, CategoryCount } from "../../store/types";

export type SortKey = "recent" | "title" | "author";

export const PAGE_SIZE = 6;

type Opts = {
  pageTitle: string;
  heading: string;
  sort: SortKey;
  sortBasePath: string;
  backHref?: string;
  categories?: CategoryCount[];
  books: BookWithDownload[];
  page: number;
  totalPages: number;
  letterIndex?: Record<string, number> | null;
  tallyHtml?: string;
};

const SEARCH_ICON = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>`;

export function renderHome(o: Opts): string {
  const left = o.backHref
    ? `<a class="back" href="${escapeHtml(o.backHref)}"><span class="back-arrow">←</span>todos</a>`
    : `<span class="brand"><span class="brand-mark">§</span>Farenheit</span>`;

  const headingText = o.backHref && o.heading
    ? escapeHtml(o.heading)
    : "";

  const topbarMain = `
<table class="topbar-main"><tr>
  <td class="col-left">${left}</td>
  <td class="col-center"><span class="heading">${headingText}</span></td>
  <td class="col-right"><a class="icon-btn" href="/search" aria-label="Buscar">${SEARCH_ICON}</a></td>
</tr></table>`;

  const sortLink = (key: SortKey, label: string) => {
    const href = pageUrl(o.sortBasePath, key, 1);
    const cls = o.sort === key ? "active" : "";
    return `<a class="${cls}" href="${href}">${label}</a>`;
  };

  const topbarMeta = `
<table class="topbar-meta"><tr>
  <td class="col-left"><span class="count">${o.tallyHtml ?? ""}</span></td>
  <td class="col-right"><span class="sort">${sortLink("recent", "recente")}${sortLink("title", "título")}${sortLink("author", "autor")}</span></td>
</tr></table>`;

  const alphanavHtml = o.letterIndex
    ? renderAlphanav(o.letterIndex, o.sortBasePath, o.sort)
    : "";

  const booksHtml = o.books.length === 0
    ? `<div class="empty">Nenhum livro por aqui.</div>`
    : `<ul class="book-list">${o.books.map(renderBookItem).join("")}</ul>`;

  const pagerHtml = renderPager(o.page, o.totalPages, o.sortBasePath, o.sort);

  const body = `${topbarMain}${topbarMeta}${alphanavHtml}${booksHtml}${pagerHtml}`;
  return layout(o.pageTitle, body);
}

function renderAlphanav(
  letterIndex: Record<string, number>,
  basePath: string,
  sort: SortKey,
): string {
  const letters = [...ALPHABET, "#"];
  const cells = letters.map((L) => {
    const p = letterIndex[L];
    return p !== undefined
      ? `<td><a href="${pageUrl(basePath, sort, p)}">${L}</a></td>`
      : `<td><span class="empty">${L}</span></td>`;
  }).join("");
  return `<table class="alphanav"><tr>${cells}</tr></table>`;
}

function renderPager(
  page: number,
  totalPages: number,
  basePath: string,
  sort: SortKey,
): string {
  const prevHref = page > 1 ? pageUrl(basePath, sort, page - 1) : null;
  const nextHref = page < totalPages ? pageUrl(basePath, sort, page + 1) : null;
  const prev = prevHref
    ? `<a class="pager-btn" href="${prevHref}">← anterior</a>`
    : `<span class="pager-btn disabled">← anterior</span>`;
  const next = nextHref
    ? `<a class="pager-btn" href="${nextHref}">próximo →</a>`
    : `<span class="pager-btn disabled">próximo →</span>`;
  return `
<table class="pager"><tr>
  <td class="col-left">${prev}</td>
  <td class="col-center"><strong>${page}</strong>&nbsp;de&nbsp;<strong>${Math.max(1, totalPages)}</strong></td>
  <td class="col-right">${next}</td>
</tr></table>`;
}

function renderBookItem(b: BookWithDownload): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover" src="/book/${b.id}/cover?v=${b.mtime}" alt="" width="50" height="75">`
    : `<div class="cover placeholder">sem<br>capa</div>`;
  const authorHtml = b.author
    ? `<div class="author">${escapeHtml(b.author)}</div>`
    : "";
  const classes = [
    b.downloadedAt ? "downloaded" : "",
    !b.onDisk ? "unsynced" : "",
  ].filter(Boolean).join(" ");

  return `
<li class="${classes}">
  <a href="/book/${b.id}">
    <span class="marker"></span>
    ${coverHtml}
    <div class="meta">
      <div class="title">${escapeHtml(b.title)}</div>
      ${authorHtml}
    </div>
  </a>
</li>`;
}

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
