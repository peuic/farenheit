import { spawn } from "node:child_process";

type RunResult = { stdout: string; code: number };
type Runner = (command: string, args: string[]) => Promise<RunResult>;

async function defaultRunner(command: string, args: string[]): Promise<RunResult> {
  return await new Promise((resolve) => {
    const p = spawn(command, args, { shell: false });
    let stdout = "";
    p.stdout.on("data", (b) => (stdout += b.toString()));
    p.stderr.on("data", () => {});
    p.on("close", (code) => resolve({ stdout, code: code ?? 0 }));
    p.on("error", () => resolve({ stdout: "", code: 1 }));
  });
}

let runner: Runner = defaultRunner;
export function __setRunnerForTests(fn: Runner): void {
  runner = fn;
}

export async function isDatalessPlaceholder(path: string): Promise<boolean> {
  const r = await runner("brctl", ["status", path]);
  if (r.code !== 0) return false;
  return /isDataless\s*=\s*1/.test(r.stdout);
}

export async function ensureMaterialized(path: string, timeoutMs = 60_000): Promise<void> {
  if (!(await isDatalessPlaceholder(path))) return;
  await runner("brctl", ["download", path]);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await isDatalessPlaceholder(path))) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timeout waiting for iCloud download: ${path}`);
}

// Fire-and-forget download request. Does not wait for completion —
// brctl hands the task off to fileproviderd and returns.
export async function requestDownload(path: string): Promise<void> {
  await runner("brctl", ["download", path]);
}
