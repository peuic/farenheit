import type { Ctx } from "./context";
import type { BookWithDownload } from "../../store/types";

export const OPDS_PAGE_SIZE = 30;

const HTTP_TYPE = "application/atom+xml; charset=utf-8";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

// ════════════════════════════════════════════════════════════════════════
//  /opds  →  navigation root with multiple sub-feeds
// ════════════════════════════════════════════════════════════════════════
export function handleOpdsRoot(_ctx: Ctx, _url: URL): Response {
  const now = nowIso();
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
    <title>Recent</title>
    <link href="/opds/recent" type="application/atom+xml;profile=opds-catalog"/>
    <id>/opds/recent</id>
    <updated>${now}</updated>
    <content type="text">Most recently added books</content>
  </entry>
  <entry>
    <title>Alphabetical</title>
    <link href="/opds/alphabetical" type="application/atom+xml;profile=opds-catalog"/>
    <id>/opds/alphabetical</id>
    <updated>${now}</updated>
    <content type="text">All books sorted by title</content>
  </entry>
  <entry>
    <title>By Author</title>
    <link href="/opds/authors" type="application/atom+xml;profile=opds-catalog"/>
    <id>/opds/authors</id>
    <updated>${now}</updated>
    <content type="text">Books grouped by author</content>
  </entry>
</feed>`;
  return xmlResponse(xml);
}

// ════════════════════════════════════════════════════════════════════════
//  /opds/recent  →  top 30 by addedAt DESC, no pagination
// ════════════════════════════════════════════════════════════════════════
export function handleOpdsRecent(ctx: Ctx, _url: URL): Response {
  const all = ctx.store.list({}).filter((b) => b.onDisk);
  // Already sorted by mtime DESC (= birthtime / when file appeared on disk)
  const books = all.slice(0, OPDS_PAGE_SIZE);
  const xml = renderAcquisition(books, {
    selfHref: "/opds/recent",
    title: "Farenheit — Recent",
    feedId: "urn:uuid:00000000-0000-4000-8000-farenheit0001",
    mobiAvailable: ctx.config.ebookConvertPath !== null,
  });
  return xmlResponse(xml);
}

// ════════════════════════════════════════════════════════════════════════
//  /opds/alphabetical  →  all books by title, paginated
//  /opds/books  → alias (kept for stable links)
// ════════════════════════════════════════════════════════════════════════
export function handleOpdsAlphabetical(ctx: Ctx, url: URL): Response {
  const all = ctx.store
    .list({})
    .filter((b) => b.onDisk)
    .sort((a, b) => a.title.localeCompare(b.title));

  const total = all.length;
  const rawOffset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10);
  const offset = Number.isNaN(rawOffset) || rawOffset < 0
    ? 0
    : Math.min(rawOffset, Math.max(0, total - 1));
  const books = all.slice(offset, offset + OPDS_PAGE_SIZE);

  const hasNext = offset + OPDS_PAGE_SIZE < total;
  const hasPrev = offset > 0;

  const xml = renderAcquisition(books, {
    selfHref: "/opds/alphabetical" + (offset > 0 ? `?offset=${offset}` : ""),
    title: "Farenheit — Alphabetical",
    feedId: `urn:uuid:00000000-0000-4000-8000-farenheit0002${offset > 0 ? `:${offset}` : ""}`,
    mobiAvailable: ctx.config.ebookConvertPath !== null,
    pagination: {
      basePath: "/opds/alphabetical",
      hasNext,
      hasPrev,
      nextOffset: offset + OPDS_PAGE_SIZE,
      prevOffset: Math.max(0, offset - OPDS_PAGE_SIZE),
    },
  });
  return xmlResponse(xml);
}

// ════════════════════════════════════════════════════════════════════════
//  /opds/authors  →  navigation feed of unique authors A-Z
// ════════════════════════════════════════════════════════════════════════
export function handleOpdsAuthors(ctx: Ctx, _url: URL): Response {
  const all = ctx.store.list({}).filter((b) => b.onDisk);
  const counts = new Map<string, number>();
  for (const b of all) {
    const author = b.author?.trim() || "Unknown";
    counts.set(author, (counts.get(author) ?? 0) + 1);
  }
  const authors = [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));

  const now = nowIso();
  const entries = authors.map(([author, count]) => {
    const slug = encodeURIComponent(author);
    return `  <entry>
    <title>${escapeXml(author)}</title>
    <link href="/opds/author/${slug}" type="application/atom+xml;profile=opds-catalog"/>
    <id>/opds/author/${slug}</id>
    <updated>${now}</updated>
    <content type="text">${count} ${count === 1 ? "book" : "books"}</content>
  </entry>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:uuid:00000000-0000-4000-8000-farenheit0003</id>
  <updated>${now}</updated>
  <link rel="self" href="/opds/authors" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <link rel="up" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <title>Farenheit — By Author</title>
  <author>
    <name>Farenheit</name>
    <uri>https://github.com/peuic/farenheit</uri>
  </author>
${entries}
</feed>`;
  return xmlResponse(xml);
}

// ════════════════════════════════════════════════════════════════════════
//  /opds/author/<encoded-name>  →  books by that author
// ════════════════════════════════════════════════════════════════════════
export function handleOpdsAuthor(ctx: Ctx, encodedName: string): Response {
  let author: string;
  try {
    author = decodeURIComponent(encodedName);
  } catch {
    return new Response("invalid author", { status: 400 });
  }
  const matchKey = author === "Unknown" ? null : author;
  const books = ctx.store
    .list({})
    .filter((b) => b.onDisk)
    .filter((b) => (b.author?.trim() || "Unknown") === (matchKey ?? "Unknown"))
    .sort((a, b) => a.title.localeCompare(b.title));

  const xml = renderAcquisition(books, {
    selfHref: `/opds/author/${encodeURIComponent(author)}`,
    title: `Farenheit — ${author}`,
    feedId: `urn:farenheit:author:${encodeURIComponent(author)}`,
    mobiAvailable: ctx.config.ebookConvertPath !== null,
  });
  return xmlResponse(xml);
}

// ════════════════════════════════════════════════════════════════════════
//  /opds/osd  →  OpenSearch description
// ════════════════════════════════════════════════════════════════════════
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
    headers: { "Content-Type": HTTP_TYPE, "Cache-Control": "no-store" },
  });
}

// ════════════════════════════════════════════════════════════════════════
//  /opds/search  →  full-text search results
// ════════════════════════════════════════════════════════════════════════
export function handleOpdsSearch(ctx: Ctx, url: URL): Response {
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
  const xml = renderAcquisition(results.slice(0, OPDS_PAGE_SIZE), {
    selfHref: `/opds/search?q=${encodeURIComponent(q)}`,
    title: `Farenheit — Search: ${q}`,
    feedId: "urn:uuid:00000000-0000-4000-8000-farenheit0004",
    mobiAvailable: ctx.config.ebookConvertPath !== null,
  });
  return xmlResponse(xml);
}

// ════════════════════════════════════════════════════════════════════════
//  /opds/test  →  static minimal feed for diagnostics
// ════════════════════════════════════════════════════════════════════════
export function handleOpdsTest(_ctx: Ctx, _url: URL): Response {
  const now = nowIso();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>urn:uuid:00000000-0000-4000-8000-farenheit0099</id>
  <updated>${now}</updated>
  <link rel="self" href="/opds/test" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>
  <title>Farenheit Test</title>
  <author><name>Farenheit</name></author>
  <entry>
    <title>Test Book</title>
    <id>urn:farenheit:test:1</id>
    <updated>${now}</updated>
    <author><name>Test Author</name></author>
    <link rel="http://opds-spec.org/acquisition" href="/book/1/download.epub" type="application/epub+zip"/>
  </entry>
</feed>`;
  return xmlResponse(xml);
}

