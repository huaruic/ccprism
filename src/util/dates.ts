/** ISO date in `YYYY-MM-DD` form (UTC). */
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Date N days before today (UTC), as ISO date string. */
export function daysAgo(n: number, reference: Date = new Date()): string {
  const d = new Date(reference);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}

/** Inclusive ISO date range, daily step, UTC. */
export function isoDateRange(startIso: string, endIso: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) {
    out.push(isoDate(new Date(t)));
  }
  return out;
}

/** Trailing rolling average with window `w`. Output length matches input; positions before w-1 use partial windows. */
export function rollingAverage(values: number[], window: number): number[] {
  if (window <= 1) return values.slice();
  const out: number[] = new Array(values.length);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] ?? 0;
    if (i >= window) sum -= values[i - window] ?? 0;
    const denom = Math.min(i + 1, window);
    out[i] = sum / denom;
  }
  return out;
}

/** Zero-fill missing dates between min and max of `values`. */
export function zeroFillByDate<T extends { date: string }>(
  values: T[],
  emptyFactory: (date: string) => T,
  startIso?: string,
  endIso?: string,
): T[] {
  if (values.length === 0 && !startIso) return [];
  const sorted = values.slice().sort((a, b) => a.date.localeCompare(b.date));
  const first = startIso ?? sorted[0]!.date;
  const last = endIso ?? sorted[sorted.length - 1]!.date;
  const byDate = new Map(sorted.map((v) => [v.date, v]));
  return isoDateRange(first, last).map((d) => byDate.get(d) ?? emptyFactory(d));
}
