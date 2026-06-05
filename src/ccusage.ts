import { tmpdir } from "node:os";
import type {
  BlocksReport,
  DailyReport,
  InstancesReport,
  SessionReport,
} from "./types/ccusage.ts";

export interface CcusageOptions {
  /** Override ccusage invocation. Defaults to `bunx ccusage@latest`. */
  command?: string[];
  /** ISO date (YYYY-MM-DD) to pass as `--since`. */
  since?: string;
}

function buildBase(opts: CcusageOptions): string[] {
  return opts.command ?? ["bunx", "ccusage@latest"];
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
  const argv = [...buildBase(opts), "claude", "daily", "--json"];
  if (opts.since) argv.push("--since", opts.since);
  return runJson<DailyReport>(argv);
}

export async function fetchSession(opts: CcusageOptions = {}): Promise<SessionReport> {
  return runJson<SessionReport>([...buildBase(opts), "claude", "session", "--json"]);
}

export async function fetchBlocks(opts: CcusageOptions = {}): Promise<BlocksReport> {
  return runJson<BlocksReport>([...buildBase(opts), "blocks", "--json"]);
}

export async function fetchInstances(
  opts: CcusageOptions = {},
): Promise<InstancesReport> {
  const argv = [
    ...buildBase(opts),
    "claude",
    "daily",
    "--instances",
    "--json",
  ];
  if (opts.since) argv.push("--since", opts.since);
  return runJson<InstancesReport>(argv);
}
