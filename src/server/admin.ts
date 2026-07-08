import type { Server } from "bun";
import { Database } from "bun:sqlite";
import type { Config } from "../config";
import { renderAdmin } from "./templates/admin";

// Admin/analytics server. Bound to a separate port (config.adminPort,
// default 1112) that's intentionally NOT advertised through Tailscale
// Funnel — only main port 1111 is. So this dashboard is reachable on
// LAN/loopback but invisible to the public internet.

export type AdminDeps = {
  config: Config;
};

export function startAdminServer(deps: AdminDeps): Server {
  const { config } = deps;
  // Separate read-only handle — keeps admin queries isolated from
  // Store's write transactions and avoids depending on internals.
  const db = new Database(config.dbPath, { readonly: true });

  return Bun.serve({
    hostname: config.host,
    port: config.adminPort,
    idleTimeout: 120,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/admin/") {
        const html = renderAdmin(db);
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
}
