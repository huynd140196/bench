import { Router } from "express";
import { nanoid } from "nanoid";
import db from "../db.js";
import { optionalAuth, requireDashboardOwner } from "../middleware/auth.js";
import { validateKpiFormula } from "../utils/kpiFormula.js";

const router = Router();
router.use(optionalAuth);

// Real columns + calculated fields for a sheet — the same universe of names the client's
// measure dropdowns (and therefore any AGG(field) in a KPI formula) are allowed to reference.
function sheetFieldNames(sheetId) {
  const sheet = db.prepare("SELECT columns_json, calculated_fields_json FROM sheets WHERE id = ?").get(sheetId);
  if (!sheet) return [];
  const real = JSON.parse(sheet.columns_json).map((c) => c.name);
  const calculated = JSON.parse(sheet.calculated_fields_json || "[]").map((cf) => cf.name);
  return [...real, ...calculated];
}

router.post("/:workspaceId/dashboards/:dashboardId/charts", requireDashboardOwner, (req, res) => {
  const {
    sheetId, type = "bar", xField = null, yField = null, yFieldDenominator = null, agg = "sum", drillFields,
    rankLimit = null, rankDirection = "top", rankShowOther = false,
    numberMode = null, numberField = null, numberAgg = null, numberFormula = null,
    numberRespectFilters = true, numberFormat = null, title = null,
  } = req.body;
  if (!sheetId) return res.status(400).json({ error: "sheetId is required" });

  if (type === "number" && numberMode === "formula" && numberFormula) {
    try {
      validateKpiFormula(numberFormula, sheetFieldNames(sheetId));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  const id = nanoid();
  const count = db.prepare("SELECT COUNT(*) c FROM charts WHERE dashboard_id = ?").get(req.params.dashboardId).c;
  const finalDrillFields = Array.isArray(drillFields) && drillFields.length ? drillFields : (xField ? [xField] : []);
  const finalXField = finalDrillFields[0] ?? xField ?? null;
  const numberFormatJson = numberFormat ? JSON.stringify(numberFormat) : null;
  db.prepare(
    `INSERT INTO charts (
      id, dashboard_id, sheet_id, type, x_field, y_field, y_field_denominator, agg, sort_order, drill_fields_json,
      rank_limit, rank_direction, rank_show_other,
      number_mode, number_field, number_agg, number_formula, number_respect_filters, number_format_json, title
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, req.params.dashboardId, sheetId, type, finalXField, yField, yFieldDenominator, agg, count, JSON.stringify(finalDrillFields),
    rankLimit, rankDirection, rankShowOther ? 1 : 0,
    numberMode, numberField, numberAgg, numberFormula, numberRespectFilters ? 1 : 0, numberFormatJson, title
  );
  res.json({
    chart: {
      id, dashboard_id: req.params.dashboardId, sheet_id: sheetId, type,
      x_field: finalXField, y_field: yField, y_field_denominator: yFieldDenominator, agg, sort_order: count, drill_fields: finalDrillFields,
      rank_limit: rankLimit, rank_direction: rankDirection, rank_show_other: rankShowOther ? 1 : 0,
      number_mode: numberMode, number_field: numberField, number_agg: numberAgg, number_formula: numberFormula,
      number_respect_filters: numberRespectFilters ? 1 : 0, number_format_json: numberFormatJson, title,
    },
  });
});

router.patch("/:workspaceId/dashboards/:dashboardId/charts/:chartId", requireDashboardOwner, (req, res) => {
  const chart = db.prepare("SELECT * FROM charts WHERE id = ? AND dashboard_id = ?").get(req.params.chartId, req.params.dashboardId);
  if (!chart) return res.status(404).json({ error: "Chart not found" });
  const patch = { ...chart, ...req.body };

  // drillFields (when sent) is authoritative and x_field is derived as its first entry, so
  // the ordered-levels editor and the plain x-field dropdown (scatter/table) never fight.
  let drillFields;
  let xField;
  if (Array.isArray(req.body.drillFields)) {
    drillFields = req.body.drillFields.filter(Boolean);
    xField = drillFields[0] ?? null;
  } else {
    drillFields = chart.drill_fields_json ? JSON.parse(chart.drill_fields_json) : (chart.x_field ? [chart.x_field] : []);
    xField = patch.xField ?? patch.x_field ?? null;
  }

  // "?? existing" (like yField/yFieldDenominator above) can't tell "field not sent, keep the
  // old value" apart from "field explicitly sent as null, clear it" — and clearing rank_limit
  // to null (switching the toolbar back to "all") is a real, required action here, not just a
  // theoretical case. Checking "in req.body" distinguishes the two correctly. Same reasoning
  // applies to every number_* field below (e.g. clearing number_formula back to empty).
  const rankLimit = "rankLimit" in req.body ? req.body.rankLimit : chart.rank_limit;
  const rankDirection = "rankDirection" in req.body ? req.body.rankDirection : chart.rank_direction;
  const rankShowOther = "rankShowOther" in req.body ? (req.body.rankShowOther ? 1 : 0) : chart.rank_show_other;

  const numberMode = "numberMode" in req.body ? req.body.numberMode : chart.number_mode;
  const numberField = "numberField" in req.body ? req.body.numberField : chart.number_field;
  const numberAgg = "numberAgg" in req.body ? req.body.numberAgg : chart.number_agg;
  const numberFormula = "numberFormula" in req.body ? req.body.numberFormula : chart.number_formula;
  const numberRespectFilters = "numberRespectFilters" in req.body ? (req.body.numberRespectFilters ? 1 : 0) : chart.number_respect_filters;
  const numberFormatJson = "numberFormat" in req.body
    ? (req.body.numberFormat ? JSON.stringify(req.body.numberFormat) : null)
    : chart.number_format_json;
  const title = "title" in req.body ? (req.body.title || null) : chart.title;

  const effectiveType = patch.type;
  if (effectiveType === "number" && numberMode === "formula" && numberFormula) {
    try {
      validateKpiFormula(numberFormula, sheetFieldNames(chart.sheet_id));
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  db.prepare(
    `UPDATE charts SET
      type = ?, x_field = ?, y_field = ?, y_field_denominator = ?, agg = ?, drill_fields_json = ?,
      rank_limit = ?, rank_direction = ?, rank_show_other = ?,
      number_mode = ?, number_field = ?, number_agg = ?, number_formula = ?, number_respect_filters = ?, number_format_json = ?,
      title = ?
    WHERE id = ?`
  ).run(
    patch.type, xField, patch.yField ?? patch.y_field, patch.yFieldDenominator ?? patch.y_field_denominator ?? null, patch.agg, JSON.stringify(drillFields),
    rankLimit, rankDirection, rankShowOther,
    numberMode, numberField, numberAgg, numberFormula, numberRespectFilters, numberFormatJson,
    title,
    chart.id
  );
  res.json({ ok: true });
});

router.delete("/:workspaceId/dashboards/:dashboardId/charts/:chartId", requireDashboardOwner, (req, res) => {
  db.prepare("DELETE FROM charts WHERE id = ? AND dashboard_id = ?").run(req.params.chartId, req.params.dashboardId);
  res.json({ ok: true });
});

export default router;
