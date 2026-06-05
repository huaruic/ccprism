#!/usr/bin/env bun
/**
 * One-shot fixture sanitizer.
 *
 * Replaces real project paths and session IDs with synthetic but realistic
 * names so the test fixtures can ship in a public repo without leaking
 * the user's project list. Numeric token/cost values are preserved — they
 * carry no identity info once detached from project names.
 *
 * Usage:
 *   bun run scripts/sanitize-fixtures.ts  test/fixtures-real  test/fixtures
 *
 * Idempotent. Safe to re-run.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// camelCase so prettyProject (which splits paths on `-` and takes the trailing
// segment) shows the whole project name rather than just the last word.
const SYNTHETIC_PROJECTS = [
  "webApp",
  "apiServer",
  "dataPipeline",
  "devopsTools",
  "mobileClient",
  "docsSite",
  "infra",
  "analytics",
  "playground",
  "demos",
  "billingSvc",
  "authSvc",
  "notifySvc",
  "searchSvc",
  "adminDash",
  "marketingSite",
  "blog",
  "portfolio",
  "designSystem",
  "uiKit",
  "scratchpad",
  "prototypes",
  "mlExperiments",
  "dataViz",
  "cliTools",
  "scripts",
  "utilities",
  "archive",
  "sandbox",
];

interface Mappings {
  projects: Map<string, string>;
  sessions: Map<string, string>;
}

function sanitizeProjectPath(
  raw: string,
  mappings: Mappings,
  pool: string[],
): string {
  if (!mappings.projects.has(raw)) {
    const next = pool[mappings.projects.size % pool.length] ?? "project-x";
    const tag = mappings.projects.size < pool.length
      ? next
      : `${next}-${Math.floor(mappings.projects.size / pool.length)}`;
    mappings.projects.set(raw, `-projects-${tag}`);
  }
  return mappings.projects.get(raw)!;
}

function sanitizeSession(raw: string, mappings: Mappings): string {
  if (!mappings.sessions.has(raw)) {
    const n = mappings.sessions.size;
    const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    mappings.sessions.set(raw, id);
  }
  return mappings.sessions.get(raw)!;
}

function walk(node: unknown, mappings: Mappings, pool: string[]): unknown {
  if (Array.isArray(node)) {
    return node.map((n) => walk(n, mappings, pool));
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === "projectPath" || k === "project") {
        out[k] = typeof v === "string" ? sanitizeProjectPath(v, mappings, pool) : v;
      } else if (k === "sessionId") {
        out[k] = typeof v === "string" ? sanitizeSession(v, mappings) : v;
      } else if (k === "projects" && v && typeof v === "object" && !Array.isArray(v)) {
        // InstancesReport has shape { projects: { [projectPath]: entries[] } }
        // — key is the project path; both key and value entries need sanitizing.
        const rekeyed: Record<string, unknown> = {};
        for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
          const newKey = sanitizeProjectPath(pk, mappings, pool);
          rekeyed[newKey] = walk(pv, mappings, pool);
        }
        out[k] = rekeyed;
      } else {
        out[k] = walk(v, mappings, pool);
      }
    }
    return out;
  }
  return node;
}

async function main() {
  const [src, dst] = process.argv.slice(2);
  if (!src || !dst) {
    console.error("usage: sanitize-fixtures.ts <src-dir> <dst-dir>");
    process.exit(1);
  }
  const srcAbs = resolve(src);
  const dstAbs = resolve(dst);
  const mappings: Mappings = { projects: new Map(), sessions: new Map() };

  const files = (await readdir(srcAbs)).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const raw = JSON.parse(await readFile(`${srcAbs}/${file}`, "utf8"));
    const sanitized = walk(raw, mappings, SYNTHETIC_PROJECTS);
    await writeFile(`${dstAbs}/${file}`, JSON.stringify(sanitized, null, 2) + "\n");
    console.log(`✓ ${file}`);
  }
  console.log(
    `\nMapped ${mappings.projects.size} project paths and ${mappings.sessions.size} session IDs.`,
  );
}

await main();
