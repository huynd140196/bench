import { Parser } from "expr-eval";

const parser = new Parser();

// Sheet column names are free-form (from CSV/Excel headers) and often contain spaces or
// symbols expr-eval can't parse as identifiers (e.g. "Home State"). Before parsing/evaluating
// a formula, replace each real column name with a safe alias (longest name first, so a short
// name that's a prefix of a longer one doesn't get substituted out of turn).
function buildAliasMap(columnNames) {
  const sorted = [...columnNames].sort((a, b) => b.length - a.length);
  const map = new Map();
  sorted.forEach((name, i) => map.set(name, `__f${i}`));
  return map;
}

function substituteFieldNames(formula, aliasMap) {
  let out = formula;
  for (const [name, alias] of aliasMap) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(escaped, "g"), alias);
  }
  return out;
}

// Parses and validates `formula` against `columnNames`. Throws a user-facing Error if the
// formula is malformed or references a field that doesn't exist on the sheet. On success,
// returns a `(row) => number|null` evaluator. Never uses eval()/Function() — expr-eval parses
// into an AST and evaluates against a plain object scope.
export function compileFormula(formula, columnNames) {
  if (!formula || !formula.trim()) throw new Error("Formula is required");

  const aliasMap = buildAliasMap(columnNames);
  const substituted = substituteFieldNames(formula, aliasMap);

  let expr;
  try {
    expr = parser.parse(substituted);
  } catch (e) {
    throw new Error(`Invalid formula: ${e.message}`);
  }

  const aliasToName = new Map([...aliasMap].map(([name, alias]) => [alias, name]));
  const referenced = expr.variables();
  const unknown = referenced.filter((v) => !aliasToName.has(v));
  if (unknown.length) {
    throw new Error(`Formula references unknown field(s): ${unknown.join(", ")}`);
  }

  return (row) => {
    const scope = {};
    for (const alias of referenced) {
      const name = aliasToName.get(alias);
      const v = Number(row[name]);
      scope[alias] = Number.isFinite(v) ? v : 0;
    }
    try {
      const result = expr.evaluate(scope);
      return Number.isFinite(result) ? Math.round(result * 100) / 100 : null;
    } catch {
      return null;
    }
  };
}

// Validates a full set of calculated field definitions against a sheet's real columns:
// each formula must compile, and names must be unique and not collide with real columns.
// Throws a user-facing Error on the first problem found.
export function validateCalculatedFields(fields, realColumns) {
  const realNames = new Set(realColumns.map((c) => c.name));
  const seen = new Set();
  for (const f of fields) {
    if (!f || typeof f.name !== "string" || !f.name.trim() || typeof f.formula !== "string" || !f.formula.trim()) {
      throw new Error("Each calculated field needs a name and a formula");
    }
    if (realNames.has(f.name)) {
      throw new Error(`"${f.name}" already exists as a column on this sheet`);
    }
    if (seen.has(f.name)) {
      throw new Error(`Duplicate calculated field name "${f.name}"`);
    }
    seen.add(f.name);
    try {
      compileFormula(f.formula, [...realNames]);
    } catch (err) {
      throw new Error(`"${f.name}": ${err.message}`);
    }
  }
}

// Adds calculated columns (type: "measure") to `columns` and computes their per-row values
// into `rows`, without mutating the stored sheet data. Sheets with no calculated fields pass
// through untouched.
export function withCalculatedFields(columns, rows, calculatedFields) {
  if (!calculatedFields || !calculatedFields.length) return { columns, rows };

  const columnNames = columns.map((c) => c.name);
  const compiled = calculatedFields.map((cf) => {
    try {
      return { name: cf.name, fn: compileFormula(cf.formula, columnNames) };
    } catch {
      // Definitions are validated at save time, so this should be unreachable; fall back
      // to a null-producing field rather than let a bad formula 500 the whole request.
      return { name: cf.name, fn: () => null };
    }
  });

  const newColumns = [...columns, ...calculatedFields.map((cf) => ({ name: cf.name, type: "measure" }))];
  const newRows = rows.map((row) => {
    const extra = {};
    for (const c of compiled) extra[c.name] = c.fn(row);
    return { ...row, ...extra };
  });
  return { columns: newColumns, rows: newRows };
}
