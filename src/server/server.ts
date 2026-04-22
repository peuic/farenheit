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
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);
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

      if (setCookieHeader) {
        const h = new Headers(res.headers);
        h.append("Set-Cookie", setCookieHeader);
        res = new Response(res.body, { status: res.status, headers: h });
      }
      return res;
    },
  });

  return server;
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

  if (req.method !== "GET") return new Response("method not allowed", { status: 405 });
  if (p === "/") return handleHome(ctx, url);
  if (p === "/search") return handleSearch(ctx, url);
  if (p === "/sync/retry") return handleSyncRetry(ctx);

  let m: RegExpMatchArray | null;

  m = p.match(/^\/c\/([^/]+)\/?$/);
  if (m) return handleCategory(ctx, decodeURIComponent(m[1]!), url);

  m = p.match(/^\/book\/(\d+)\/?$/);
  if (m) return handleBook(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/cover\/?$/);
  if (m) return handleCover(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/download\.mobi\/?$/);
  if (m) return handleDownloadMobi(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/download\/?$/);
  if (m) return handleDownload(ctx, m[1]!);

  m = p.match(/^\/book\/(\d+)\/sync-retry\/?$/);
  if (m) return handleBookSyncRetry(ctx, m[1]!);

  return htmlResponse(renderNotFound(), 404);
}
