import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, AreaChart, Area,
  PieChart, Pie, Cell, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList,
} from "recharts";
import {
  BarChart3, TrendingUp, PieChart as PieIcon, Table2, LayoutGrid, Trash2,
  ChevronRight, ChevronUp, ChevronDown, X, Hash, Pencil, GripVertical, RotateCcw,
} from "lucide-react";
import { aggregate, aggField, sumRatio, looksTemporal, fmtNum, segmentColor, hexToRgba } from "./charting";
import { evaluateKpiFormula, detectKpiFraction } from "./kpiFormula";
import { useTheme } from "../ThemeContext";
import { chartPalette } from "../chartTheme";

// Exported so Home.jsx's gallery cards can reuse the exact same chart-type icon set for
// their static per-dashboard preview icon, rather than duplicating this list.
export const CHART_TYPES = [
  { id: "bar", label: "Bar", icon: BarChart3 },
  { id: "line", label: "Line", icon: TrendingUp },
  { id: "area", label: "Area", icon: TrendingUp },
  { id: "pie", label: "Pie", icon: PieIcon },
  { id: "scatter", label: "Scatter", icon: LayoutGrid },
  { id: "table", label: "Table", icon: Table2 },
  { id: "number", label: "Number", icon: Hash },
];

// Chart types with a categorical x/name axis — the ones drill-down and click-to-select apply to.
// Exported so Dashboard.jsx's sheet-change field reset can pick sensible defaults per type
// without duplicating (and risking drift from) this list.
export const DRILLABLE_TYPES = ["bar", "line", "area", "pie"];

// A clickable point for Line/Area — recharts' custom `dot` render prop receives geometry
// (cx/cy) merged with the point's own data (payload) so it can be turned into a real
// interactive element instead of the default static dot.
function ClickableDot({ cx, cy, payload, isDim, onDotClick, color, dimColor, strokeColor }) {
  if (cx == null || cy == null) return null;
  return (
    <circle
      className="clickable-dot"
      cx={cx}
      cy={cy}
      r={isDim ? 3 : 5}
      fill={isDim ? dimColor : color}
      stroke={strokeColor}
      strokeWidth={1}
      style={{ cursor: payload?.isOther ? "default" : "pointer" }}
      onClick={() => onDotClick(payload)}
    />
  );
}

const RADIAN = Math.PI / 180;

// Custom label for the overall-ratio donut only (see isOverallRatio in ChartCard) — same
// leader-line positioning recharts' default pie label uses, but shows the raw count alongside
// the percentage for BOTH the ratio segment and Remainder (e.g. "16.47% (168)" / "83.53% (852)"),
// since a bare percentage alone doesn't say how big the underlying numbers actually are. Both
// slices carry their count in the same `rawCount` field (see chartRows' isOverallRatio branch),
// so this one code path formats both identically with zero special-casing per slice.
function renderOverallRatioLabel({ cx, cy, midAngle, outerRadius, value, payload }) {
  const radius = outerRadius + 14;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  const text = payload?.rawCount != null ? `${value}% (${fmtNum(payload.rawCount)})` : `${value}%`;
  return (
    <text x={x} y={y} fill="var(--ink-soft)" fontSize={10} textAnchor={x > cx ? "start" : "end"} dominantBaseline="central">
      {text}
    </text>
  );
}

// abbreviate ON reuses fmtNum as-is (its own K/M/B + fixed decimal rules), ignoring the
// `decimals` setting — abbreviate OFF formats the raw number to the chosen decimal places.
function formatNumberValue(value, { decimals, abbreviate, prefix, suffix }) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const body = abbreviate ? fmtNum(value) : value.toFixed(decimals);
  return `${prefix}${body}${suffix}`;
}

// A literal fraction side (e.g. the 100 in "SUM(X)/100", or 0.5 in "SUM(X)/0.5") is shown
// exactly as its own value, decimals included — fmtNum's K/M/B abbreviation and the agg side's
// integer rounding only make sense for a computed aggregate that could be an arbitrarily large
// data-driven sum; rounding a literal like 0.5 down to a whole number would misrepresent the
// actual denominator the formula names. An agg side keeps the existing rounded/abbreviated form.
function formatFractionSide(side) {
  return side.type === "literal" ? String(side.value) : fmtNum(Math.round(side.value));
}

// Bar-chart value labels (read-only only) — deliberately NOT fmtNum, which abbreviates to
// K/M/B for axis ticks/tooltips: a label sitting directly above a bar is read as the exact
// figure, so it always renders the untruncated number (comma-grouped only for readability).
// Ratio-agg bars already carry a raw 0–1 fraction in chartRows (aggregate()'s "ratio" branch
// divides sums but never multiplies by 100 outside the pie-only overall-ratio path), so this
// renders that same fraction the tooltip already shows, just unabbreviated.
function fmtExact(n) {
  if (n === undefined || n === null || isNaN(n)) return "";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// Stable key for a bar/pie category's persisted color override — "cat:" namespaced so a
// category name can never collide with a line/area measure's "field:" key in the same
// dashboard-level map. The rank/truncation overflow bucket ("Others (N)") gets one fixed
// sentinel key regardless of its current count, since N changes as the underlying data does
// and a color keyed to the exact display string would silently stop matching the moment the
// count differs.
function categoryColorKey(name, isOther) {
  return isOther ? "cat:__others__" : `cat:${name}`;
}

// The native <input type="color"> silently rejects anything but a "#rrggbb" hex string (falling
// back to black), so a computed style's "rgb(r, g, b)" — which is also what a resolved CSS
// variable like var(--ink-faint) reads back as — needs converting before priming that input.
function rgbStringToHex(rgbStr) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgbStr || "");
  if (!m) return "#000000";
  const toHex = (n) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

