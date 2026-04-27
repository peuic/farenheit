import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";

export const OPDS_PAGE_SIZE = 30;

// Mirrors calibre-web exactly: bare 'application/atom+xml' for the HTTP
// header (with the space before charset that calibre-web uses), the
// profile/kind only inside <link type=…> attributes.
const HTTP_TYPE = "application/atom+xml; charset=utf-8";

// ─── /opds  →  navigation feed ──────────────────────────────────────────
export function handleOpdsRoot(_ctx: Ctx, _url: URL): Response {
  const now = nowIso();
  // Mirrors calibre-web's /opds output exactly: same link order, same
  // attribute layout, same icon+search declarations even when search isn't
  // a primary feature here. Some strict OPDS parsers (Xteink/Onyx built-in)
  // structurally require the OpenSearch link pair before they accept the feed.
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <icon>/static/favicon.ico</icon>
  <id>urn:uuid:00000000-0000-4000-8000-farenheit0000</id>
  <updated>${now}</updated>
  <link rel="self" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" title="Start" href="/opds"
        type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="search"
      href="/opds/osd"
      type="application/opensearchdescription+xml"/>
  <link type="application/atom+xml" rel="search" title="Search" href="/opds/search/{searchTerms}" />
  <title>Farenheit</title>
  <author>
    <name>Farenheit</name>
    <uri>https://github.com/peuic/farenheit</uri>
  </author>
  <entry>
    <title>All books</title>
    <link href="/opds/books" type="application/atom+xml;profile=opds-catalog"/>
    <id>/opds/books</id>
    <updated>${now}</updated>
    <content type="text">All books in the library</content>
  </entry>
</feed>`;
  return xmlResponse(xml);
}

// ─── /opds/osd  →  OpenSearch description ──────────────────────────────
// Some OPDS clients fetch this on first connect to discover search
// capability; failing this request can cascade into "failed to parse feed"
// even when /opds itself is valid.
export function handleOpdsOsd(_ctx: Ctx, _url: URL): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
   <LongName>Farenheit</LongName>
   <ShortName>Farenheit</ShortName>
   <Description>Farenheit eBook Catalog</Description>
   <Url type="application/atom+xml" template="/opds/search?q={searchTerms}"/>
   <SyndicationRight>open</SyndicationRight>
   <Language>en</Language>
   <OutputEncoding>UTF-8</OutputEncoding>
   <InputEncoding>UTF-8</InputEncoding>
</OpenSearchDescription>`;
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/atom+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// ─── /opds/search  →  acquisition feed of search results ────────────────
// Minimum viable search so clients that probe it don't get a 404.
export function handleOpdsSearch(ctx: Ctx, url: URL): Response {
  // Path-style: /opds/search/<term> — OR query-style: ?q=<term>.
  const pathTerm = url.pathname.startsWith("/opds/search/")
    ? decodeURIComponent(url.pathname.slice("/opds/search/".length))
    : "";
  const q = (url.searchParams.get("q") ?? pathTerm).trim();

  const all = ctx.store.list({}).filter((b) => b.onDisk);
  const results = q
    ? all.filter((b) => {
        const needle = q.toLowerCase();
        return (
          b.title.toLowerCase().includes(needle) ||
          (b.author ?? "").toLowerCase().includes(needle)
        );
      })
    : [];
  const entries = results
    .slice(0, OPDS_PAGE_SIZE)
    .map((b) => renderEntry(b, ctx.config.ebookConvertPath !== null))
    .join("\n");

  const now = nowIso();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:uuid:00000000-0000-4000-8000-farenheit0002</id>
  <updated>${now}</updated>
  <link rel="self" href="/opds/search?q=${encodeURIComponent(q)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <title>Search results: ${escapeXml(q)}</title>
  <author>
    <name>Farenheit</name>
    <uri>https://github.com/peuic/farenheit</uri>
  </author>
${entries}
</feed>`;
  return xmlResponse(xml);
}

// ─── /opds/books?offset=N  →  acquisition feed ─────────────────────────
// Calibre-web paginates via ?offset=… (not ?page=…). Match that convention.
export function handleOpdsBooks(ctx: Ctx, url: URL): Response {
  const all = ctx.store.list({}).filter((b) => b.onDisk);
  const total = all.length;

  const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isNaN(rawOffset) || rawOffset < 0 ? 0 : Math.min(rawOffset, Math.max(0, total - 1));
  const books = all.slice(offset, offset + OPDS_PAGE_SIZE);

  const hasNext = offset + OPDS_PAGE_SIZE < total;
  const hasPrev = offset > 0;
  const nextOffset = offset + OPDS_PAGE_SIZE;
  const prevOffset = Math.max(0, offset - OPDS_PAGE_SIZE);

  const xml = renderAcquisitionFeed(books, {
    total,
    hasNext,
    hasPrev,
    nextOffset,
    prevOffset,
    mobiAvailable: ctx.config.ebookConvertPath !== null,
  });

  return xmlResponse(xml);
}

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": HTTP_TYPE,
      "Cache-Control": "no-store",
    },
  });
}

type RenderOpts = {
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextOffset: number;
  prevOffset: number;
  mobiAvailable: boolean;
};

function renderAcquisitionFeed(books: BookWithDownload[], opts: RenderOpts): string {
  const { hasNext, hasPrev, nextOffset, prevOffset, mobiAvailable } = opts;
  const now = nowIso();

  // Calibre-web uses the SAME hardcoded UUID for every feed it serves —
  // we mirror that pattern (one for nav, one for book listings).
  const linkType = "application/atom+xml;profile=opds-catalog;type=feed;kind=navigation";

  const firstLink = hasPrev
    ? `\n  <link rel="first" href="/opds/books" type="${linkType}"/>`
    : "";
  const nextLink = hasNext
    ? `\n  <link rel="next" title="Next" href="/opds/books?offset=${nextOffset}" type="${linkType}"/>`
    : "";
  const prevLink = hasPrev
    ? `\n  <link rel="previous" href="/opds/books?offset=${prevOffset}" type="${linkType}"/>`
    : "";

  const entries = books.map((b) => renderEntry(b, mobiAvailable)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:uuid:00000000-0000-4000-8000-farenheit0001</id>
  <updated>${now}</updated>
  <link rel="self" href="/opds/books" type="${linkType}"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;type=feed;kind=navigation"/>
  <link rel="up" href="/opds" type="application/atom+xml;profile=opds-catalog;type=feed;kind=navigation"/>${firstLink}${nextLink}${prevLink}
  <title>Farenheit</title>
  <author>
    <name>Farenheit</name>
    <uri>https://github.com/peuic/farenheit</uri>
  </author>
${entries}
</feed>`;
}

function renderEntry(b: BookWithDownload, mobiAvailable: boolean): string {
  const id = `urn:farenheit:book:${b.id}`;
  const updated = new Date(b.indexedAt || b.addedAt)
    .toISOString()
    .replace(/\.\d+Z$/, "+00:00"); // calibre-web format: …+00:00 instead of …Z

  const lines: string[] = [];
  lines.push(`  <entry>`);
  lines.push(`    <title>${escapeXml(b.title)}</title>`);
  lines.push(`    <id>${id}</id>`);
  lines.push(`    <updated>${updated}</updated>`);
  if (b.author) {
    lines.push(`    <author>`);
    lines.push(`      <name>${escapeXml(b.author)}</name>`);
    lines.push(`    </author>`);
  }
  if (b.coverFilename) {
    const coverUrl = `/book/${b.id}/cover?v=${b.mtime}`;
    lines.push(`    <link type="image/jpeg" href="${escapeXml(coverUrl)}" rel="http://opds-spec.org/image"/>`);
    lines.push(`    <link type="image/jpeg" href="${escapeXml(coverUrl)}" rel="http://opds-spec.org/image/thumbnail"/>`);
  }
  lines.push(`    <link rel="http://opds-spec.org/acquisition" href="/book/${b.id}/download.epub" length="${b.sizeBytes}" title="EPUB" mtime="${updated}" type="application/epub+zip"/>`);
  if (mobiAvailable) {
    lines.push(`    <link rel="http://opds-spec.org/acquisition" href="/book/${b.id}/download.mobi" title="MOBI" mtime="${updated}" type="application/x-mobipocket-ebook"/>`);
  }
  lines.push(`  </entry>`);
  return lines.join("\n");
}

function nowIso(): string {
  // calibre-web format: "%Y-%m-%dT%H:%M:%S+00:00" (no fractional seconds, +00:00 not Z)
  return new Date().toISOString().replace(/\.\d+Z$/, "+00:00");
}

const ILLEGAL_XML_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g;

function escapeXml(s: string): string {
  return s
    .replace(ILLEGAL_XML_CHARS, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─── /opds/test ─────────────────────────────────────────────────────────
// Static minimal acquisition feed for diagnosing parser quirks.
export function handleOpdsTest(_ctx: Ctx, _url: URL): Response {
  const now = nowIso();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:uuid:00000000-0000-4000-8000-farenheit0099</id>
  <updated>${now}</updated>
  <link rel="self" href="/opds/test" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <title>Farenheit Test</title>
  <author>
    <name>Farenheit</name>
  </author>
  <entry>
    <title>Test Book</title>
    <id>urn:farenheit:test:1</id>
    <updated>${now}</updated>
    <author>
      <name>Test Author</name>
    </author>
    <link rel="http://opds-spec.org/acquisition" href="/book/1/download" type="application/epub+zip"/>
  </entry>
</feed>`;
  return xmlResponse(xml);
}
