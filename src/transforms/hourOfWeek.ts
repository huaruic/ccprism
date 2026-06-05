import type { BlocksReport } from "../types/ccusage.ts";

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const SLOT_LABELS = [
  "00–05",
  "05–10",
  "10–15",
  "15–20",
  "20–24",
] as const;

export interface HourOfWeekCell {
  /** 0 = Sun … 6 = Sat */
  weekday: number;
  /** 0 = 00–05 … 4 = 20–24 */
  slot: number;
  tokens: number;
  blocks: number;
}

export function toHourOfWeekCells(report: BlocksReport): HourOfWeekCell[] {
  const grid = new Map<string, HourOfWeekCell>();
  for (const b of report.blocks) {
    if (b.isGap) continue;
    const start = new Date(b.startTime);
    const weekday = start.getUTCDay();
    const slot = Math.min(4, Math.floor(start.getUTCHours() / 5));
    const key = `${weekday}-${slot}`;
    const cur = grid.get(key) ?? { weekday, slot, tokens: 0, blocks: 0 };
    cur.tokens += b.totalTokens;
    cur.blocks += 1;
    grid.set(key, cur);
  }
  // Emit every cell so ECharts paints the empty ones too.
  const out: HourOfWeekCell[] = [];
  for (let w = 0; w < WEEKDAYS.length; w++) {
    for (let s = 0; s < SLOT_LABELS.length; s++) {
      out.push(grid.get(`${w}-${s}`) ?? { weekday: w, slot: s, tokens: 0, blocks: 0 });
    }
  }
  return out;
}