// ─── shared rendering ──────────────────────────────────────────────────

type AcquisitionOpts = {
  selfHref: string;
  title: string;
  feedId: string;
  mobiAvailable: boolean;
  pagination?: {
    basePath: string;
    hasNext: boolean;
    hasPrev: boolean;
    nextOffset: number;
    prevOffset: number;
  };
};

function renderAcquisition(books: BookWithDownload[], opts: AcquisitionOpts): string {
  const now = nowIso();
  const linkType = "application/atom+xml;profile=opds-catalog;type=feed;kind=navigation";

  const pagLinks: string[] = [];
  if (opts.pagination) {
    const { basePath, hasNext, hasPrev, nextOffset, prevOffset } = opts.pagination;
    if (hasPrev) pagLinks.push(`  <link rel="first" href="${basePath}" type="${linkType}"/>`);
    if (hasNext) pagLinks.push(`  <link rel="next" title="Next" href="${basePath}?offset=${nextOffset}" type="${linkType}"/>`);
    if (hasPrev) pagLinks.push(`  <link rel="previous" href="${basePath}${prevOffset > 0 ? `?offset=${prevOffset}` : ""}" type="${linkType}"/>`);
  }
  const pagination = pagLinks.length ? "\n" + pagLinks.join("\n") : "";

  const entries = books.map((b) => renderEntry(b, opts.mobiAvailable)).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${opts.feedId}</id>
  <updated>${now}</updated>
  <link rel="self" href="${escapeXml(opts.selfHref)}" type="${linkType}"/>
  <link rel="start" href="/opds" type="application/atom+xml;profile=opds-catalog;type=feed;kind=navigation"/>
  <link rel="up" href="/opds" type="application/atom+xml;profile=opds-catalog;type=feed;kind=navigation"/>${pagination}
  <title>${escapeXml(opts.title)}</title>
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
    .replace(/\.\d+Z$/, "+00:00");

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

  // Description back as xhtml content (calibre-web's exact format).
  if (b.description) {
    const desc = stripHtmlPlain(b.description);
    if (desc) {
      lines.push(`    <content type="xhtml"><div xmlns="${XHTML_NS}">${escapeXml(desc)}</div></content>`);
    }
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

// ─── helpers ────────────────────────────────────────────────────────────

function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": HTTP_TYPE,
      "Cache-Control": "no-store",
    },
  });
}

function nowIso(): string {
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

// ─── legacy alias: /opds/books still works ─────────────────────────────
export const handleOpdsBooks = handleOpdsAlphabetical;
