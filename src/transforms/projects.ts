import type { InstancesReport } from "../types/ccusage.ts";

export interface ProjectRow {
  project: string;
  currentTokens: number;
  previousTokens: number;
  currentCost: number;
  /** Fractional change vs previous month; null when previous = 0. */
  delta: number | null;
}

export function topProjectsWithDelta(
  report: InstancesReport,
  options: {
    topN?: number;
    /** ISO start of "current" window (inclusive). */
    currentSince: string;
    /** ISO start of "previous" window (inclusive). */
    previousSince: string;
    /** ISO end of previous window (exclusive, == currentSince). */
  } = { currentSince: "", previousSince: "" },
): ProjectRow[] {
  const { topN = 10, currentSince, previousSince } = options;
  const rows: ProjectRow[] = [];
  for (const [project, entries] of Object.entries(report.projects)) {
    let cur = 0;
    let prev = 0;
    let curCost = 0;
    for (const e of entries) {
      if (e.date >= currentSince) {
        cur += e.totalTokens;
        curCost += e.totalCost;
      } else if (e.date >= previousSince) {
        prev += e.totalTokens;
      }
    }
    if (cur === 0 && prev === 0) continue;
    rows.push({
      project: prettyProject(project),
      currentTokens: cur,
      previousTokens: prev,
      currentCost: curCost,
      delta: prev > 0 ? (cur - prev) / prev : null,
    });
  }
  rows.sort((a, b) => b.currentTokens - a.currentTokens);
  return rows.slice(0, topN);
}

/** ccusage encodes project paths with `-` separators. Restore the trailing segment for readability. */
function prettyProject(raw: string): string {
  if (!raw) return raw;
  const segments = raw.split("-").filter(Boolean);
  const last = segments[segments.length - 1] ?? raw;
  return last;
}
