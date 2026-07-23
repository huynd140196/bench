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
