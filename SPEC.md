# ccprism — SPEC

> Look in the mirror at your relationship with AI.

## 1. What this is

A personal CLI tool that generates a single self-contained HTML report visualizing your AI coding agent usage patterns. Run it weekly to **see yourself** as an AI user — rhythm, habits, anomalies, trends — not to monitor in real time.

This product fills the **reflective** slot between two existing products:

| Tool          | Slot              | Form factor       |
| ------------- | ----------------- | ----------------- |
| CodexBar      | Tactical "now"    | macOS menu bar    |
| ccusage       | Numerical report  | Terminal table    |
| **ccprism** | **Reflective patterns** | **HTML dashboard** |

It does **not** try to replace ccusage. It is a thin downstream consumer of `ccusage --json`.

## 2. Architecture

```
ccusage CLI  ───(--json)───▶  ccprism  ───▶  report.html  ───▶  browser
   ^                              │
   │                              │
local Claude/Codex/etc logs    transforms + ECharts inline
```

- **Data source**: shell out to `bunx ccusage claude daily --json`, `... session --json`, `... blocks --json`, `... daily --instances --json`. No log parsing duplicated.
- **Renderer**: TS code that aggregates ccusage JSON → ECharts options → inline into a template
- **Output**: one self-contained `report.html` (ECharts inlined, all data inlined, no network calls)
- **Distribution**: `bun install -g .` from the repo, or `bunx ccprism` directly

## 3. Tech choices (with rationale)

