import { spawn } from "node:child_process";

export type RunResult = { stdout: string; stderr: string; code: number };
type Runner = (command: string, args: string[]) => Promise<RunResult>;

async function defaultRunner(command: string, args: string[]): Promise<RunResult> {
  return await new Promise((resolve) => {
    const p = spawn(command, args, { shell: false });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (b) => (stdout += b.toString()));
    p.stderr.on("data", (b) => (stderr += b.toString()));
    p.on("close", (code) => resolve({ stdout, stderr, code: code ?? 0 }));
    p.on("error", (e) => resolve({ stdout: "", stderr: e.message, code: 1 }));
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

// Full status output for diagnostics. Unlike isDatalessPlaceholder, this
// surfaces brctl's stderr and exit code so callers can distinguish "not
// dataless" from "brctl couldn't tell us" (permission denied, path missing).
export async function brctlStatus(path: string): Promise<RunResult> {
  return await runner("brctl", ["status", path]);
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

// Fire-and-forget download request. Does not wait for completion — brctl
// hands the task off to fileproviderd and returns. The result includes the
// exit code and stderr so callers can log a real error instead of silently
// looping on a broken file (e.g. iCloud upload never completed, permission
// denied). Callers should inspect `result.code !== 0` and log stderr.
export async function requestDownload(path: string): Promise<RunResult> {
  return await runner("brctl", ["download", path]);
}
