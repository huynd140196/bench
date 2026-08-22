import { Parser } from "expr-eval";
import { aggField } from "./charting";

const parser = new Parser();
const AGG_CALL_RE = /\b(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*([^()]+?)\s*\)/gi;

// Two-phase substitute-then-evaluate, same shape as the server's structural-only
// validateKpiFormula, but here real row data is available: each AGG(field) match is replaced
// with its actually-computed value (via the same aggField() every other aggregation path
// uses — sum/avg/count/min/max, aggregate-then-divide, never per-row-then-aggregate), then
// the arithmetic residue is parsed and evaluated. Throws a user-facing Error for an unknown
// field, a formula with no AGG(...) calls at all, or any bare field left unwrapped after
// substitution — the caller (ChartCard) displays these directly as the widget's inline error.
// Doesn't pre-round the result (unlike the sheet-level compileFormula) since the widget
// applies its own decimals/prefix/suffix formatting downstream.
export function evaluateKpiFormula(formula, rows, fieldNames) {
  const fieldSet = new Set(fieldNames);
  let sawMatch = false;

  const substituted = formula.replace(AGG_CALL_RE, (_full, agg, field) => {
    sawMatch = true;
    const trimmedField = field.trim();
    if (!fieldSet.has(trimmedField)) {
      throw new Error(`Unknown field "${trimmedField}" in ${agg.toUpperCase()}(...)`);
    }
    const value = aggField(rows, trimmedField, agg.toLowerCase());
    return `(${value})`;
  });

  let expr;
  try {
    expr = parser.parse(substituted);
  } catch (e) {
    throw new Error(`Invalid formula: ${e.message}`);
  }

  // Checked before the zero-match case below: a formula with a real, bare (never-wrapped)
  // field reference — e.g. "Sales + 1" — should say so specifically, rather than the more
  // generic "no AGG call at all" message, which is reserved for a formula with literally no
  // field reference whatsoever (e.g. a bare constant like "5 + 3").
  const leftover = expr.variables();
  if (leftover.length) {
    throw new Error(`"${leftover[0]}" must be wrapped in SUM()/AVG()/MIN()/MAX()/COUNT() — bare field references aren't allowed`);
  }

  if (!sawMatch) {
    throw new Error("Formula must contain at least one SUM()/AVG()/MIN()/MAX()/COUNT() call");
  }

  return expr.evaluate();
}

// Probe points for detectKpiFraction: well-separated, none zero or equal to each other, so a
// formula that ISN'T a homogeneous k*(num/den) can't coincidentally satisfy the consistency
// check below at all four.
const FRACTION_PROBES = [[2, 3], [5, 7], [11, 4], [9, 13]];

// Detects whether `formula` is algebraically "a single division of exactly two aggregate
// values, optionally scaled by a constant multiplier" -- e.g. "SUM(X)/SUM(Y)" or
// "100 * SUM(X) / SUM(Y)" -- regardless of where the multiplier sits syntactically (before,
// after, split across both sides). Backs the Number/KPI widget's "display as fraction" toggle:
// outside this shape (three+ aggregates, +/- at the top level, multiplying the two aggregates
// instead of dividing, a constant folded into the denominator, ...) there's no well-defined
// numerator/denominator to show.
//
// Detected numerically rather than by inspecting expr-eval's parsed structure: expr-eval's
// Parser doesn't expose a public AST, only an internal compiled instruction list that isn't
// part of its documented API. A formula reduces to k*(num/den) for some constant k iff it's
// homogeneous of degree +1 in the numerator's value and degree -1 in the denominator's --
// f(t*num, den) = t*f(num, den) and f(num, t*den) = f(num, den)/t for every t. Substituting the
// formula's first AGG(...) with a symbolic __num__ and its second with __den__, then checking
// that a consistent k = f(num, den)*den/num falls out across several independent probe pairs,
// confirms this identity holds (a formula that isn't actually this shape can't satisfy it at
// multiple unrelated points except by coincidence, which doesn't happen for any real formula
// built from +, -, *, /, ^ and the aggregate calls).
export function detectKpiFraction(formula) {
  const matches = [...formula.matchAll(AGG_CALL_RE)];
  if (matches.length !== 2) return null;

  let i = 0;
  const probeFormula = formula.replace(AGG_CALL_RE, () => (i++ === 0 ? "__num__" : "__den__"));

  let expr;
  try {
    expr = parser.parse(probeFormula);
  } catch {
    return null;
  }
  const vars = expr.variables().sort();
  if (vars.length !== 2 || vars[0] !== "__den__" || vars[1] !== "__num__") return null;

  let k = null;
  for (const [num, den] of FRACTION_PROBES) {
    let val;
    try {
      val = expr.evaluate({ __num__: num, __den__: den });
    } catch {
      return null;
    }
    if (!Number.isFinite(val)) return null;
    const candidateK = (val * den) / num;
    if (k === null) k = candidateK;
    else if (Math.abs(candidateK - k) > Math.abs(k) * 1e-9 + 1e-9) return null;
  }

  return {
    numerator: { agg: matches[0][1].toLowerCase(), field: matches[0][2].trim() },
    denominator: { agg: matches[1][1].toLowerCase(), field: matches[1][2].trim() },
  };
}
