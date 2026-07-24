export function looksTemporal(key) {
  return /date|month|year|day|week|quarter|time/i.test(key || "");
}

// Aggregate-then-divide: sums numField and denField across `rows` independently, then
// divides the two totals — NOT a per-row ratio that then gets summed/averaged (that's what
// a "Y/X" calculated field would give you, computed per row before this ever runs). Returns
// null if the denominator sums to zero, since the true ratio is undefined for that data —
// callers should omit rather than show a fabricated 0. Standalone so a future KPI-card ratio
// option (sum(Y)/sum(X) over the whole filtered dataset, no grouping) can call this directly.
export function sumRatio(rows, numField, denField) {
  const num = rows.reduce((a, r) => a + (Number(r[numField]) || 0), 0);
  const den = rows.reduce((a, r) => a + (Number(r[denField]) || 0), 0);
  return den === 0 ? null : num / den;
}

// sum/avg/count/min/max over a single field across `rows`, no grouping — the same per-field
// reduction aggregate() applies per category, factored out so it's not duplicated a third
// time by the number/KPI widget (quick mode calls this directly; formula mode calls it once
// per AGG(field) substitution). Guards empty `rows` (aggregate()'s groups are never empty by
// construction, but a KPI widget's whole filtered row set genuinely can be).
export function aggField(rows, field, agg) {
  const vals = rows.map((r) => Number(r[field]) || 0);
  if (agg === "count") return vals.length;
  if (!vals.length) return 0;
  if (agg === "avg") return vals.reduce((a, b) => a + b, 0) / vals.length;
  if (agg === "min") return Math.min(...vals);
  if (agg === "max") return Math.max(...vals);
  return vals.reduce((a, b) => a + b, 0); // sum (default)
}

// rankOptions: { limit, direction: "top"|"bottom", showOther } — opt-in replacement for the
// fixed ">12 categories -> top 11 + Other" default below. Ignored whenever sortMode is "name"
// (a temporal x-field): value-ranking a chronological axis would scramble the timeline, and
// this guard applies even if a chart's rank_limit is still set from before its x-field was
// changed to a temporal one — safer than trusting the caller to always clear it first.
export function aggregate(rows, xField, yField, agg, sortMode, yFieldDenominator, rankOptions) {
  const groups = new Map();
  rows.forEach((r) => {
    const key = r[xField] === undefined || r[xField] === "" ? "(blank)" : String(r[xField]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  });

  let out = Array.from(groups.entries()).map(([name, groupRows]) => {
    let value;
    if (agg === "ratio") {
      value = sumRatio(groupRows, yField, yFieldDenominator);
      if (value === null) return null; // denominator sums to zero for this category — omit it
    } else {
      value = aggField(groupRows, yField, agg);
    }
    return { name, value: Math.round(value * 100) / 100 };
  }).filter(Boolean);

  if (sortMode === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  else out.sort((a, b) => b.value - a.value);

  // Recomputes a rolled-up bucket's value the same aggregate-then-divide way individual
  // categories above got (Σnum/Σden across `excluded` for ratio, not an average of their
  // already-divided per-category ratios) — shared by both the default >12 path and the
  // opt-in rank-mode path below, rather than reimplemented per path.
  function bucketFrom(excluded, label) {
    if (!excluded.length) return null;
    let val;
    if (agg === "ratio") {
      const excludedRows = excluded.flatMap((item) => groups.get(item.name));
      val = sumRatio(excludedRows, yField, yFieldDenominator);
    } else if (agg === "avg") {
      val = excluded.reduce((a, b) => a + b.value, 0) / excluded.length;
    } else {
      val = excluded.reduce((a, b) => a + b.value, 0);
    }
    return val === null ? null : { name: `${label} (${excluded.length})`, value: Math.round(val * 100) / 100, isOther: true };
  }

  if (rankOptions?.limit && sortMode !== "name") {
    const { limit, direction, showOther } = rankOptions;
    // Rank by value regardless of how `out` is currently sorted, so top/bottom selection is
    // always well-defined even though this same function also supports name-sorted output.
    const rankedDesc = [...out].sort((a, b) => b.value - a.value);
    // slice(0, limit) / slice(-limit) both naturally return the whole array when
    // limit >= rankedDesc.length, which in turn makes `excluded` empty below — "N >= total
    // categories" and "Everything else is a no-op" fall out of this for free.
    const selected = direction === "bottom" ? rankedDesc.slice(-limit) : rankedDesc.slice(0, limit);
    const selectedNames = new Set(selected.map((r) => r.name));
    const excluded = rankedDesc.filter((r) => !selectedNames.has(r.name));
    // Selected categories are always shown value-descending, regardless of top/bottom — the
    // two modes differ only in WHICH categories are picked, not in display order.
    let result = [...selected].sort((a, b) => b.value - a.value);
    if (showOther) {
      const bucket = bucketFrom(excluded, "Everything else");
      if (bucket) result = [...result, bucket];
    }
    return result;
  }

  if (out.length > 12) {
    const head = out.slice(0, 11);
    const bucket = bucketFrom(out.slice(11), "Other");
    out = bucket ? [...head, bucket] : head;
    if (sortMode === "name") out.sort((a, b) => a.name.localeCompare(b.name));
  }
  return out;
}

export function applyFilters(rows, filters) {
  const activeFields = Object.keys(filters || {}).filter((k) => filters[k] && filters[k].length > 0);
  if (!activeFields.length) return rows;
  return rows.filter((r) => activeFields.every((f) => filters[f].includes(String(r[f]))));
}

export function fmtNum(n) {
  if (n === undefined || n === null || isNaN(n)) return "—";
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

// Fill for a bar/pie segment at `index`, given whether a selection is active elsewhere in the
// same chart, and the current theme's chart palette (see chartTheme.js — kept out of this
// file so charting.js stays framework-agnostic, no React/theme import here). Selected segment
// (or "no selection at all") keeps its normal color; every other segment when a selection IS
// active gets muted.
export function segmentColor(index, isDimmed, palette) {
  return isDimmed ? palette.dimColor : palette.series[index % palette.series.length];
}
