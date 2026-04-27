import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";

// OPDS clients (KOReader, Aldiko, the Xteink built-in reader, …) typically
// handle larger feed batches than the web UI. 30 per page is the common
// sweet spot — small enough to render quickly, big enough to avoid lots of
// page turns when browsing.
export const OPDS_PAGE_SIZE = 30;

const FEED_TYPE = "application/atom+xml;profile=opds-catalog;kind=acquisition";

export function handleOpds(ctx: Ctx, url: URL): Response {
  const rawPage = Number.parseInt(url.searchParams.get("page") ?? "1", 10);
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;

  // Only serve books that are actually on disk — OPDS clients have no UI
  // to retry an iCloud sync; downloading a placeholder would just fail.
  const all = ctx.store.list({}).filter((b) => b.onDisk);
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / OPDS_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * OPDS_PAGE_SIZE;
  const books = all.slice(offset, offset + OPDS_PAGE_SIZE);

  const base = `${url.protocol}//${url.host}`;
  const xml = renderOpdsCatalog(books, {
    base,
    page: currentPage,
    totalPages,
    total,
    mobiAvailable: ctx.config.ebookConvertPath !== null,
  });

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": `${FEED_TYPE};charset=utf-8`,
      "Cache-Control": "no-store",
    },
  });
}

type RenderOpts = {
  base: string;
  page: number;
  totalPages: number;
  total: number;
  mobiAvailable: boolean;
};

function renderOpdsCatalog(books: BookWithDownload[], opts: RenderOpts): string {
  const { base, page, totalPages, total, mobiAvailable } = opts;
  const now = new Date().toISOString();

  const selfHref = page > 1 ? `${base}/opds?page=${page}` : `${base}/opds`;
  const startHref = `${base}/opds`;
  const nextLink = page < totalPages
    ? `<link rel="next" href="${base}/opds?page=${page + 1}" type="${FEED_TYPE}"/>`
    : "";
  const prevLink = page > 1
    ? `<link rel="previous" href="${page > 2 ? `${base}/opds?page=${page - 1}` : startHref}" type="${FEED_TYPE}"/>`
    : "";

  const entries = books.map((b) => renderEntry(b, base, mobiAvailable)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>urn:farenheit:catalog</id>
  <link rel="self" href="${selfHref}" type="${FEED_TYPE}"/>
  <link rel="start" href="${startHref}" type="${FEED_TYPE}"/>
  ${nextLink}
  ${prevLink}
  <title>Farenheit</title>
  <subtitle>${total} ${total === 1 ? "book" : "books"}</subtitle>
  <updated>${now}</updated>
  <author><name>Farenheit</name></author>
${entries}
</feed>`;
}

function renderEntry(
  b: BookWithDownload,
  base: string,
  mobiAvailable: boolean,
): string {
  const id = `urn:farenheit:book:${b.id}`;
  const updated = new Date(b.indexedAt || b.addedAt).toISOString();
  const author = b.author
    ? `<author><name>${escapeXml(b.author)}</name></author>`
    : "";

  const coverUrl = b.coverFilename
    ? `${base}/book/${b.id}/cover?v=${b.mtime}`
    : null;
  const coverLinks = coverUrl
    ? `<link rel="http://opds-spec.org/image" type="image/jpeg" href="${coverUrl}"/>
    <link rel="http://opds-spec.org/image/thumbnail" type="image/jpeg" href="${coverUrl}"/>`
    : "";

  const summary = b.description
    ? `<summary type="text">${escapeXml(stripHtmlPlain(b.description))}</summary>`
    : "";

  const epubLink = `<link rel="http://opds-spec.org/acquisition" type="application/epub+zip" href="${base}/book/${b.id}/download" title="EPUB"/>`;
  const mobiLink = mobiAvailable
    ? `<link rel="http://opds-spec.org/acquisition" type="application/x-mobipocket-ebook" href="${base}/book/${b.id}/download.mobi" title="MOBI"/>`
    : "";

  return `  <entry>
    <id>${id}</id>
    <title>${escapeXml(b.title)}</title>
    ${author}
    <updated>${updated}</updated>
    ${summary}
    ${coverLinks}
    ${epubLink}
    ${mobiLink}
  </entry>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Same logic the book detail template uses — duplicated here to avoid a
// circular import via the templates layer.
function stripHtmlPlain(raw: string): string {
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
