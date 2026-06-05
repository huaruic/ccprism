import type { DailyReport } from "../types/ccusage.ts";
import { rollingAverage, zeroFillByDate } from "../util/dates.ts";

export interface TrendPoint {
  date: string;
  tokens: number;
  rolling7: number;
}

export function toTrendSeries(
  report: DailyReport,
  options: { startIso?: string; endIso?: string; window?: number } = {},
): TrendPoint[] {
  const window = options.window ?? 7;
  const filled = zeroFillByDate(
    report.daily.map((d) => ({ date: d.date, tokens: d.totalTokens })),
    (date) => ({ date, tokens: 0 }),
    options.startIso,
    options.endIso,
  );
  const rolling = rollingAverage(
    filled.map((p) => p.tokens),
    window,
  );
  return filled.map((p, i) => ({
    date: p.date,
    tokens: p.tokens,
    rolling7: rolling[i] ?? 0,
  }));
}