export default function ChartCard({
  chart, sheet, rows, baseRows, dims, meas, readOnly, onUpdate, onRemove,
  isSelectionOrigin, activeSelectionValue, onSelect, showDragHandle, inGridLayout,
  workspaceSheets, onChangeSheet,
  categoryColors, onSetCategoryColor, onResetCategoryColor,
}) {
  const { mode } = useTheme();
  const palette = chartPalette(mode);

  const type = chart.type;
  const xField = chart.x_field;
  const yField = chart.y_field;
  const yFieldDenominator = chart.y_field_denominator;
  const agg = chart.agg;
  const needsAgg = DRILLABLE_TYPES.includes(type);

  // Ordered dimension fields to drill through. Falls back to just [x_field] for charts
  // created before drill-down existed (server does the same fallback, this just covers
  // charts still sitting in local state from before a page reload).
  const drillFields = useMemo(
    () => (chart.drill_fields && chart.drill_fields.length ? chart.drill_fields : (xField ? [xField] : [])),
    [chart.drill_fields, xField]
  );

  // Client-only drill position within this one chart — never persisted, resets whenever
  // the configured drill levels change out from under it.
  const [drillPath, setDrillPath] = useState([]);
  useEffect(() => { setDrillPath([]); }, [chart.id, JSON.stringify(drillFields)]);

  const currentField = needsAgg ? (drillFields[drillPath.length] ?? xField) : xField;
  const canDrillDeeper = needsAgg && drillFields.length > drillPath.length + 1;
  const isTemporalX = looksTemporal(currentField);

  // Inline click-to-edit for the chart's optional custom title (no existing rename pattern
  // elsewhere in the app to match, so this is the pencil-icon fallback).
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(chart.title || "");

  // Pie + ratio with no dimension chosen at all means "one overall ratio for the whole
  // filtered dataset" rather than "broken out by category" — sum(Y)/sum(X) across every row,
  // shown as a 2-slice donut (ratio filled vs remainder) instead of one slice per category.
  const isOverallRatio = type === "pie" && agg === "ratio" && !currentField;

  // Opt-in top-N/bottom-N mode, replacing the fixed "top 12 + Other" default for this chart.
  // Only meaningful for a real categorical breakdown — never for a temporal x-field (ranking
  // by value would scramble a chronological axis) or the no-dimension overall-ratio donut
  // above (nothing to rank there). aggregate() itself also re-checks sortMode defensively.
  const rankLimit = chart.rank_limit || null;
  const rankDirection = chart.rank_direction || "top";
  const rankShowOther = !!chart.rank_show_other;
  const canRank = needsAgg && !isTemporalX && !isOverallRatio;
  const rankActive = canRank && !!rankLimit;

  // Single-number "KPI" widget — not in DRILLABLE_TYPES, so needsAgg/isTemporalX/
  // isOverallRatio all stay inert for it. No grouping dimension at all: one value for the
  // whole (optionally filtered) row set.
  const isNumber = type === "number";
  const numberMode = chart.number_mode || "quick";
  const numberField = chart.number_field || null;
  const numberAgg = chart.number_agg || "sum";
  const numberFormula = chart.number_formula || "";
  const numberRespectFilters = chart.number_respect_filters === undefined || chart.number_respect_filters === null
    ? true
    : !!chart.number_respect_filters;
  const numberFormat = useMemo(() => {
    if (!chart.number_format_json) return {};
    try { return JSON.parse(chart.number_format_json); } catch { return {}; }
  }, [chart.number_format_json]);
  const decimals = numberFormat.decimals ?? 0;
  const abbreviate = !!numberFormat.abbreviate;
  const prefix = numberFormat.prefix || "";
  const suffix = numberFormat.suffix || "";

  const updateNumberFormat = (patch) => onUpdate(chart.id, { numberFormat: { decimals, abbreviate, prefix, suffix, ...patch } });

  // respectFilters reads `baseRows` (persisted Filters-panel filters only), never `rows` (which
  // also has any active click-to-cross-filter selection from another chart folded in) — a Number
  // widget can't originate a selection and so has no way to clear one, so it must never be subject
  // to it. `sheet.rows` is the same sheet's full, unfiltered data for the OFF case.
  const numberSourceRows = numberRespectFilters ? baseRows : (sheet?.rows || []);
  const numberFieldNames = useMemo(() => (sheet?.columns || []).map((c) => c.name), [sheet]);

  const numberResult = useMemo(() => {
    if (!isNumber) return { value: null, error: null };
    if (numberMode === "formula") {
      if (!numberFormula.trim()) return { value: null, error: null };
      try {
        return { value: evaluateKpiFormula(numberFormula, numberSourceRows, numberFieldNames), error: null };
      } catch (err) {
        return { value: null, error: err.message };
      }
    }
    if (!numberField) return { value: null, error: null };
    return { value: aggField(numberSourceRows, numberField, numberAgg), error: null };
  }, [isNumber, numberMode, numberFormula, numberField, numberAgg, numberSourceRows, numberFieldNames]);

  // Formula-mode-only "display as fraction" toggle. Only meaningful when the formula reduces
  // to a single division where each side is either an AGG(field) call or a bare numeric
  // literal (see detectKpiFraction) — quick mode has no formula to inspect at all, and a
  // formula outside that shape (three+ aggregates, +/- at the top level, a non-literal
  // denominator, ...) has no well-defined numerator/denominator to show instead of its
  // computed value, so the toggle stays disabled rather than showing something nonsensical.
  const kpiFractionShape = useMemo(
    () => (isNumber && numberMode === "formula" && numberFormula.trim() ? detectKpiFraction(numberFormula) : null),
    [isNumber, numberMode, numberFormula]
  );
  const numberShowFraction = !!chart.number_show_fraction;
  // A literal side's value IS the constant, no computation needed; an agg side reuses aggField
  // against the same numberSourceRows the formula's own evaluation would've used it against —
  // no separate computation path. Keeps the type tag alongside the resolved value (not just the
  // bare number) so the render below can show a literal exactly as typed rather than running it
  // through fmtNum's K/M/B abbreviation, which only makes sense for a computed aggregate.
  const numberFractionResult = useMemo(() => {
    if (!kpiFractionShape) return null;
    const resolveSide = (side) => ({ type: side.type, value: side.type === "literal" ? side.value : aggField(numberSourceRows, side.field, side.agg) });
    return {
      numerator: resolveSide(kpiFractionShape.numerator),
      denominator: resolveSide(kpiFractionShape.denominator),
    };
  }, [kpiFractionShape, numberSourceRows]);

  // Count-up animation (item 4, read-only only). Re-runs whenever the target value changes
  // (mount, or a filter/selection change on a live dashboard), always counting from 0 over a
  // fixed short duration rather than tracking an in-flight "previous value" — simpler, and the
  // effect's cleanup cancels any still-running frame from a superseded target. Degrades
  // gracefully: null/error values skip the animation loop entirely and render the same "—"/
  // error text the editor already shows, on every render, with no risk of an infinite loop or
  // a stuck animation frame.
  const [displayedNumberValue, setDisplayedNumberValue] = useState(null);
  useEffect(() => {
    if (!readOnly || !isNumber) return;
    if (numberResult.error || numberResult.value == null || Number.isNaN(numberResult.value)) {
      setDisplayedNumberValue(numberResult.value);
      return;
    }
    const target = numberResult.value;
    const duration = 600;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplayedNumberValue(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [readOnly, isNumber, numberResult.value, numberResult.error]);

  // Sparkline (item 4, read-only only, quick mode only — a formula can reference more than one
  // field, so there's no single unambiguous measure to trend). Needs a temporal-looking
  // dimension on the sheet to bucket by; if there isn't one (or there's only one bucket to show,
  // i.e. no real trend), this stays null and the sparkline is skipped entirely — no empty/broken
  // mini-chart ever renders.
  const numberSparkline = useMemo(() => {
    if (!readOnly || !isNumber || numberMode !== "quick" || !numberField) return null;
    const temporalField = (dims || []).find((d) => looksTemporal(d.name));
    if (!temporalField) return null;
    const points = aggregate(numberSourceRows, temporalField.name, numberField, numberAgg, "name");
    return points.length >= 2 ? points.slice(-30) : null;
  }, [readOnly, isNumber, numberMode, numberField, numberAgg, numberSourceRows, dims]);

  const drilledRows = useMemo(() => {
    if (!needsAgg || !drillPath.length) return rows;
    return rows.filter((r) => drillPath.every((val, i) => String(r[drillFields[i]] ?? "") === val));
  }, [rows, drillPath, drillFields, needsAgg]);

  const chartRows = useMemo(() => {
    if (type === "scatter" || type === "table") return [];
    if (isOverallRatio) {
      if (!yField || !yFieldDenominator) return [];
      const ratio = sumRatio(drilledRows, yField, yFieldDenominator);
      if (ratio === null) return []; // denominator sums to zero across the whole dataset — nothing to show
      const pct = Math.round(ratio * 10000) / 100;
      // sumRatio() only returns the quotient, not the raw sums it divided — recomputing both
      // totals here (not touching sumRatio itself, which aggregate()'s per-category path also
      // relies on) so each slice's label can show its own raw count alongside its percentage.
      // Remainder's count is simply "the rest of the denominator total" — the portion the
      // highlighted value doesn't cover — not a separately-aggregated field of its own, since
      // Remainder isn't a real category with its own rows.
      const rawNumerator = drilledRows.reduce((a, r) => a + (Number(r[yField]) || 0), 0);
      const rawDenominator = drilledRows.reduce((a, r) => a + (Number(r[yFieldDenominator]) || 0), 0);
      // Both slices are synthetic (not real field values), so both get isOther: true — the
      // same flag the >12-category overflow bucket uses — which already makes
      // handleSegmentClick treat them as non-interactive (no cross-filter/drill on a slice
      // that doesn't correspond to an actual row value). rawCount (not rawNumerator) is the
      // shared field name both slices' labels read from, since Remainder's count isn't a
      // numerator — renderOverallRatioLabel doesn't care which slice it's labeling, only that
      // a count is present, so both rows use the exact same field/format for free.
      const out = [{ name: `${yField} / ${yFieldDenominator}`, value: Math.min(pct, 100), isOther: true, rawCount: rawNumerator }];
      const remainder = Math.max(0, 100 - pct);
      if (remainder > 0) out.push({ name: "Remainder", value: remainder, isOther: true, rawCount: rawDenominator - rawNumerator });
      return out;
    }
    if (!currentField) return [];
    const rankOptions = rankActive ? { limit: rankLimit, direction: rankDirection, showOther: rankShowOther } : undefined;
    return aggregate(drilledRows, currentField, yField, agg, isTemporalX ? "name" : "value", yFieldDenominator, rankOptions);
  }, [drilledRows, currentField, yField, yFieldDenominator, agg, type, isTemporalX, isOverallRatio, rankActive, rankLimit, rankDirection, rankShowOther]);

  // "(+ other)" reflects whether an Everything-else bucket actually rendered (chartRows has
  // one), not just whether the checkbox is on — when N >= the category count there's nothing
  // left to bucket, and the label shouldn't claim a bucket that isn't there.
  const rankOtherRendered = rankActive && chartRows.some((r) => r.isOther);
  const rankSuffix = rankActive ? ` — ${rankDirection} ${rankLimit}${rankOtherRendered ? " (+ other)" : ""}` : "";

  const scatterRows = useMemo(() => {
    if (type !== "scatter" || !xField || !yField) return [];
    return rows.slice(0, 400).map((r) => ({ x: Number(r[xField]) || 0, y: Number(r[yField]) || 0 }));
  }, [rows, type, xField, yField]);

  // Pie "staggered slice reveal" (read-only only): slices are appended into the displayed
  // data one at a time on a short timer, instead of animating the whole pie in as one combined
  // sweep. Confirmed via recharts' Pie.js source: <Pie>'s internal Animate only refreshes what
  // it interpolates FROM (prevSectors -> curSectors, in getDerivedStateFromProps) when its
  // `animationId` prop changes — not merely when `data`/`sectors` changes. So just growing the
  // data array on a timer, without also bumping animationId per step, would NOT animate each
  // appended slice: Animate's key wouldn't change, it wouldn't remount, and it would keep
  // rendering at whatever `t` it already settled at (≈1 after the initial mount animation) —
  // so every newly-appended slice would pop in at full size instantly instead of growing in.
  // Bumping animationId once per revealed slice forces a fresh 0->1 tween each step: the new
  // slice (no prevSectors entry at its index yet) grows from 0, while already-revealed slices
  // (which DO have a prevSectors entry) just get a small natural re-interpolation as their
  // share of the total shifts slightly — not a restart from scratch.
  //
  // Keyed on pieContentKey (content-derived), not the raw chartRows reference, for the same
  // reason established for the previous spin implementation: a reference-only change with
  // identical underlying values (e.g. React StrictMode's dev-only double-invoke of the
  // dashboard's data-fetch effect) must not restart the reveal sequence.
  const pieContentKey = useMemo(() => chartRows.map((r) => `${r.name}:${r.value}`).join("|"), [chartRows]);
  const PIE_REVEAL_BUDGET_MS = 450;
  const PIE_REVEAL_MIN_STEP_MS = 25;
  const PIE_REVEAL_MAX_STEP_MS = 90;
  const [pieRevealCount, setPieRevealCount] = useState(0);
  const [pieAnimId, setPieAnimId] = useState(0);
  const pieAnimIdRef = useRef(0);
  // useLayoutEffect (not useEffect): the reset to 1 revealed slice must land before the browser
  // paints, otherwise the first frame would briefly render zero slices (Pie renders null when
  // its data array is empty).
  useLayoutEffect(() => {
    if (!readOnly || type !== "pie") return undefined;
    const total = chartRows.length;
    if (total === 0) { setPieRevealCount(0); return undefined; }
    const stepMs = Math.max(PIE_REVEAL_MIN_STEP_MS, Math.min(PIE_REVEAL_MAX_STEP_MS, PIE_REVEAL_BUDGET_MS / Math.max(1, total - 1)));
    pieAnimIdRef.current += 1;
    setPieRevealCount(1);
    setPieAnimId(pieAnimIdRef.current);
    const timers = [];
    for (let i = 2; i <= total; i++) {
      timers.push(setTimeout(() => {
        pieAnimIdRef.current += 1;
        setPieRevealCount(i);
        setPieAnimId(pieAnimIdRef.current);
      }, stepMs * (i - 1)));
    }
    return () => timers.forEach(clearTimeout);
  }, [readOnly, type, pieContentKey]);
  const pieDisplayRows = readOnly && type === "pie" ? chartRows.slice(0, pieRevealCount) : chartRows;

  // Only dim other segments when the active selection's value actually matches a segment
  // in the CURRENT view — otherwise (e.g. right after drilling a level deeper) nothing
  // would match and every segment would render as dimmed.
  const hasSelectionMatch = isSelectionOrigin && chartRows.some((r) => r.name === activeSelectionValue);

  const handleSegmentClick = (datum) => {
    if (!datum || datum.isOther || !onSelect) return;
    const name = datum.name;
    if (canDrillDeeper) {
      setDrillPath((p) => [...p, name]);
      onSelect(currentField, name);
    } else if (isSelectionOrigin && activeSelectionValue === name) {
      onSelect(currentField, null);
    } else {
      onSelect(currentField, name);
    }
  };

  const updateDrillFields = (next) => onUpdate(chart.id, { drillFields: next });
  const addDrillField = (field) => field && updateDrillFields([...drillFields, field]);
  const removeDrillField = (i) => updateDrillFields(drillFields.filter((_, idx) => idx !== i));
  const moveDrillField = (i, dir) => {
    const next = [...drillFields];
    const j = i + dir;
    [next[i], next[j]] = [next[j], next[i]];
    updateDrillFields(next);
  };

  const Icon = (CHART_TYPES.find((t) => t.id === type) || {}).icon || BarChart3;

  // Auto-generated label from the chart's current config -- unchanged from before the title
  // feature existed. Still shown whenever no custom title has been set (chart.title is
  // null/empty), so existing charts keep looking exactly as they did.
  const autoLabel = type === "table"
    ? "Data table"
    : isNumber
    ? (numberMode === "formula" ? (numberFormula || "—") : `${numberAgg}(${numberField || "—"})`)
    : needsAgg
    ? (agg === "ratio"
      ? (isOverallRatio
        ? `${yField || "—"} / ${yFieldDenominator || "—"} (overall)`
        : `${yField || "—"} / ${yFieldDenominator || "—"}${rankSuffix} by ${currentField || "—"}`)
      : `${agg}(${yField || "—"})${rankSuffix} by ${currentField || "—"}`)
    : `${xField || "—"} vs ${yField || "—"}`;
  const hasCustomTitle = !!(chart.title && chart.title.trim());
  const displayTitle = hasCustomTitle ? chart.title : autoLabel;

  // Entry-animation tuning (item 1, public-view visual polish) — read-only only, shared by
  // bar/line/area/pie/scatter. In editor mode these props are omitted entirely (not set to
  // `false`), so recharts falls back to whatever its own default animation behavior already is
  // today, completely untouched — this matters for Scatter specifically, since recharts
  // animates it by default too (isAnimationActive: true, 400ms, but 'linear' easing); leaving
  // editor's props unset preserves that exact default rather than risking a mismatch by trying
  // to hardcode it. 400ms/ease-out keeps it snappy even though drill-down/rank clicks re-trigger
  // it on every chartRows/scatterRows change (a new array reference from the useMemo above,
  // which recharts treats as fresh entry data).
  const entryAnim = readOnly ? { isAnimationActive: true, animationDuration: 400, animationEasing: "ease-out" } : {};
  // Tooltip background/text now always theme-driven (previously only readOnly got any
  // contentStyle at all — editor mode passed `undefined`, silently relying on recharts' own
  // hardcoded white-box default, which only looked right by coincidence since light mode's
  // panel is also white). The extra radius/shadow/padding polish stays readOnly-only.
  const tooltipContentStyle = {
    background: palette.tooltipBg,
    color: palette.tooltipText,
    ...(readOnly
      ? { borderRadius: 10, border: "1px solid var(--border-soft)", boxShadow: "var(--shadow-elevated)", fontSize: 12, padding: "8px 10px" }
      : {}),
  };
  // Gradient bar fill (item 2) — only substitutes a per-color gradient url for the ACTIVE
  // (non-dimmed), non-custom-colored case in read-only; dimmed segments, editor mode, and any
  // custom-overridden bar all keep the exact flat segmentColor() fill (a custom color renders as
  // a flat swatch, not a re-derived gradient, to avoid generating/managing a per-category
  // gradient def for every possible override). Gradient ids are scoped by chart.id so multiple
  // cards on one dashboard never collide.
  const barFill = (i, isDimmed, overrideColor) =>
    (readOnly && !isDimmed && !overrideColor ? `url(#bar-grad-${chart.id}-${i % palette.series.length})` : segmentColor(i, isDimmed, palette, overrideColor));
  // Axis tick / pie-label / legend text color — previously unset on all of these, so they fell
  // back to recharts' own hardcoded default gray, invisible against a dark panel.
  const axisTick = { fontSize: 10, fill: palette.axisText };
  const legendStyle = { fontSize: 10, color: palette.axisText };

  // Per-category color-override editing (owner/admin only, see the floating swatch control
  // rendered after the chart below). Bar/pie hover a specific segment (many possible targets,
  // so the trigger tracks whichever one the pointer is over); line/area get one fixed icon
  // instead (exactly one editable target — the whole series — so there's no ambiguity to track).
  // Position is computed from the hovered SVG shape's own getBoundingClientRect() relative to
  // chartAreaRef, rather than recharts' internal geometry, so the same mechanism works for both
  // Bar (rectangles) and Pie (arcs) without reimplementing either shape's layout math.
  const chartAreaRef = useRef(null);
  const [hoverColorKey, setHoverColorKey] = useState(null);
  const [hoverColorPos, setHoverColorPos] = useState(null); // { left, top, color }
  const colorInputRef = useRef(null);
  const pendingColorKeyRef = useRef(null);
  const canEditColors = !readOnly && !!onSetCategoryColor;

  // Reads the hovered shape's own ACTUAL rendered color via getComputedStyle rather than
  // recomputing it in JS — this is what lets a single code path handle every default correctly,
  // including a CSS-variable default like the Remainder slice's "var(--ink-faint)" (the browser
  // resolves it to a concrete rgb() for us) without special-casing it. Safe from ever resolving
  // a gradient url() instead of a flat color: hover-editing only runs in the editor
  // (canEditColors implies !readOnly), and editor-mode bars never use the readOnly-only
  // per-category gradient fill, so there's always a flat, computed-style-resolvable color here.
  const handleSegmentHover = (key, event) => {
    const containerRect = chartAreaRef.current?.getBoundingClientRect();
    const targetRect = event.target.getBoundingClientRect();
    if (!containerRect) return;
    const hex = rgbStringToHex(getComputedStyle(event.target).fill);
    setHoverColorKey(key);
    setHoverColorPos({
      left: targetRect.left - containerRect.left + targetRect.width / 2,
      top: targetRect.top - containerRect.top,
      color: hex,
    });
  };

  // Pie only (both categorical and the overall-ratio widget): adjacent slices share an edge
  // with zero gap between them, so an icon positioned near a thin slice's boundary often sits
  // over a NEIGHBORING slice's actual hit-region — simply moving the cursor toward your own
  // icon can graze that neighbor and, with instant reassignment, permanently steal the hover to
  // it before you arrive. Bar rectangles don't have this problem (non-overlapping x-ranges with
  // real gaps between them), so they keep the plain instant handleSegmentHover above untouched.
  //
  // Fix: a single SHARED pending-timer per chart (not one per slice) — the first hover (nothing
  // currently shown) still commits instantly for a snappy first response, but once something IS
  // shown, a *different* slice's onMouseEnter only schedules a switch rather than committing it;
  // re-entering the currently-shown slice cancels any pending switch outright. Leaving the chart
  // schedules a clear the same way, cancelable the same way. Because there's only ever one
  // timer/candidate in flight, rapid grazing across several slices just keeps re-arming the same
  // timer with a new target instead of letting two slices' icons independently resolve and
  // flicker against each other.
  const PIE_HOVER_SETTLE_MS = 200;
  const pieHoverTimerRef = useRef(null);

  const handlePieSegmentEnter = (key, event) => {
    if (key === hoverColorKey) {
      if (pieHoverTimerRef.current) { clearTimeout(pieHoverTimerRef.current); pieHoverTimerRef.current = null; }
      return;
    }
    if (hoverColorKey === null) {
      handleSegmentHover(key, event);
      return;
    }
    if (pieHoverTimerRef.current) clearTimeout(pieHoverTimerRef.current);
    pieHoverTimerRef.current = setTimeout(() => {
      pieHoverTimerRef.current = null;
      handleSegmentHover(key, event);
    }, PIE_HOVER_SETTLE_MS);
  };

  const handlePieAreaLeave = () => {
    if (pieHoverTimerRef.current) clearTimeout(pieHoverTimerRef.current);
    pieHoverTimerRef.current = setTimeout(() => {
      pieHoverTimerRef.current = null;
      setHoverColorKey(null);
      setHoverColorPos(null);
    }, PIE_HOVER_SETTLE_MS);
  };

  // A brief graze through a neighboring slice on the way to THIS icon schedules a pending
  // switch (above) that nothing otherwise cancels once the cursor actually arrives here — the
  // icon button occludes the SVG at this exact point, so no slice's onMouseEnter fires to
  // re-affirm "stay put." Canceling here, the moment the cursor genuinely reaches the icon, is
  // what makes it actually reachable rather than switching out from under the cursor after the
  // fact. Harmless for the non-pie (bar) case too — pieHoverTimerRef is simply never set there.
  const cancelPendingPieHoverSwitch = () => {
    if (pieHoverTimerRef.current) { clearTimeout(pieHoverTimerRef.current); pieHoverTimerRef.current = null; }
  };

  const openColorPicker = (key, currentColor) => {
    pendingColorKeyRef.current = key;
    if (colorInputRef.current) {
      colorInputRef.current.value = currentColor || "#000000";
      colorInputRef.current.click();
    }
  };

  const handleColorInputChange = (e) => {
    if (pendingColorKeyRef.current && onSetCategoryColor) onSetCategoryColor(pendingColorKeyRef.current, e.target.value);
  };

  // The floating swatch+reset control shown for whichever category/measure key is currently
  // active — either the hovered bar/slice (bar/pie) or the one fixed key passed in for line/area.
  function ColorEditControl({ colorKey, color, style }) {
    const label = colorKey === "cat:__others__" ? "Others"
      : colorKey.endsWith(":highlight") ? "Highlight"
      : colorKey.endsWith(":remainder") ? "Remainder"
      : colorKey.replace(/^cat:|^field:/, "");
    return (
      <div
        onMouseEnter={cancelPendingPieHoverSwitch}
        style={{
          position: "absolute", display: "flex", alignItems: "center", gap: 2, padding: 3,
          background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 6,
          boxShadow: "0 2px 8px var(--shadow-elevated)", zIndex: 5, ...style,
        }}
      >
        <button
          type="button"
          title={`Custom color for "${label}"`}
          onClick={() => openColorPicker(colorKey, color)}
          className="btn-ghost"
          style={{ padding: 3, display: "flex" }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 3, background: color, border: "1px solid var(--border)" }} />
        </button>
        {categoryColors?.[colorKey] && (
          <button
            type="button"
            title="Reset to default color"
            onClick={() => onResetCategoryColor(colorKey)}
            className="btn-ghost"
            style={{ padding: 3 }}
          >
            <RotateCcw size={11} />
          </button>
        )}
      </div>
    );
  }

  // Line/area's whole-series override — keyed by the measure (y-field) name rather than a
  // category, since there's no per-category element to click on a single-series line/area.
  // "field:" namespaced so it can never collide with a "cat:<name>" bar/pie key even if a
  // category value happens to match a measure's name.
  const seriesColorKey = `field:${yField}`;
  const seriesColorOverride = categoryColors?.[seriesColorKey];
  const seriesColor = seriesColorOverride || (type === "line" ? palette.amber : palette.teal);

  // The no-dimension overall-ratio pie widget has no category name to key by (its two slices
  // are synthetic, not real data values), so its colors are scoped to this one chart instead of
  // shared globally like a real category's "cat:<name>" — a color set here on one ratio widget
  // must never bleed into a different ratio widget on the same dashboard.
  const ratioHighlightKey = `chart:${chart.id}:highlight`;
  const ratioRemainderKey = `chart:${chart.id}:remainder`;

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {readOnly ? (
        // Single-line header: title gets the full card width, never truncated (wraps if
        // genuinely long rather than ellipsizing). The sheet-name badge + refresh timestamp
        // that used to sit on a second line underneath have been removed entirely (not just
        // visually hidden) — see the removed computation note below.
        //
        // background: var(--header-bg) pins this to true #FFFFFF/#000000 (see styles.css),
        // deliberately distinct from --panel (the card body's background) so the header reads
        // as its own pinned block rather than just re-using the body's shade — in dark mode
        // --panel is #23261F, not black, so this is a real, visible difference; in light mode
        // --panel is already #FFFFFF, so the existing border-bottom below is what actually
        // separates header from body there. borderTopLeftRadius/borderTopRightRadius match
        // .card's own 10px so this opaque header doesn't square off the card's rounded top
        // corners (the header has no overflow:hidden ancestor to clip it for free).
        <div
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
            borderBottom: "1px solid var(--border-soft)", minWidth: 0,
            background: "var(--header-bg)", borderTopLeftRadius: 10, borderTopRightRadius: 10,
          }}
        >
          <Icon size={16} color="var(--teal)" style={{ flexShrink: 0 }} />
          <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: "var(--ink)", flex: 1, minWidth: 0, wordBreak: "break-word" }}>
            {displayTitle}
          </span>
          {isSelectionOrigin && activeSelectionValue && (
            <button
              onClick={() => onSelect(currentField, null)}
              className="btn-ghost mono"
              style={{ fontSize: 10, padding: "2px 6px", background: "var(--teal-soft)", color: "var(--teal)", borderRadius: 5, flexShrink: 0 }}
              title="Clear selection"
            >
              {activeSelectionValue} <X size={9} style={{ verticalAlign: "middle" }} />
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-soft)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            {showDragHandle && (
              <GripVertical
                size={14}
                color="var(--ink-faint)"
                className="chart-drag-handle"
                style={{ cursor: "grab", flexShrink: 0 }}
              />
            )}
            <Icon size={14} color="var(--teal)" />
            {editingTitle ? (
              <input
                autoFocus
                type="text"
                value={titleDraft}
                placeholder={autoLabel}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => { onUpdate(chart.id, { title: titleDraft.trim() || null }); setEditingTitle(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") { setTitleDraft(chart.title || ""); setEditingTitle(false); }
                }}
                className="mono"
                style={{ fontSize: 12, padding: "2px 4px", minWidth: 120 }}
              />
            ) : (
              <span
                className="mono"
                style={{ fontSize: 12, color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {displayTitle}
              </span>
            )}
            {sheet?.name && (
              <span
                className="mono"
                title={`Data source: ${sheet.name}`}
                style={{ fontSize: 10, color: "var(--ink-faint)", flexShrink: 0, whiteSpace: "nowrap", padding: "1px 5px", background: "var(--paper)", borderRadius: 4, border: "1px solid var(--border-soft)" }}
              >
                {sheet.name}
              </span>
            )}
            {!editingTitle && (
              <button
                onClick={() => { setTitleDraft(chart.title || ""); setEditingTitle(true); }}
                className="btn-ghost"
                style={{ padding: 2 }}
                title="Edit chart title"
              >
                <Pencil size={11} />
              </button>
            )}
            {isSelectionOrigin && activeSelectionValue && (
              <button
                onClick={() => onSelect(currentField, null)}
                className="btn-ghost mono"
                style={{ fontSize: 10, padding: "2px 6px", background: "var(--teal-soft)", color: "var(--teal)", borderRadius: 5 }}
                title="Clear selection"
              >
                {activeSelectionValue} <X size={9} style={{ verticalAlign: "middle" }} />
              </button>
            )}
          </div>
          <button onClick={() => onRemove(chart.id)} className="btn-ghost" style={{ padding: 4 }}>
            <Trash2 size={13} />
          </button>
        </div>
      )}

      {!readOnly && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-soft)" }}>
          {onChangeSheet && workspaceSheets && workspaceSheets.length > 1 && (
            <select
              value={chart.sheet_id}
              onChange={(e) => onChangeSheet(e.target.value)}
              className="mono"
              style={{ fontSize: 12, padding: "4px 6px" }}
              title="Change this chart's data source sheet"
            >
              {workspaceSheets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div style={{ display: "flex", gap: 4 }}>
            {CHART_TYPES.map((t) => {
              const TIcon = t.icon;
              const active = type === t.id;
              return (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={() => onUpdate(chart.id, { type: t.id })}
                  style={{
                    padding: 6, borderRadius: 6, border: `1px solid ${active ? "var(--teal-active-border)" : "transparent"}`,
                    background: active ? "var(--teal-soft)" : "transparent", color: active ? "var(--teal)" : "var(--ink-faint)", cursor: "pointer",
                  }}
                >
                  <TIcon size={13} />
                </button>
              );
            })}
          </div>
          {type !== "table" && type !== "number" && (
            <>
              {needsAgg ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                  {drillFields.map((f, i) => (
                    <span
                      key={i}
                      className="mono"
                      style={{ display: "inline-flex", alignItems: "center", gap: 2, fontSize: 11, padding: "3px 5px", borderRadius: 5, background: "var(--paper)", border: "1px solid var(--border-soft)" }}
                    >
                      {i > 0 && (
                        <button onClick={() => moveDrillField(i, -1)} className="btn-ghost" style={{ padding: 1 }} title="Move up">
                          <ChevronUp size={10} />
                        </button>
                      )}
                      {f}
                      {i < drillFields.length - 1 && (
                        <button onClick={() => moveDrillField(i, 1)} className="btn-ghost" style={{ padding: 1 }} title="Move down">
                          <ChevronDown size={10} />
                        </button>
                      )}
                      {(drillFields.length > 1 || (type === "pie" && agg === "ratio")) && (
                        <button onClick={() => removeDrillField(i)} className="btn-ghost" style={{ padding: 1 }} title={type === "pie" && agg === "ratio" ? "Remove level (drop to zero for the overall ratio, no breakdown)" : "Remove level"}>
                          <X size={10} />
                        </button>
                      )}
                    </span>
                  ))}
                  <select
                    value=""
                    onChange={(e) => addDrillField(e.target.value)}
                    className="mono"
                    style={{ fontSize: 11, padding: "3px 4px" }}
                    title="Add a drill-down level"
                  >
                    <option value="">+ level</option>
                    {dims.filter((d) => !drillFields.includes(d.name)).map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              ) : (
                <select value={xField || ""} onChange={(e) => onUpdate(chart.id, { xField: e.target.value })} className="mono" style={{ fontSize: 12, padding: "4px 6px" }}>
                  <option value="">x field</option>
                  {meas.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
              )}
              {needsAgg && agg === "ratio" ? (
                <>
                  <select value={yField || ""} onChange={(e) => onUpdate(chart.id, { yField: e.target.value })} className="mono" style={{ fontSize: 12, padding: "4px 6px" }}>
                    <option value="">numerator</option>
                    {meas.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                  <select value={yFieldDenominator || ""} onChange={(e) => onUpdate(chart.id, { yFieldDenominator: e.target.value })} className="mono" style={{ fontSize: 12, padding: "4px 6px" }}>
                    <option value="">denominator</option>
                    {meas.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                </>
              ) : (
                <select value={yField || ""} onChange={(e) => onUpdate(chart.id, { yField: e.target.value })} className="mono" style={{ fontSize: 12, padding: "4px 6px" }}>
                  <option value="">y field</option>
                  {meas.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
              )}
              {needsAgg && (
                <select value={agg} onChange={(e) => onUpdate(chart.id, { agg: e.target.value })} className="mono" style={{ fontSize: 12, padding: "4px 6px" }}>
                  {["sum", "avg", "count", "min", "max", "ratio"].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              )}
              {canRank && (
                <>
                  <select
                    value={rankLimit ? rankDirection : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) onUpdate(chart.id, { rankLimit: null });
                      else onUpdate(chart.id, { rankDirection: val, rankLimit: rankLimit || 5 });
                    }}
                    className="mono"
                    style={{ fontSize: 12, padding: "4px 6px" }}
                    title="Top/bottom N (replaces the default top-12 truncation)"
                  >
                    <option value="">all (top 12)</option>
                    <option value="top">top</option>
                    <option value="bottom">bottom</option>
                  </select>
                  {rankActive && (
                    <>
                      <input
                        type="number"
                        min={1}
                        value={rankLimit}
                        onChange={(e) => onUpdate(chart.id, { rankLimit: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                        className="mono"
                        style={{ fontSize: 12, padding: "4px 6px", width: 56 }}
                      />
                      <label className="mono" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
                        <input
                          type="checkbox"
                          checked={rankShowOther}
                          onChange={(e) => onUpdate(chart.id, { rankShowOther: e.target.checked })}
                        />
                        + Everything else
                      </label>
                    </>
                  )}
                </>
              )}
            </>
          )}
          {isNumber && (
            <>
              <select
                value={numberMode}
                onChange={(e) => onUpdate(chart.id, { numberMode: e.target.value })}
                className="mono"
                style={{ fontSize: 12, padding: "4px 6px" }}
              >
                <option value="quick">Quick</option>
                <option value="formula">Formula</option>
              </select>
              {numberMode === "quick" ? (
                <>
                  <select value={numberField || ""} onChange={(e) => onUpdate(chart.id, { numberField: e.target.value })} className="mono" style={{ fontSize: 12, padding: "4px 6px" }}>
                    <option value="">field</option>
                    {meas.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                  </select>
                  <select value={numberAgg} onChange={(e) => onUpdate(chart.id, { numberAgg: e.target.value })} className="mono" style={{ fontSize: 12, padding: "4px 6px" }}>
                    {["sum", "avg", "count", "min", "max"].map((a) => <option key={a} value={a}>{a}</option>)}
                  </select>
                </>
              ) : (
                <input
                  type="text"
                  placeholder="e.g. SUM(Sales) - AVG(Cost)"
                  value={numberFormula}
                  onChange={(e) => onUpdate(chart.id, { numberFormula: e.target.value })}
                  className="mono"
                  style={{ fontSize: 12, padding: "4px 6px", flex: 1, minWidth: 200 }}
                />
              )}
            </>
          )}
        </div>
      )}

      {!readOnly && isNumber && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "8px 12px", borderBottom: "1px solid var(--border-soft)" }}>
          <label className="mono" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={numberRespectFilters}
              onChange={(e) => onUpdate(chart.id, { numberRespectFilters: e.target.checked })}
            />
            Respect dashboard filters
          </label>
          {numberMode === "formula" && (
            <label
              className="mono"
              style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4, opacity: kpiFractionShape ? 1 : 0.5 }}
              title={
                kpiFractionShape
                  ? undefined
                  : "Only available when the formula is a single division where each side is an aggregate or a plain number (e.g. SUM(X)/SUM(Y), SUM(X)/100, or 100*SUM(X)/50)"
              }
            >
              <input
                type="checkbox"
                checked={numberShowFraction}
                disabled={!kpiFractionShape}
                onChange={(e) => onUpdate(chart.id, { numberShowFraction: e.target.checked })}
              />
              Display as fraction
            </label>
          )}
          <label className="mono" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
            Decimals
            <input
              type="number"
              min={0}
              max={6}
              value={decimals}
              onChange={(e) => updateNumberFormat({ decimals: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              className="mono"
              style={{ fontSize: 12, padding: "4px 6px", width: 48 }}
            />
          </label>
          <label className="mono" style={{ fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>
            <input type="checkbox" checked={abbreviate} onChange={(e) => updateNumberFormat({ abbreviate: e.target.checked })} />
            Abbreviate (K/M/B)
          </label>
          <input
            type="text"
            placeholder="prefix ($)"
            value={prefix}
            onChange={(e) => updateNumberFormat({ prefix: e.target.value })}
            className="mono"
            style={{ fontSize: 12, padding: "4px 6px", width: 70 }}
          />
          <input
            type="text"
            placeholder="suffix (%)"
            value={suffix}
            onChange={(e) => updateNumberFormat({ suffix: e.target.value })}
            className="mono"
            style={{ fontSize: 12, padding: "4px 6px", width: 70 }}
          />
        </div>
      )}

      {needsAgg && drillFields.length > 1 && (
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-soft)", padding: "6px 12px 0", display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => setDrillPath([])}
            className="btn-ghost"
            style={{ padding: "1px 4px", fontWeight: drillPath.length === 0 ? 700 : 400, color: drillPath.length === 0 ? "var(--ink)" : "var(--ink-faint)" }}
          >
            All
          </button>
          {drillPath.map((val, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={10} color="var(--ink-faint)" />
              <button
                onClick={() => setDrillPath((p) => p.slice(0, i + 1))}
                className="btn-ghost"
                style={{ padding: "1px 4px", fontWeight: i === drillPath.length - 1 ? 700 : 400, color: i === drillPath.length - 1 ? "var(--ink)" : "var(--ink-faint)" }}
              >
                {val}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      <div
        ref={chartAreaRef}
        className={readOnly ? "chart-viz-readonly" : undefined}
        style={inGridLayout ? { padding: 12, flex: 1, minHeight: 0, position: "relative" } : { padding: 12, minHeight: 240, position: "relative" }}
        onMouseLeave={canEditColors ? (type === "pie" ? handlePieAreaLeave : () => setHoverColorKey(null)) : undefined}
      >
        {type === "table" ? (
          <DataTable rows={rows} columns={sheet?.columns || []} fillHeight={inGridLayout} />
        ) : isNumber ? (
          <div
            style={
              readOnly && numberSparkline
                ? { height: inGridLayout ? "100%" : undefined, minHeight: inGridLayout ? undefined : 220, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "4px 0" }
                : { height: inGridLayout ? "100%" : 220, display: "flex", alignItems: "center", justifyContent: "center" }
            }
          >
            {numberResult.error ? (
              <div className="mono" style={{ fontSize: 12, color: "var(--red)", textAlign: "center", padding: "0 12px" }}>{numberResult.error}</div>
            ) : (
              <>
                <div className="mono" style={{ fontSize: 40, fontWeight: 700, color: "var(--ink)", textAlign: "center" }}>
                  {numberShowFraction && numberFractionResult
                    ? `${formatFractionSide(numberFractionResult.numerator)}/${formatFractionSide(numberFractionResult.denominator)}`
                    : formatNumberValue(readOnly ? displayedNumberValue : numberResult.value, { decimals, abbreviate, prefix, suffix })}
                </div>
                {readOnly && numberSparkline && (
                  <div style={{ width: "100%", maxWidth: 220, height: 36, marginTop: 10 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={numberSparkline} margin={{ top: 2, right: 2, left: 2, bottom: 0 }}>
                        <defs>
                          <linearGradient id={`kpi-spark-grad-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={palette.teal} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={palette.teal} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          type="monotone"
                          dataKey="value"
                          stroke={palette.teal}
                          strokeWidth={1.5}
                          fill={`url(#kpi-spark-grad-${chart.id})`}
                          dot={false}
                          isAnimationActive
                          animationDuration={500}
                          animationEasing="ease-out"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (!isOverallRatio && !currentField) || !yField || (needsAgg && agg === "ratio" && !yFieldDenominator) ? (
          <div style={{ height: inGridLayout ? "100%" : 220, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "var(--ink-faint)" }} className="mono">
            Choose fields to plot this chart
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={inGridLayout ? "100%" : 230}>
            {type === "bar" ? (
              <BarChart data={chartRows} margin={{ top: readOnly ? 22 : 4, right: 8, left: -16, bottom: 0 }}>
                {readOnly && (
                  <defs>
                    {palette.series.map((color, i) => (
                      <linearGradient key={i} id={`bar-grad-${chart.id}-${i}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={1} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.55} />
                      </linearGradient>
                    ))}
                  </defs>
                )}
                <CartesianGrid stroke="var(--paper-line)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={axisTick} tickFormatter={fmtNum} />
                <Tooltip formatter={(v) => fmtNum(v)} contentStyle={tooltipContentStyle} />
                <Bar
                  dataKey="value"
                  radius={[3, 3, 0, 0]}
                  onClick={(data) => handleSegmentClick(data?.payload ?? data)}
                  onMouseEnter={canEditColors ? (data, index, e) => {
                    const r = chartRows[index];
                    if (!r) return;
                    handleSegmentHover(categoryColorKey(r.name, r.isOther), e);
                  } : undefined}
                  cursor="pointer"
                  {...entryAnim}
                >
                  {chartRows.map((r, i) => {
                    const key = categoryColorKey(r.name, r.isOther);
                    const isDimmed = hasSelectionMatch && r.name !== activeSelectionValue;
                    return <Cell key={i} fill={barFill(i, isDimmed, categoryColors?.[key])} />;
                  })}
                  {readOnly && (
                    <LabelList dataKey="value" position="top" formatter={fmtExact} fill={palette.axisText} fontSize={10} />
                  )}
                </Bar>
              </BarChart>
            ) : type === "line" ? (
              <LineChart data={chartRows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="var(--paper-line)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={axisTick} tickFormatter={fmtNum} />
                <Tooltip formatter={(v) => fmtNum(v)} contentStyle={tooltipContentStyle} />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={seriesColor}
                  strokeWidth={2}
                  dot={(dotProps) => (
                    <ClickableDot
                      key={dotProps.index}
                      {...dotProps}
                      color={seriesColor}
                      dimColor={palette.dimColor}
                      strokeColor={palette.dotStroke}
                      isDim={hasSelectionMatch && dotProps.payload?.name !== activeSelectionValue}
                      onDotClick={handleSegmentClick}
                    />
                  )}
                  {...entryAnim}
                />
              </LineChart>
            ) : type === "area" ? (
              <AreaChart data={chartRows} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                {readOnly && (
                  <defs>
                    <linearGradient id={`area-grad-${chart.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={seriesColor} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={seriesColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                )}
                <CartesianGrid stroke="var(--paper-line)" vertical={false} />
                <XAxis dataKey="name" tick={axisTick} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis tick={axisTick} tickFormatter={fmtNum} />
                <Tooltip formatter={(v) => fmtNum(v)} contentStyle={tooltipContentStyle} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={seriesColor}
                  fill={readOnly ? `url(#area-grad-${chart.id})` : (seriesColorOverride ? hexToRgba(seriesColorOverride, 0.15) : palette.tealSoftFill)}
                  strokeWidth={2}
                  dot={(dotProps) => (
                    <ClickableDot
                      key={dotProps.index}
                      {...dotProps}
                      color={seriesColor}
                      dimColor={palette.dimColor}
                      strokeColor={palette.dotStroke}
                      isDim={hasSelectionMatch && dotProps.payload?.name !== activeSelectionValue}
                      onDotClick={handleSegmentClick}
                    />
                  )}
                  {...entryAnim}
                />
              </AreaChart>
            ) : type === "pie" ? (
              <PieChart>
                <Tooltip formatter={(v) => (isOverallRatio ? `${v}%` : fmtNum(v))} contentStyle={tooltipContentStyle} />
                <Legend wrapperStyle={legendStyle} />
                <Pie
                  data={pieDisplayRows}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={0}
                  outerRadius={80}
                  label={isOverallRatio ? renderOverallRatioLabel : axisTick}
                  onClick={(data) => handleSegmentClick(data?.payload ?? data)}
                  onMouseEnter={canEditColors ? (data, index, e) => {
                    const r = pieDisplayRows[index];
                    if (!r) return;
                    const key = isOverallRatio ? (r.name === "Remainder" ? ratioRemainderKey : ratioHighlightKey) : categoryColorKey(r.name, r.isOther);
                    handlePieSegmentEnter(key, e);
                  } : undefined}
                  cursor={isOverallRatio ? "default" : "pointer"}
                  {...entryAnim}
                  {...(readOnly ? { animationId: pieAnimId, animationDuration: 240 } : {})}
                >
                  {pieDisplayRows.map((r, i) => (
                    <Cell
                      key={i}
                      // Remainder uses var(--ink-faint) directly (same "CSS var as SVG fill" pattern
                      // renderOverallRatioLabel already uses below) rather than palette.dimColor --
                      // dimColor is shared by every chart's cross-filter-dimming and is tuned for
                      // that purpose (a muted copy of the ACTIVE color), not for standing out against
                      // a plain panel on its own. ink-faint is deliberately legible-but-secondary
                      // against the panel in both themes, giving clearer separation from both the
                      // panel and the highlighted slice than dimColor did (particularly in dark mode,
                      // where dimColor sits close in luminance to the panel background) — reset on
                      // this specific slice restores exactly this value, not the categorical dimColor.
                      // The isOverallRatio widget has no category name to key by, so its two slices
                      // use their own chart-scoped keys (ratioHighlightKey/ratioRemainderKey) rather
                      // than the globally-shared "cat:<name>" identity real categories get.
                      fill={isOverallRatio
                        ? (r.name === "Remainder" ? (categoryColors?.[ratioRemainderKey] || "var(--ink-faint)") : (categoryColors?.[ratioHighlightKey] || segmentColor(0, false, palette)))
                        : segmentColor(i, hasSelectionMatch && r.name !== activeSelectionValue, palette, categoryColors?.[categoryColorKey(r.name, r.isOther)])}
                    />
                  ))}
                </Pie>
              </PieChart>
            ) : (
              <ScatterChart margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="var(--paper-line)" />
                <XAxis dataKey="x" name={xField} tick={axisTick} tickFormatter={fmtNum} />
                <YAxis dataKey="y" name={yField} tick={axisTick} tickFormatter={fmtNum} />
                <Tooltip formatter={(v) => fmtNum(v)} contentStyle={tooltipContentStyle} />
                <Scatter data={scatterRows} fill={palette.red} {...entryAnim} />
              </ScatterChart>
            )}
          </ResponsiveContainer>
        )}

        {/* Bar/pie: floating swatch+reset control tracking whichever segment is currently
            hovered. Line/area: one fixed swatch+reset control in the corner, since the whole
            series is the only editable target — no hover-tracking needed. Both read from the
            same categoryColors map and the same ColorEditControl/openColorPicker/native
            <input type="color"> plumbing above; owner/admin only (canEditColors), never shown
            to a read-only viewer. */}
        {canEditColors && (type === "bar" || type === "pie") && hoverColorKey && hoverColorPos && (
          <ColorEditControl
            colorKey={hoverColorKey}
            color={hoverColorPos.color}
            style={{ left: hoverColorPos.left, top: hoverColorPos.top, transform: "translate(-50%, -100%)", marginTop: -6 }}
          />
        )}
        {canEditColors && (type === "line" || type === "area") && (
          <ColorEditControl colorKey={seriesColorKey} color={seriesColor} style={{ top: 4, right: 4 }} />
        )}
        {canEditColors && (
          <input
            type="color"
            ref={colorInputRef}
            onChange={handleColorInputChange}
            style={{ position: "absolute", width: 0, height: 0, opacity: 0, pointerEvents: "none" }}
            tabIndex={-1}
          />
        )}
      </div>
    </div>
  );
}

function DataTable({ rows, columns, fillHeight }) {
  const cols = columns.slice(0, 8);
  return (
    <div
      className="mono"
      style={{ overflow: "auto", height: fillHeight ? "100%" : undefined, maxHeight: fillHeight ? undefined : 260, border: "1px solid var(--border-soft)", borderRadius: 6 }}
    >
      <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
        <thead style={{ position: "sticky", top: 0, background: "var(--paper)" }}>
          <tr>{cols.map((c) => <th key={c.name} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>{c.name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, 60).map((r, i) => (
            <tr key={i} style={{ background: i % 2 ? "var(--paper)" : "var(--panel)" }}>
              {cols.map((c) => <td key={c.name} style={{ padding: "4px 8px", whiteSpace: "nowrap" }}>{String(r[c.name] ?? "")}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 60 && <div style={{ textAlign: "center", padding: 4, fontSize: 10, color: "var(--ink-faint)" }}>Showing first 60 of {rows.length} rows</div>}
    </div>
  );
}