| Decision | Pick | Why |
| --- | --- | --- |
| Runtime | Bun + TypeScript | Native TS, fast subprocess, `bun build --compile` for single binary; user has Bun installed. |
| Charts | [ECharts](https://echarts.apache.org/) (one lib for all 4 charts) | Built-in calendar coordinate + heatmap series + line + bar. Apache, 60k+⭐. Eliminates "cal-heatmap + chart.js + d3" multi-lib mess. |
| CLI framework | [citty](https://github.com/unjs/citty) | Tiny, ESM, TS-first. Same DX as commander but slimmer. |
| HTML template | Vanilla template literal | One file, no dep. Spec is small — no need for eta/handlebars. |
| Open browser | [`open`](https://github.com/sindresorhus/open) npm | Cross-platform, battle-tested. |
| Testing | `bun test` (built-in) | No extra dep. Snapshot generated HTML against fixtures. |

**Reused, not rewritten**: ccusage (parsing + pricing), ECharts (all rendering), `open` (browser launch). Our code is just glue + 4 chart configs.

## 4. MVP features

For each feature: **dev steps**, **acceptance criteria**, **test approach**.

### F1 — Year heatmap (the headline feature)

GitHub-style 365-day grid colored by token volume. The "wow" moment.

- **Data**: `ccusage claude daily --json --since YYYY-MM-DD` (1 year ago)
- **Transform**: `daily[]` → `[[isoDate, totalTokens], ...]`
- **Chart**: ECharts `calendar` coordinate + `heatmap` series; quartile-binned color scale `#ebedf0 → #216e39` (GitHub palette)
- **Tooltip**: date · totalTokens · totalCost · topModel
- **Dev steps**:
  1. Add transform `toCalendarSeries(daily)`
  2. ECharts option object with `calendar.range` = current year
  3. Inject into template at chart-1 slot
- **Acceptance**: cells colored by quartile; hover shows accurate values; cells with no usage are `#ebedf0`
- **Test**:
  - Unit: `toCalendarSeries(fixtureDaily)` returns expected shape
  - Snapshot: full HTML against fixture matches recorded output
  - Manual: run on real local data, eyeball heatmap looks right

### F2 — Hour-of-week heatmap (5h × weekday)

When during the week does your AI burn happen? `blocks --json` gives 5h-aligned ISO timestamps — we bin into 5 × 7 = 35 cells (5h slots × 7 weekdays).

- **Data**: `ccusage blocks --json`
- **Transform**: `blocks[]` (skip `isGap`) → `[blockHour5h][weekday] += totalTokens`
- **Chart**: ECharts `heatmap` on cartesian2d (xAxis = weekday, yAxis = 5h slot label like "00–05", "05–10", …)
- **Dev steps**:
  1. Filter `isGap === false`
  2. For each block: `wd = startTime.getDay()`, `slot = floor(hour/5)`, accumulate
  3. ECharts heatmap with discrete weekday/slot axes
- **Acceptance**: distribution is non-flat and matches user's known habits; hover shows weekday + slot + tokens
- **Granularity note**: 5h is a known limitation. If user wants true hourly later, parse Claude JSONL directly using ccusage's path discovery — out of scope for MVP, captured as `FUTURE.md` item.
- **Test**:
  - Unit: `toHourOfWeekMatrix(fixtureBlocks)` → known matrix
  - Manual: visual check

### F3 — Project breakdown (top-N horizontal bar + MoM delta)

Which projects ate your tokens this month, vs last month?

- **Data**: `ccusage claude daily --instances --json --since <60-days-ago>`
- **Transform**:
  - Split entries by month
  - Sum tokens per `projectPath` in current month and previous month
  - Sort current month desc, take top 10
  - Compute `delta = (current - previous) / previous`
- **Chart**: ECharts horizontal bar; project name on yAxis; bar = current month tokens; data labels show `+/− N%` delta
- **Acceptance**: top 10 are real project names; sort correct; arrow/sign correct
- **Test**:
  - Unit: `topProjectsWithDelta(fixtureInstances)` returns expected sorted list
  - Manual: cross-check top 3 against `ccusage claude daily --instances` table

### F4 — Trend line (90-day daily + 7-day rolling avg)

Are you trending up? Stabilizing? Spike days?

- **Data**: `ccusage claude daily --json --since <90-days-ago>`
- **Transform**:
  - Fill missing days with zero
  - Compute 7-day trailing rolling average
- **Chart**: ECharts line; two series (daily bars OR raw line, and rolling avg line)
- **Acceptance**: daily values match raw; rolling avg starts at day 7 (or smoothes left-edge); spike days visible
- **Test**:
  - Unit: `rollingAvg([1,2,3,4,5,6,7,100], 7)` returns expected values
  - Unit: `fillMissingDates(sparseDaily, startDate, endDate)` zero-fills correctly

## 5. CLI surface (MVP)

```
ccprism
  --out <path>       output HTML path (default: ./ccprism.html)
  --since <date>     override start date for trend/heatmap (default: 365 days ago)
  --no-open          do not auto-open browser
  --version, --help
```

That's it. No subcommands in MVP — one command does it all.

## 6. Quality bar

- **TypeScript strict** (`"strict": true`, `"noUncheckedIndexedAccess": true`)
- **No `any`** in production code; types derived from a hand-written `types/ccusage.ts` based on observed schema
- **No unused deps** (`bunx knip` to check before merge)
- **Single binary build path**: `bun build --compile ./src/index.ts --outfile bin/ccprism`
- **README** explaining: what it is, what it isn't, install/run, example screenshot
- **All charts work offline** — ECharts inlined, not from CDN. Inline via `bun build` or `import echarts from 'echarts/dist/echarts.min.js'` + string read at build time.
- **Tests pass before each phase merges to main**

## 7. Out of scope (FUTURE.md candidates)

- True hourly heatmap (requires JSONL parsing)
- Multi-agent coverage beyond Claude Code (Codex / Gemini / Bailian — wait for ccusage to mature or add when needed)
- Cost projection / budget alerts (that's CodexBar's slot)
- Interactive filters / date range picker in the HTML (this is a snapshot report, not a webapp)
- Public hosting / sharing (this is local-only by design)

## 8. Done definition (MVP shippable)

- [ ] All 4 charts render correctly on real local data
- [ ] Browser auto-opens after generation
- [ ] `bun test` passes (unit + snapshot)
- [ ] `bun run typecheck` passes (`tsc --noEmit`)
- [ ] README has install + run + screenshot
- [ ] Single command `ccprism` produces output on a fresh shell
