import { networkInterfaces } from "node:os";
import { loadConfig } from "./config";
import { Store } from "./store/store";
import { Indexer } from "./indexer/indexer";
import { startServer } from "./server/server";

for (const level of ["log", "info", "warn", "error"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => orig(new Date().toISOString(), ...args);
}

function findLanIps(): string[] {
  const out: string[] = [];
  const ifs = networkInterfaces();
  for (const list of Object.values(ifs)) {
    if (!list) continue;
    for (const info of list) {
      if (info.family === "IPv4" && !info.internal) out.push(info.address);
    }
  }
  return out;
}

async function main() {
  const config = loadConfig();
  console.log(`[farenheit] BOOKS_DIR=${config.booksDir}`);
  console.log(`[farenheit] DATA_DIR=${config.dataDir}`);

  const store = new Store(config.dbPath);
  const indexer = new Indexer({
    booksDir: config.booksDir,
    coversDir: config.coversDir,
    store,
  });

  console.log("[farenheit] initial scan…");
  const t0 = Date.now();
  await indexer.scanAll();
  console.log(`[farenheit] scan done in ${Date.now() - t0}ms`);

  indexer.watch();
  indexer.startPeriodicRefresh(); // re-check unsynced every 2 min (iCloud silent materialization)

  const server = startServer({
    config,
    store,
    onRefreshUnsynced: () => indexer.refreshUnsynced(),
  });
  const ips = findLanIps();
  console.log(`[farenheit] listening on ${server.hostname}:${server.port}`);
  for (const ip of ips) {
    console.log(`[farenheit]   → http://${ip}:${server.port}`);
  }

  const shutdown = async (sig: string) => {
    console.log(`[farenheit] ${sig} received, shutting down…`);
    server.stop(true);
    await indexer.stop();
    store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error("[farenheit] fatal:", e);
  process.exit(1);
});
