import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { CalendarCell } from "../transforms/calendar.ts";
import type { HourOfWeekCell } from "../transforms/hourOfWeek.ts";
import type { ProjectRow } from "../transforms/projects.ts";
import type { TrendPoint } from "../transforms/trend.ts";

export interface ChartData {
  calendar: { rangeStart: string; rangeEnd: string; cells: CalendarCell[] };
  hourOfWeek: { cells: HourOfWeekCell[] };
  projects: { rows: ProjectRow[] };
  trend: { points: TrendPoint[] };
}

export interface ReportSummary {
  generatedAt: string;
  rangeStart: string;
  rangeEnd: string;
  totalTokens: number;
  totalCost: number;
  dayCount: number;
}

let echartsCache: string | null = null;

async function loadEchartsBundle(): Promise<string> {
  if (echartsCache) return echartsCache;
  const here = fileURLToPath(new URL(".", import.meta.url));
  const candidates = [
    `${here}../../node_modules/echarts/dist/echarts.min.js`,
    `${here}../../../node_modules/echarts/dist/echarts.min.js`,
  ];
  for (const path of candidates) {
    try {
      const buf = await readFile(path, "utf8");
      echartsCache = buf;
      return buf;
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    "echarts.min.js not found. Run `bun install` in the project directory.",
  );
}

/**
 * Client-side chart option builders. Inlined as JS so ECharts formatter
 * callbacks survive serialization (JSON.stringify would drop functions).
 */
const CHART_BUILDERS_JS = String.raw`
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const SLOT_LABELS = ["00–05","05–10","10–15","15–20","20–24"];
const GH_PALETTE = ["#ebedf0","#9be9a8","#40c463","#30a14e","#216e39"];
const ACCENT = "#1f7a3a";
const ACCENT_SOFT = "#7fd49e";
const INK = "#1f2328";
const MUTED = "#656d76";

const BASE_TEXT = {
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
  color: INK,
};

const TOOLTIP_BASE = {
  backgroundColor: "rgba(255,255,255,0.98)",
  borderWidth: 0,
  padding: [10, 14],
  textStyle: Object.assign({}, BASE_TEXT, { fontSize: 12, lineHeight: 18 }),
  extraCssText: "box-shadow: 0 8px 24px rgba(31,35,40,0.12); border-radius: 8px;",
};

function fmtBig(v) {
  if (v >= 1e9) return (v/1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v/1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v/1e3).toFixed(0) + "k";
  return String(v);
}

function buildCalendarOption(data) {
  const cellsByDate = new Map();
  for (const c of data.cells) cellsByDate.set(c.date, c);
  const series = data.cells.map(c => [c.date, c.tokens]);
  const tokens = data.cells.map(c => c.tokens).filter(t => t > 0).sort((a,b) => a-b);
  const max = tokens.length ? tokens[tokens.length - 1] : 0;
  const pieces = max > 0 ? [
    { min: 0, max: 0, label: "—", color: GH_PALETTE[0] },
    { gt: 0, lte: max * 0.25, label: "low", color: GH_PALETTE[1] },
    { gt: max * 0.25, lte: max * 0.5, label: "med", color: GH_PALETTE[2] },
    { gt: max * 0.5, lte: max * 0.75, label: "high", color: GH_PALETTE[3] },
    { gt: max * 0.75, label: "peak", color: GH_PALETTE[4] },
  ] : [{ min: 0, max: 0, label: "—", color: GH_PALETTE[0] }];
  return {
    textStyle: BASE_TEXT,
    tooltip: Object.assign({}, TOOLTIP_BASE, {
      formatter: function (p) {
        const [date, tk] = p.data;
        const cell = cellsByDate.get(date);
        if (!cell) return strong(date) + dim(tk.toLocaleString() + " tokens");
        const lines = [strong(date), dim(tk.toLocaleString() + " tokens · $" + cell.cost.toFixed(2))];
        if (cell.topModel) lines.push(dim(cell.topModel));
        return lines.join("");
      },
    }),
    visualMap: {
      show: true, type: "piecewise", orient: "horizontal",
      left: "center", bottom: 0, pieces: pieces,
      itemWidth: 14, itemHeight: 14, itemGap: 6,
      textStyle: { color: MUTED, fontSize: 11 },
    },
    calendar: {
      range: [data.rangeStart, data.rangeEnd],
      cellSize: ["auto", 17],
      left: 40, right: 20, top: 35, bottom: 60,
      yearLabel: { show: false },
      monthLabel: { color: MUTED, fontSize: 11, fontFamily: BASE_TEXT.fontFamily },
      dayLabel: {
        firstDay: 1,
        nameMap: ["S","M","T","W","T","F","S"],
        color: MUTED, fontSize: 10,
        fontFamily: BASE_TEXT.fontFamily,
      },
      itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 3 },
      splitLine: { show: false },
    },
    series: [{ type: "heatmap", coordinateSystem: "calendar", data: series }],
  };
}

function buildHourOfWeekOption(data) {
  const series = data.cells.map(c => [c.weekday, c.slot, c.tokens]);
  const lookup = new Map();
  for (const c of data.cells) lookup.set(c.weekday + "-" + c.slot, c);
  const max = data.cells.reduce((m, c) => Math.max(m, c.tokens), 0);
  return {
    textStyle: BASE_TEXT,
    tooltip: Object.assign({}, TOOLTIP_BASE, {
      formatter: function (p) {
        const [w, s, t] = p.data;
        const cell = lookup.get(w + "-" + s);
        const lines = [
          strong(WEEKDAYS[w] + " · " + SLOT_LABELS[s]),
          dim(t.toLocaleString() + " tokens"),
        ];
        if (cell && cell.blocks) lines.push(dim(cell.blocks + " block" + (cell.blocks === 1 ? "" : "s")));
        return lines.join("");
      },
    }),
    grid: { left: 70, right: 30, top: 20, bottom: 80 },
    xAxis: {
      type: "category", data: WEEKDAYS,
      splitArea: { show: false },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 12 },
    },
    yAxis: {
      type: "category", data: SLOT_LABELS,
      splitArea: { show: false },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 11 },
    },
    visualMap: {
      min: 0, max: max || 1, calculable: true,
      orient: "horizontal", left: "center", bottom: 5,
      itemWidth: 12, itemHeight: 120,
      textStyle: { color: MUTED, fontSize: 11 },
      inRange: { color: [GH_PALETTE[0], GH_PALETTE[1], GH_PALETTE[2], GH_PALETTE[3], GH_PALETTE[4]] },
      formatter: function (v) { return fmtBig(v); },
    },
    series: [{
      type: "heatmap", data: series,
      label: { show: false },
      itemStyle: { borderColor: "#fff", borderWidth: 3, borderRadius: 4 },
      emphasis: { itemStyle: { shadowBlur: 8, shadowColor: "rgba(31,35,40,0.18)" } },
    }],
  };
}

function buildProjectsOption(data) {
  const ordered = data.rows.slice().reverse();
  return {
    textStyle: BASE_TEXT,
    tooltip: Object.assign({}, TOOLTIP_BASE, {
      formatter: function (p) {
        const row = ordered[p.dataIndex];
        if (!row) return p.name;
        const deltaStr = row.delta === null
          ? "new this period"
          : (row.delta >= 0 ? "+" : "") + (row.delta * 100).toFixed(0) + "% vs prev";
        return [
          strong(row.project),
          dim(row.currentTokens.toLocaleString() + " tokens · $" + row.currentCost.toFixed(2)),
          dim(deltaStr),
        ].join("");
      },
    }),
    grid: { left: 130, right: 100, top: 20, bottom: 30 },
    xAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#e9ecef", type: "dashed" } },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 11, formatter: function (v) { return fmtBig(v); } },
    },
    yAxis: {
      type: "category",
      data: ordered.map(function (r) { return r.project; }),
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: INK, fontSize: 13, fontWeight: 500 },
    },
    series: [{
      type: "bar",
      barWidth: 14,
      data: ordered.map(function (r) {
        let labelColor = MUTED;
        if (r.delta !== null) labelColor = r.delta >= 0 ? "#1a7f37" : "#cf222e";
        const labelText = r.delta === null
          ? "new"
          : (r.delta >= 0 ? "+" : "") + clampPct(r.delta * 100) + "%";
        return {
          value: r.currentTokens,
          itemStyle: {
            color: {
              type: "linear", x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: ACCENT },
                { offset: 1, color: ACCENT_SOFT },
              ],
            },
            borderRadius: [0, 6, 6, 0],
          },
          label: {
            show: true, position: "right", color: labelColor,
            fontSize: 11, fontWeight: 600,
            formatter: function () { return labelText; },
          },
        };
      }),
    }],
  };
}

function clampPct(v) {
  if (v > 999) return ">999";
  if (v < -999) return "<-999";
  return v.toFixed(0);
}

function buildTrendOption(data) {
  const dates = data.points.map(function (p) { return p.date; });
  return {
    textStyle: BASE_TEXT,
    tooltip: Object.assign({}, TOOLTIP_BASE, {
      trigger: "axis",
      axisPointer: { type: "line", lineStyle: { color: "#d0d7de" } },
      formatter: function (params) {
        if (!params.length) return "";
        const lines = [strong(params[0].axisValue)];
        for (const p of params) {
          lines.push(dim(p.seriesName + ": " + (p.data ?? 0).toLocaleString()));
        }
        return lines.join("");
      },
    }),
    legend: {
      data: [
        { name: "Daily", itemStyle: { color: ACCENT_SOFT } },
        { name: "7-day avg", itemStyle: { color: ACCENT } },
      ],
      top: 0, right: 0,
      textStyle: { color: MUTED, fontSize: 11 },
      icon: "roundRect", itemWidth: 10, itemHeight: 10,
    },
    grid: { left: 70, right: 20, top: 30, bottom: 40 },
    xAxis: {
      type: "category", data: dates, boundaryGap: false,
      axisLine: { lineStyle: { color: "#d0d7de" } },
      axisTick: { show: false },
      axisLabel: {
        color: MUTED, fontSize: 11,
        formatter: function (v) { return v.slice(5); },
        interval: Math.max(0, Math.floor(dates.length / 8)),
      },
    },
    yAxis: {
      type: "value",
      splitLine: { lineStyle: { color: "#e9ecef", type: "dashed" } },
      axisLine: { show: false }, axisTick: { show: false },
      axisLabel: { color: MUTED, fontSize: 11, formatter: function (v) { return fmtBig(v); } },
    },
    series: [
      {
        name: "Daily", type: "line",
        data: data.points.map(function (p) { return p.tokens; }),
        smooth: 0.3, symbol: "none",
        lineStyle: { color: ACCENT_SOFT, width: 1.5 },
        areaStyle: {
          color: {
            type: "linear", x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(127,212,158,0.55)" },
              { offset: 1, color: "rgba(127,212,158,0.02)" },
            ],
          },
        },
        z: 1,
      },
      {
        name: "7-day avg", type: "line",
        data: data.points.map(function (p) { return Math.round(p.rolling7); }),
        smooth: 0.4, symbol: "none",
        lineStyle: { color: ACCENT, width: 2.5 },
        z: 2,
      },
    ],
  };
}

function strong(s) { return '<div style="font-weight:600;color:' + INK + ';margin-bottom:2px">' + escapeHtml(s) + '</div>'; }
function dim(s) { return '<div style="color:' + MUTED + ';font-size:11px">' + escapeHtml(s) + '</div>'; }
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, function (c) {
    return c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;";
  });
}
`;

export async function renderReport(
  chartData: ChartData,
  summary: ReportSummary,
): Promise<string> {
  const echarts = await loadEchartsBundle();
  const dataJson = JSON.stringify(chartData);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>ccprism · ${escapeHtml(summary.rangeStart)} → ${escapeHtml(summary.rangeEnd)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:," />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" />
<style>
  :root {
    color-scheme: light;
    --bg: #f6f8fa;
    --card: #ffffff;
    --ink: #1f2328;
    --muted: #656d76;
    --border: rgba(31,35,40,0.08);
    --shadow: 0 1px 2px rgba(31,35,40,0.04), 0 4px 16px rgba(31,35,40,0.04);
    --accent: #1f7a3a;
  }
  * { box-sizing: border-box; }
  html, body { background: var(--bg); }
  body {
    margin: 0; color: var(--ink);
    font: 14px/1.5 Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    letter-spacing: -0.005em;
  }
  .wrap { max-width: 1100px; margin: 0 auto; padding: 48px 24px 80px; }
  header { display: flex; justify-content: space-between; align-items: flex-end; gap: 32px; margin-bottom: 32px; flex-wrap: wrap; }
  h1 {
    margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.02em;
    background: linear-gradient(135deg, var(--ink) 0%, #4b5563 100%);
    -webkit-background-clip: text; background-clip: text; color: transparent;
  }
  .sub { color: var(--muted); font-size: 13px; margin-top: 6px; letter-spacing: 0; }
  .kpis { display: flex; gap: 32px; }
  .kpi { text-align: right; }
  .kpi .label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 500; }
  .kpi .value { font-size: 22px; font-weight: 600; margin-top: 2px; letter-spacing: -0.02em; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 14px;
    padding: 24px 26px 18px;
    margin-bottom: 18px;
    box-shadow: var(--shadow);
  }
  .card h2 { margin: 0 0 4px; font-size: 15px; font-weight: 600; letter-spacing: -0.01em; }
  .card .hint { margin: 0 0 18px; color: var(--muted); font-size: 12.5px; }
  .chart { width: 100%; }
  .chart-calendar { height: 220px; }
  .chart-hourofweek { height: 340px; }
  .chart-projects { height: 380px; }
  .chart-trend { height: 300px; }
  footer { color: var(--muted); font-size: 11px; text-align: center; margin-top: 32px; letter-spacing: 0; }
  footer code { background: rgba(31,35,40,0.05); padding: 2px 6px; border-radius: 4px; font-size: 11px; }
  @media (max-width: 720px) {
    .wrap { padding: 24px 16px 48px; }
    header { flex-direction: column; align-items: flex-start; }
    .kpis { width: 100%; justify-content: space-between; gap: 16px; }
    .kpi { text-align: left; }
  }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <div>
      <h1>ccprism</h1>
      <div class="sub">Your AI coding rhythm · ${escapeHtml(summary.rangeStart)} → ${escapeHtml(summary.rangeEnd)}</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="label">Days active</div><div class="value">${summary.dayCount.toLocaleString()}</div></div>
      <div class="kpi"><div class="label">Tokens</div><div class="value">${formatBig(summary.totalTokens)}</div></div>
      <div class="kpi"><div class="label">Cost</div><div class="value">$${summary.totalCost.toFixed(0)}</div></div>
    </div>
  </header>

  <section class="card">
    <h2>Year heatmap</h2>
    <p class="hint">One cell per day, last 365 days. Deeper green = more tokens. The contribution graph, for your AI conversations.</p>
    <div id="chart-calendar" class="chart chart-calendar"></div>
  </section>

  <section class="card">
    <h2>Hour-of-week rhythm</h2>
    <p class="hint">5-hour Claude blocks, by weekday and time of day. Reveals whether you're a morning, evening, or weekend coder.</p>
    <div id="chart-hourofweek" class="chart chart-hourofweek"></div>
  </section>

  <section class="card">
    <h2>Top projects · last 30 days vs prior 30</h2>
    <p class="hint">Where your tokens went. Labels show change versus the previous 30-day window.</p>
    <div id="chart-projects" class="chart chart-projects"></div>
  </section>

  <section class="card">
    <h2>90-day trend</h2>
    <p class="hint">Daily tokens (soft area) with 7-day rolling average (dark line). Watch for spikes, plateaus, and quiet weeks.</p>
    <div id="chart-trend" class="chart chart-trend"></div>
  </section>

  <footer>
    Generated ${escapeHtml(summary.generatedAt)} by <code>ccprism</code> · data via <code>ccusage</code>
  </footer>
</div>

<script>
${echarts}
</script>
<script>
${CHART_BUILDERS_JS}
(function () {
  var data = ${dataJson};
  var pairs = [
    ["chart-calendar", buildCalendarOption(data.calendar)],
    ["chart-hourofweek", buildHourOfWeekOption(data.hourOfWeek)],
    ["chart-projects", buildProjectsOption(data.projects)],
    ["chart-trend", buildTrendOption(data.trend)],
  ];
  for (var i = 0; i < pairs.length; i++) {
    var el = document.getElementById(pairs[i][0]);
    if (!el) continue;
    var chart = echarts.init(el, null, { renderer: "canvas" });
    chart.setOption(pairs[i][1]);
    window.addEventListener("resize", chart.resize.bind(chart));
  }
})();
</script>
</body>
</html>
`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  });
}

function formatBig(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
