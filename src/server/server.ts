import type { Server } from "bun";
import type { Config } from "../config";
import type { Store } from "../store/store";
import { parseDeviceCookie, buildSetCookieHeader } from "./cookies";
import { randomUUID } from "node:crypto";
import { handleHome, htmlResponse } from "./routes/home";
import { handleCategory } from "./routes/category";
import { handleBook } from "./routes/book";
import { handleCover } from "./routes/cover";
import { handleDownload } from "./routes/download";
import { handleDownloadMobi } from "./routes/downloadMobi";
import { handleSearch } from "./routes/search";
import { handleSyncRetry, handleBookSyncRetry } from "./routes/sync";
import { checkAuth, buildAuthCookieHeader } from "./auth";
import { handleLoginGet, handleLoginPost } from "./routes/login";
import {
  handleOpdsRoot,
  handleOpdsBooks,
  handleOpdsRecent,
  handleOpdsAlphabetical,
  handleOpdsAuthors,
  handleOpdsAuthor,
  handleOpdsTest,
  handleOpdsOsd,
  handleOpdsSearch,
} from "./routes/opds";
import { renderNotFound } from "./templates/notFound";
import type { Ctx } from "./routes/context";

export type ServerDeps = {
  config: Config;
  store: Store;
  skipICloudCheckOnDownload?: boolean;
  onRefreshUnsynced?: () => Promise<number> | void;
};

export function startServer(deps: ServerDeps): Server {
  const { config, store } = deps;

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    async fetch(req: Request, srv): Promise<Response> {
      const url = new URL(req.url);
      const p = url.pathname;

      // /login is always reachable (otherwise nobody could authenticate).
      if (p === "/login") {
        if (req.method === "POST") return handleLoginPost(config.auth, req);
        if (req.method === "GET" || req.method === "HEAD") {
          return handleLoginGet(config.auth);
        }
        return new Response("method not allowed", { status: 405 });
      }

      // Auth gate runs before any other route handling.
      const clientIP = srv.requestIP(req)?.address ?? null;
      const authCheck = checkAuth(config.auth, req, clientIP);
      if (!authCheck.ok) {
        // Browser-style top-level navigation: redirect to /login (friendlier
        // than a popup). OPDS clients, downloads and curl get the 401 path.
        if (shouldRedirectToLogin(p, req)) {
          return new Response(null, {
            status: 302,
            headers: { Location: "/login" },
          });
        }
        return authCheck.response;
      }

      const authCookieHeader = authCheck.ok && "setAuthCookie" in authCheck && authCheck.setAuthCookie
        ? buildAuthCookieHeader(authCheck.setAuthCookie)
        : null;

      const { deviceId, setCookieHeader } = resolveDevice(req, store);
      const ctx: Ctx = {
        store,
        config,
        deviceId,
        skipICloudCheckOnDownload: deps.skipICloudCheckOnDownload,
        onRefreshUnsynced: deps.onRefreshUnsynced,
      };

      let res: Response;
      try {
        res = await route(ctx, req, url);
      } catch (e) {
        console.error(`[server] error on ${url.pathname}:`, e);
        res = new Response("internal error", { status: 500 });
      }

      if (setCookieHeader || authCookieHeader) {
        const h = new Headers(res.headers);
        if (setCookieHeader) h.append("Set-Cookie", setCookieHeader);
        if (authCookieHeader) h.append("Set-Cookie", authCookieHeader);
        res = new Response(res.body, { status: res.status, headers: h });
      }
      return res;
    },
  });

  return server;
}

// Decide whether an unauthenticated request should be redirected to the
// HTML login page or get a Basic Auth 401 challenge. OPDS readers, asset
// fetches, and clients already trying Basic Auth all want 401 — only
// browser-style top-level navigation gets the friendlier redirect.
function shouldRedirectToLogin(path: string, req: Request): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  if (path.startsWith("/opds")) return false;
  if (req.headers.has("authorization")) return false;
  if (/^\/book\/\d+\/(cover|download)/.test(path)) return false;
  return true;
}

function resolveDevice(req: Request, store: Store): { deviceId: string; setCookieHeader: string | null } {
  const cookieId = parseDeviceCookie(req.headers.get("cookie"));
  if (cookieId) {
    store.ensureDevice(cookieId);
    return { deviceId: cookieId, setCookieHeader: null };
  }
  const fresh = randomUUID();
  store.ensureDevice(fresh);
  return { deviceId: fresh, setCookieHeader: buildSetCookieHeader(fresh) };
}

async function route(ctx: Ctx, req: Request, url: URL): Promise<Response> {
  const p = url.pathname;

  // HEAD is treated as GET — Bun.serve will strip the body automatically
  // (and OPDS clients commonly probe with HEAD before downloading).
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("method not allowed", { status: 405 });
  }
  if (p === "/") return handleHome(ctx, url);
  if (p === "/search") return handleSearch(ctx, url);
  if (p === "/sync/retry") return handleSyncRetry(ctx);
  if (p === "/opds" || p === "/opds/") return handleOpdsRoot(ctx, url);
  if (p === "/opds/recent" || p === "/opds/recent/") return handleOpdsRecent(ctx, url);
  if (p === "/opds/alphabetical" || p === "/opds/alphabetical/") return handleOpdsAlphabetical(ctx, url);
  if (p === "/opds/books" || p === "/opds/books/") return handleOpdsBooks(ctx, url);
  if (p === "/opds/authors" || p === "/opds/authors/") return handleOpdsAuthors(ctx, url);
  if (p.startsWith("/opds/author/")) return handleOpdsAuthor(ctx, p.slice("/opds/author/".length));
  if (p === "/opds/test" || p === "/opds/test/") return handleOpdsTest(ctx, url);
  if (p === "/opds/osd" || p === "/opds/osd/") return handleOpdsOsd(ctx, url);
  if (p === "/opds/search" || p.startsWith("/opds/search/")) return handleOpdsSearch(ctx, url);

  let m: RegExpMatchArray | null;

  m = p.match(/^\/c\/([^/]+)\/?$/);
  if (m) return handleCategory(ctx, decodeURIComponent(m[1]!), url);

  m = p.match(/^\/book\/(\d+)\/?$/);
  if (m) return handleBook(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/cover\/?$/);
  if (m) return handleCover(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/download\.mobi\/?$/);
  if (m) return handleDownloadMobi(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/download(?:\.epub)?\/?$/);
  if (m) return handleDownload(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/sync-retry\/?$/);
  if (m) return handleBookSyncRetry(ctx, m[1]!);

  return htmlResponse(renderNotFound(), 404);
}
