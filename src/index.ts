#!/usr/bin/env bun
import { defineCommand, runMain } from "citty";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import open from "open";
import { fetchBlocks, fetchDaily, fetchInstances } from "./ccusage.ts";
import { renderReport } from "./render/template.ts";
import { toCalendarCells } from "./transforms/calendar.ts";
import { toHourOfWeekCells } from "./transforms/hourOfWeek.ts";
import { topProjectsWithDelta } from "./transforms/projects.ts";
import { toTrendSeries } from "./transforms/trend.ts";
import type {
  BlocksReport,
  DailyReport,
  InstancesReport,
} from "./types/ccusage.ts";
import { daysAgo, isoDate } from "./util/dates.ts";

async function loadFixtures(dir: string): Promise<{
  yearReport: DailyReport;
  blocks: BlocksReport;
  instances: InstancesReport;
  trendReport: DailyReport;
}> {
  const base = resolve(dir);
  const daily = JSON.parse(await readFile(`${base}/daily.json`, "utf8")) as DailyReport;
  const blocks = JSON.parse(await readFile(`${base}/blocks.json`, "utf8")) as BlocksReport;
  const instances = JSON.parse(
    await readFile(`${base}/instances.json`, "utf8"),
  ) as InstancesReport;
  return { yearReport: daily, blocks, instances, trendReport: daily };
}

const main = defineCommand({
  meta: {
    name: "ccprism",
    version: "0.1.0",
    description:
      "Generate a reflective HTML report of your AI coding agent usage. Stands on ccusage.",
  },
  args: {
    out: {
      type: "string",
      description: "Output HTML path",
      default: "./ccprism.html",
    },
    since: {
      type: "string",
      description: "Override start date for trend (YYYY-MM-DD)",
    },
    open: {
      type: "boolean",
      description: "Auto-open the report in your browser (use --no-open to disable)",
      default: true,
    },
    from: {
      type: "string",
      description:
        "Render from a fixture directory (daily.json, blocks.json, instances.json) instead of calling ccusage. Used for demos / dev.",
    },
  },
  async run({ args }) {
    const today = new Date();
    const yearAgo = daysAgo(365, today);
    const trendSince = args.since ?? daysAgo(90, today);
    const currentSince = daysAgo(30, today);
    const previousSince = daysAgo(60, today);
    const todayIso = isoDate(today);

    let yearReport, blocks, instances, trendReport;
    if (args.from) {
      console.log(`→ loading fixtures from ${args.from}…`);
      ({ yearReport, blocks, instances, trendReport } = await loadFixtures(args.from));
    } else {
      console.log("→ fetching ccusage data (4 calls)…");
      [yearReport, blocks, instances, trendReport] = await Promise.all([
        fetchDaily({ since: yearAgo }),
        fetchBlocks({}),
        fetchInstances({ since: previousSince }),
        fetchDaily({ since: trendSince }),
      ]);
    }

    const calendarCells = toCalendarCells(yearReport);
    const hourCells = toHourOfWeekCells(blocks);
    const projectRows = topProjectsWithDelta(instances, {
      topN: 10,
      currentSince,
      previousSince,
    });
    const trendPoints = toTrendSeries(trendReport, {
      startIso: trendSince,
      endIso: todayIso,
    });

    const totalTokens = yearReport.daily.reduce((s, d) => s + d.totalTokens, 0);
    const totalCost = yearReport.daily.reduce((s, d) => s + d.totalCost, 0);
    const dayCount = yearReport.daily.length;

    const html = await renderReport(
      {
        calendar: { rangeStart: yearAgo, rangeEnd: todayIso, cells: calendarCells },
        hourOfWeek: { cells: hourCells },
        projects: { rows: projectRows },
        trend: { points: trendPoints },
      },
      {
        generatedAt: new Date().toISOString().replace("T", " ").slice(0, 19) + "Z",
        rangeStart: yearAgo,
        rangeEnd: todayIso,
        totalTokens,
        totalCost,
        dayCount,
      },
    );

    const outPath = resolve(args.out);
    await Bun.write(outPath, html);
    console.log(`✓ wrote ${outPath} (${(html.length / 1024).toFixed(0)} KB)`);

    if (args.open) {
      await open(outPath);
      console.log("✓ opened in browser");
    }
  },
});

void runMain(main);
