import { describe, expect, test } from "bun:test";
import dailyFixture from "./fixtures/daily.json";
import blocksFixture from "./fixtures/blocks.json";
import instancesFixture from "./fixtures/instances.json";
import type {
  BlocksReport,
  DailyReport,
  InstancesReport,
} from "../src/types/ccusage.ts";
import { toCalendarCells } from "../src/transforms/calendar.ts";
import {
  SLOT_LABELS,
  WEEKDAYS,
  toHourOfWeekCells,
} from "../src/transforms/hourOfWeek.ts";
import { topProjectsWithDelta } from "../src/transforms/projects.ts";
import { toTrendSeries } from "../src/transforms/trend.ts";
import { rollingAverage, zeroFillByDate } from "../src/util/dates.ts";

const daily = dailyFixture as unknown as DailyReport;
const blocks = blocksFixture as unknown as BlocksReport;
const instances = instancesFixture as unknown as InstancesReport;

describe("calendar transform", () => {
  test("emits one cell per daily entry", () => {
    const cells = toCalendarCells(daily);
    expect(cells.length).toBe(daily.daily.length);
  });

  test("preserves date and totals", () => {
    const cells = toCalendarCells(daily);
    const first = cells[0]!;
    const rawFirst = daily.daily[0]!;
    expect(first.date).toBe(rawFirst.date);
    expect(first.tokens).toBe(rawFirst.totalTokens);
    expect(first.cost).toBe(rawFirst.totalCost);
  });

  test("topModel picks the highest-cost model", () => {
    const cells = toCalendarCells(daily);
    for (const c of cells) {
      if (!c.topModel) continue;
      const rawDay = daily.daily.find((d) => d.date === c.date)!;
      const max = rawDay.modelBreakdowns.reduce((a, b) =>
        b.cost > a.cost ? b : a,
      );
      expect(c.topModel).toBe(max.modelName);
    }
  });
});

describe("hour-of-week transform", () => {
  test("emits a 7×5 = 35 cell grid", () => {
    const cells = toHourOfWeekCells(blocks);
    expect(cells.length).toBe(WEEKDAYS.length * SLOT_LABELS.length);
  });

  test("skips gap blocks", () => {
    const totalNonGap = blocks.blocks.filter((b) => !b.isGap).length;
    const cells = toHourOfWeekCells(blocks);
    const blockCount = cells.reduce((s, c) => s + c.blocks, 0);
    expect(blockCount).toBe(totalNonGap);
  });

  test("token sum equals sum of non-gap block totals", () => {
    const nonGapTotal = blocks.blocks
      .filter((b) => !b.isGap)
      .reduce((s, b) => s + b.totalTokens, 0);
    const cells = toHourOfWeekCells(blocks);
    const cellTotal = cells.reduce((s, c) => s + c.tokens, 0);
    expect(cellTotal).toBe(nonGapTotal);
  });
});

describe("projects transform", () => {
  test("sorts by current tokens descending", () => {
    const rows = topProjectsWithDelta(instances, {
      topN: 10,
      currentSince: "2026-05-15",
      previousSince: "2026-04-15",
    });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.currentTokens).toBeGreaterThanOrEqual(
        rows[i]!.currentTokens,
      );
    }
  });

  test("delta is null when previous = 0", () => {
    const rows = topProjectsWithDelta(instances, {
      topN: 50,
      currentSince: "1970-01-01",
      previousSince: "1970-01-01",
    });
    for (const r of rows) {
      expect(r.previousTokens).toBe(0);
      expect(r.delta).toBeNull();
    }
  });

  test("respects topN cap", () => {
    const rows = topProjectsWithDelta(instances, {
      topN: 3,
      currentSince: "1970-01-01",
      previousSince: "1970-01-01",
    });
    expect(rows.length).toBeLessThanOrEqual(3);
  });
});

describe("trend transform", () => {
  test("fills missing days with zero", () => {
    const points = toTrendSeries(daily, {
      startIso: "2026-05-01",
      endIso: "2026-05-31",
    });
    expect(points.length).toBe(31);
    expect(points[0]!.date).toBe("2026-05-01");
    expect(points[30]!.date).toBe("2026-05-31");
  });

  test("rolling avg has same length as points", () => {
    const points = toTrendSeries(daily, {
      startIso: "2026-05-01",
      endIso: "2026-05-31",
    });
    for (const p of points) {
      expect(typeof p.rolling7).toBe("number");
      expect(p.rolling7).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("date utilities", () => {
  test("rollingAverage smooths a step series", () => {
    const avg = rollingAverage([0, 0, 0, 0, 0, 0, 0, 7], 7);
    // last value should be (0+0+0+0+0+0+0+7)/7 = 1
    expect(avg[7]).toBeCloseTo(1, 5);
  });

  test("rollingAverage window=1 is identity", () => {
    const input = [1, 2, 3, 4];
    expect(rollingAverage(input, 1)).toEqual(input);
  });

  test("zeroFillByDate fills gap days", () => {
    const filled = zeroFillByDate(
      [
        { date: "2026-01-01", tokens: 10 },
        { date: "2026-01-03", tokens: 30 },
      ],
      (date) => ({ date, tokens: 0 }),
    );
    expect(filled.map((f) => f.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(filled[1]!.tokens).toBe(0);
  });
});
