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

// Probe points for checkFractionHomogeneity: well-separated, none zero or equal to each other,
// so a formula that ISN'T a homogeneous k*(num/den) can't coincidentally satisfy the
// consistency check below at all four.
const FRACTION_PROBES = [[2, 3], [5, 7], [11, 4], [9, 13]];
const AGG_PLACEHOLDER = "AGGSLOT";
const LITERAL_RE = /\d+(?:\.\d+)?/g;

// Checks whether `probeFormula` (which must contain exactly the two free variables __num__ and
// __den__, and nothing else) is homogeneous of degree +1 in __num__ and degree -1 in __den__ --
// i.e. f(t*num, den) = t*f(num, den) and f(num, t*den) = f(num, den)/t for every t -- which
// holds iff the formula reduces to k*(num/den) for some constant k. Returns that k, or null if
// the identity doesn't hold. See detectKpiFraction below for why this is checked numerically
// (via probe evaluation) rather than by inspecting expr-eval's parsed structure.
function checkFractionHomogeneity(probeFormula) {
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
  return k;
}

// Substitutes every AGG(...) call in `formula` with a stable, non-numeric placeholder
// ("AGGSLOT" — no digits, so it can never collide with LITERAL_RE below), built up manually
// (not via .replace(regex, fn)) so each slot's exact index within the resulting string is known
// — needed to later determine source order relative to candidate numeric literals.
function buildBaseAndAggSlots(formula) {
  const aggMatches = [...formula.matchAll(AGG_CALL_RE)];
  let base = "";
  let cursor = 0;
  const aggSlots = [];
  for (const m of aggMatches) {
    base += formula.slice(cursor, m.index);
    aggSlots.push({ index: base.length, length: AGG_PLACEHOLDER.length, agg: m[1].toLowerCase(), field: m[2].trim() });
    base += AGG_PLACEHOLDER;
    cursor = m.index + m[0].length;
  }
  base += formula.slice(cursor);
  return { base, aggSlots };
}

// Bare numeric literals remaining in `base` (which has every AGG(...) call already replaced —
// so any digits found here are genuine arithmetic constants, never leftover field-name text,
// since a field name only ever appears inside an AGG(...) call's parens).
function findLiteralSlots(base) {
  return [...base.matchAll(LITERAL_RE)].map((m) => ({ index: m.index, length: m[0].length, value: parseFloat(m[0]) }));
}

// Detects whether `formula` is algebraically "a single division where each side is either an
// AGG(field) call or a bare numeric literal, optionally scaled by a constant multiplier" —
// e.g. "SUM(X)/SUM(Y)", "SUM(X)/100", "5000/SUM(Y)", or "100*SUM(X)/50" — regardless of where
// the multiplier sits syntactically. Backs the Number/KPI widget's "display as fraction"
// toggle: outside this shape (three+ aggregates, +/- at the top level, multiplying two
// aggregates instead of dividing, a constant folded into a non-literal denominator, ...)
// there's no well-defined numerator/denominator to show.
//
// Detected numerically (via checkFractionHomogeneity) rather than by inspecting expr-eval's
// parsed structure: expr-eval's Parser doesn't expose a public AST, only an internal compiled
// instruction list that isn't part of its documented API. Each AGG(...) call becomes one
// "slot"; if fewer than two AGG calls are present, candidate bare-literal slots fill the
// remainder — a literal slot needs no probing (its value IS the constant), so filling it in
// alongside a probed AGG slot and running the exact same two-variable homogeneity check
// naturally covers the mixed agg/literal cases without any special-casing beyond finding the
// candidates. Slots are always assigned to numerator/denominator by source order (whichever
// appears first in the formula is the numerator) — the same convention the plain two-aggregate
// case already used. When more than one literal candidate exists (e.g. the "100" and "50" in
// "100*SUM(X)/50"), each is tried in turn; only the one that's actually the formula's division
// operand passes the homogeneity check (a mere multiplier like "100" fails it, since it isn't
// being divided by).
export function detectKpiFraction(formula) {
  const { base, aggSlots } = buildBaseAndAggSlots(formula);
  if (aggSlots.length > 2) return null;

  const literalSlots = findLiteralSlots(base);
  const neededLiterals = 2 - aggSlots.length;
  if (literalSlots.length < neededLiterals) return null;

  const literalCombos =
    neededLiterals === 0
      ? [[]]
      : neededLiterals === 1
      ? literalSlots.map((l) => [l])
      : literalSlots.flatMap((a, i) => literalSlots.slice(i + 1).map((b) => [a, b]));

  for (const literals of literalCombos) {
    const slots = [...aggSlots.map((s) => ({ ...s, kind: "agg" })), ...literals.map((s) => ({ ...s, kind: "literal" }))];
    slots.sort((a, b) => a.index - b.index);
    const [first, second] = slots;

    // Replace the later slot first so the earlier slot's index (computed against `base`,
    // before either replacement) stays valid.
    const probe =
      base.slice(0, first.index) +
      "__num__" +
      base.slice(first.index + first.length, second.index) +
      "__den__" +
      base.slice(second.index + second.length);

    const k = checkFractionHomogeneity(probe);
    if (k === null) continue;

    const toDescriptor = (slot) => (slot.kind === "agg" ? { type: "agg", agg: slot.agg, field: slot.field } : { type: "literal", value: slot.value });
    return { numerator: toDescriptor(first), denominator: toDescriptor(second) };
  }
  return null;
}
