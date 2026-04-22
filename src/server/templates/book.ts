import { escapeHtml, layout } from "./layout";
import type { BookWithDownload } from "../../store/types";

export function renderBook(
  b: BookWithDownload,
  backHref: string,
  mobiAvailable: boolean,
): string {
  const coverHtml = b.coverFilename
    ? `<img class="cover-big" src="/book/${b.id}/cover?v=${b.mtime}" alt="">`
    : `<div class="cover-big placeholder">no cover</div>`;

  const specs = [
    "epub",
    formatSize(b.sizeBytes),
    b.downloadedAt
      ? `downloaded ${formatRelTime(b.downloadedAt)}`
      : `added ${formatRelTime(b.addedAt)}`,
  ].join(`<span class="sep">·</span>`);

  const descriptionText = b.description ? stripHtmlToPlainText(b.description) : "";
  const descriptionHtml = descriptionText
    ? `<div class="description">${escapeHtml(descriptionText)}</div>`
    : "";

  const unsyncedWarn = !b.onDisk
    ? `<div class="warn">This book hasn't downloaded from iCloud yet. You can force a retry.</div>`
    : "";

  let downloadHtml: string;
  if (!b.onDisk) {
    downloadHtml = `<a class="download-btn retry" href="/book/${b.id}/sync-retry"><span class="mark">↻</span>Retry sync</a>`;
  } else if (b.downloadedAt) {
    downloadHtml = `<a class="download-btn done" href="/book/${b.id}/download"><span class="mark">✓</span>Download .epub again</a>`;
  } else {
    downloadHtml = `<a class="download-btn" href="/book/${b.id}/download"><span class="mark">❖</span>Download .epub</a>`;
  }

  // MOBI conversion is only offered when Calibre's ebook-convert is available
  // on the host (see config.ebookConvertPath). Placed below EPUB as a
  // secondary action for Kindle users.
  const mobiHtml = mobiAvailable && b.onDisk
    ? `<a class="download-btn secondary" href="/book/${b.id}/download.mobi"><span class="mark">❖</span>Download .mobi (Kindle)</a>`
    : "";

  const topbar = `
<table class="topbar-main"><tr>
  <td class="col-left"><a class="back" href="${escapeHtml(backHref)}"><span class="back-arrow">←</span>back</a></td>
  <td class="col-center"><span class="heading">Book</span></td>
  <td class="col-right"><a class="icon-btn" href="/" aria-label="Home"><span class="brand-mark">§</span></a></td>
</tr></table>`;

  const body = `${topbar}
<div class="page-narrow">
  <article class="detail">
    ${coverHtml}
    <h1>${escapeHtml(b.title)}</h1>
    ${b.author ? `<div class="byline">— ${escapeHtml(b.author)} —</div>` : ""}
    <div class="specs">${specs}</div>
    ${unsyncedWarn}
    ${descriptionHtml}
    ${downloadHtml}
    ${mobiHtml}
  </article>
</div>`;
  return layout(b.title, body);
}

function stripHtmlToPlainText(raw: string): string {
  return raw
    .replace(/<\s*br\s*\/?>/gi, " ")
    .replace(/<\s*\/\s*p\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRelTime(tsMs: number): string {
  const diff = Date.now() - tsMs;
  const day = 24 * 60 * 60 * 1000;
  if (diff < day) return "today";
  if (diff < 2 * day) return "yesterday";
  const days = Math.floor(diff / day);
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}
