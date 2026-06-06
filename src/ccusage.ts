import { tmpdir } from "node:os";
import type {
  BlocksReport,
  DailyReport,
  InstancesReport,
  SessionReport,
} from "./types/ccusage.ts";

export interface CcusageOptions {
  /**
   * Override ccusage invocation. Defaults to a globally installed `ccusage`
   * if present on PATH, otherwise `bunx ccusage@latest` (with cache warmup
   * to avoid EEXIST races when several fetches run in parallel).
   */
  command?: string[];
  /** ISO date (YYYY-MM-DD) to pass as `--since`. */
  since?: string;
}

/**
 * Cached resolution of the base ccusage command. Memoized as a Promise so the
 * four concurrent fetchers all await the SAME warmup — they never race on
 * `bunx`'s install step. (That race produced `Failed to link ccusage: EEXIST`
 * when v0.1.0 fanned out four bunx subprocesses simultaneously.)
 */
let resolvedBase: Promise<string[]> | null = null;

async function resolveBase(opts: CcusageOptions): Promise<string[]> {
  if (opts.command) return opts.command;
  if (!resolvedBase) resolvedBase = resolveBaseUncached();
  return resolvedBase;
}

async function resolveBaseUncached(): Promise<string[]> {
  // 1) Prefer a globally installed `ccusage` — fastest, no install step.
  const which = Bun.spawnSync(["which", "ccusage"], { stderr: "ignore" });
  if (which.exitCode === 0) {
    const path = new TextDecoder().decode(which.stdout).trim();
    if (path) return [path];
  }

  // 2) Fall back to bunx. Warm the cache serially with a `--version` probe so
  //    the parallel data fetches don't race on the install. This adds a few
  //    seconds on first run but is a no-op once cached.
  const warm = Bun.spawn(["bunx", "ccusage@latest", "--version"], {
    cwd: tmpdir(),
    stdout: "ignore",
    stderr: "ignore",
  });
  await warm.exited;
  return ["bunx", "ccusage@latest"];
}

async function runJson<T>(argv: string[]): Promise<T> {
  // Run from a neutral cwd so `bunx` doesn't get confused by an unrelated
  // package.json (e.g. ccprism's own) when resolving the binary.
  const proc = Bun.spawn(argv, {
    cwd: tmpdir(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const code = await proc.exited;
  if (code !== 0) {
    throw new Error(
      `ccusage subprocess failed (exit ${code}): ${stderr.trim() || stdout.trim()}`,
    );
  }
  // ccusage prints JSON to stdout; tolerate a stray banner line.
  const trimmed = stdout.trimStart();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart < 0) {
    throw new Error(`ccusage produced no JSON output: ${trimmed.slice(0, 200)}`);
  }
  return JSON.parse(trimmed.slice(jsonStart)) as T;
}

export async function fetchDaily(opts: CcusageOptions = {}): Promise<DailyReport> {
  const base = await resolveBase(opts);
  const argv = [...base, "claude", "daily", "--json"];
  if (opts.since) argv.push("--since", opts.since);
  return runJson<DailyReport>(argv);
}

export async function fetchSession(opts: CcusageOptions = {}): Promise<SessionReport> {
  const base = await resolveBase(opts);
  return runJson<SessionReport>([...base, "claude", "session", "--json"]);
}

export async function fetchBlocks(opts: CcusageOptions = {}): Promise<BlocksReport> {
  const base = await resolveBase(opts);
  return runJson<BlocksReport>([...base, "blocks", "--json"]);
}

export async function fetchInstances(
  opts: CcusageOptions = {},
): Promise<InstancesReport> {
  const base = await resolveBase(opts);
  const argv = [...base, "claude", "daily", "--instances", "--json"];
  if (opts.since) argv.push("--since", opts.since);
  return runJson<InstancesReport>(argv);
}
