import type { DailyEntry, DailyReport } from "../types/ccusage.ts";

export interface CalendarCell {
  date: string;
  tokens: number;
  cost: number;
  topModel: string | null;
}

export function toCalendarCells(report: DailyReport): CalendarCell[] {
  return report.daily.map((d) => ({
    date: d.date,
    tokens: d.totalTokens,
    cost: d.totalCost,
    topModel: pickTopModel(d),
  }));
}

function pickTopModel(d: DailyEntry): string | null {
  if (d.modelBreakdowns.length === 0) return null;
  let best = d.modelBreakdowns[0]!;
  for (const m of d.modelBreakdowns) {
    if (m.cost > best.cost) best = m;
  }
  return best.modelName;
}
