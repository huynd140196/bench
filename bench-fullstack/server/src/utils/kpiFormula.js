import { Parser } from "expr-eval";

const parser = new Parser();
const AGG_CALL_RE = /\b(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*([^()]+?)\s*\)/gi;

// Structural-only validation at chart-save time: there's no row data yet (that only exists
// client-side, against the live filtered sheet), so each AGG(field) match is substituted with
// a dummy `(1)` rather than a real computed value — this only proves the formula is shaped
// correctly (every AGG(...) wraps a real column name, the arithmetic residue parses, and no
// bare field was left unwrapped), the same two-phase substitute-then-evaluate shape the
// client's evaluateKpiFormula uses for the real computation.
export function validateKpiFormula(formula, columnNames) {
  if (!formula || !formula.trim()) throw new Error("Formula is required");

  const columnSet = new Set(columnNames);
  let sawMatch = false;
  const substituted = formula.replace(AGG_CALL_RE, (_full, _agg, field) => {
    sawMatch = true;
    const trimmedField = field.trim();
    if (!columnSet.has(trimmedField)) {
      throw new Error(`Unknown field "${trimmedField}" in formula`);
    }
    return "(1)";
  });

  let expr;
  try {
    expr = parser.parse(substituted);
  } catch (e) {
    throw new Error(`Invalid formula: ${e.message}`);
  }

  // Checked before the zero-match case below — see the client's evaluateKpiFormula for why
  // this order matters (a bare, never-wrapped field like "Sales + 1" should get this specific
  // message, not the generic "no AGG call at all" one).
  const leftover = expr.variables();
  if (leftover.length) {
    throw new Error(`"${leftover[0]}" must be wrapped in SUM()/AVG()/MIN()/MAX()/COUNT() — bare field references aren't allowed`);
  }

  if (!sawMatch) {
    throw new Error("Formula must contain at least one SUM(...)/AVG(...)/MIN(...)/MAX(...)/COUNT(...) call");
  }
}
