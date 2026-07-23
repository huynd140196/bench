import React, { useEffect, useMemo, useState, useCallback } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Plus, Filter, Copy, Check, X } from "lucide-react";
import { api } from "../api";
import DashboardCharts from "../components/DashboardCharts";

// Anyone can view a dashboard at this route; only the original creator (dashboard.created_by)
// sees/uses the edit controls below. Everyone else gets the same read-only view SharedDashboard.jsx renders.
export default function Dashboard({ user }) {
  const { workspaceId, dashboardId } = useParams();
  const [dashboard, setDashboard] = useState(null);
  const [charts, setCharts] = useState([]);
  const [workspaceSheets, setWorkspaceSheets] = useState([]);
  const [sheetsById, setSheetsById] = useState({});
  const [filters, setFilters] = useState({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Click-to-cross-filter selection ({ chartId, sheetId, field, value }): client-only,
  // resets on reload, separate from the persisted checkbox Filters panel above.
  const [selection, setSelection] = useState(null);

  // Edit controls show for the dashboard's creator, or for the site admin overriding
  // ownership (Part B) — same rule the server enforces in requireDashboardOwner.
  const isOwner = !!(user && dashboard && (user.id === dashboard.created_by || user.is_admin));

  const load = useCallback(async () => {
    const dashRes = await api.getDashboard(workspaceId, dashboardId);
    setDashboard(dashRes.dashboard);
    setCharts(dashRes.charts);
    setFilters(dashRes.dashboard.filters || {});
    setSheetsById(Object.fromEntries(dashRes.sheets.map((s) => [s.id, s])));
    // Only needed to populate the "add chart" sheet picker below; requires workspace
    // membership, so a non-member owner (or any non-member viewer) simply won't get it.
    api.listSheets(workspaceId).then((d) => setWorkspaceSheets(d.sheets)).catch(() => setWorkspaceSheets([]));
  }, [workspaceId, dashboardId]);

  useEffect(() => { load(); }, [load]);

  const saveFilters = async (next) => {
    setFilters(next);
    await api.updateDashboard(workspaceId, dashboardId, { filters: next });
  };

  const toggleFilterValue = (sheetId, field, value) => {
    const sheetFilters = { ...(filters[sheetId] || {}) };
    const current = new Set(sheetFilters[field] || []);
    if (current.has(value)) current.delete(value); else current.add(value);
    sheetFilters[field] = Array.from(current);
    saveFilters({ ...filters, [sheetId]: sheetFilters });
  };

  const addChart = async () => {
    const sheet = workspaceSheets[0];
    if (!sheet) return alert("Upload a sheet in this workspace first.");
    const full = sheetsById[sheet.id] || (await api.getSheet(workspaceId, sheet.id)).sheet;
    setSheetsById((p) => ({ ...p, [sheet.id]: full }));
    const dims = full.columns.filter((c) => c.type === "dimension");
    const meas = full.columns.filter((c) => c.type === "measure");
    const { chart } = await api.addChart(workspaceId, dashboardId, {
      sheetId: sheet.id, type: "bar", xField: dims[0]?.name, yField: meas[0]?.name, agg: "sum",
    });
    setCharts((cs) => [...cs, chart]);
  };

  const updateChart = async (id, patch) => {
    setCharts((cs) => cs.map((c) => {
      if (c.id !== id) return c;
      const drill_fields = Array.isArray(patch.drillFields) ? patch.drillFields.filter(Boolean) : c.drill_fields;
      const x_field = Array.isArray(patch.drillFields) ? (drill_fields[0] ?? null) : (patch.xField ?? c.x_field);
      // "in patch" (not "??") for the rank_* fields specifically: clearing rank_limit back to
      // null (switching the toolbar to "all") is a real action, and "??" can't tell that apart
      // from "field wasn't sent, keep the old value" since null is nullish either way.
      return {
        ...c,
        type: patch.type ?? c.type,
        x_field,
        y_field: patch.yField ?? c.y_field,
        y_field_denominator: patch.yFieldDenominator ?? c.y_field_denominator,
        agg: patch.agg ?? c.agg,
        drill_fields,
        rank_limit: "rankLimit" in patch ? patch.rankLimit : c.rank_limit,
        rank_direction: "rankDirection" in patch ? patch.rankDirection : c.rank_direction,
        rank_show_other: "rankShowOther" in patch ? (patch.rankShowOther ? 1 : 0) : c.rank_show_other,
        number_mode: "numberMode" in patch ? patch.numberMode : c.number_mode,
        number_field: "numberField" in patch ? patch.numberField : c.number_field,
        number_agg: "numberAgg" in patch ? patch.numberAgg : c.number_agg,
        number_formula: "numberFormula" in patch ? patch.numberFormula : c.number_formula,
        number_respect_filters: "numberRespectFilters" in patch ? (patch.numberRespectFilters ? 1 : 0) : c.number_respect_filters,
        number_format_json: "numberFormat" in patch ? (patch.numberFormat ? JSON.stringify(patch.numberFormat) : null) : c.number_format_json,
        title: "title" in patch ? (patch.title || null) : c.title,
      };
    }));
    await api.updateChart(workspaceId, dashboardId, id, patch);
  };

  const removeChart = async (id) => {
    setCharts((cs) => cs.filter((c) => c.id !== id));
    if (selection?.chartId === id) setSelection(null);
    await api.deleteChart(workspaceId, dashboardId, id);
  };

  const copyLink = () => {
    const url = `${window.location.origin}/dashboards/${dashboardId}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const sheetsUsed = useMemo(() => [...new Set(charts.map((c) => c.sheet_id))].map((id) => sheetsById[id]).filter(Boolean), [charts, sheetsById]);

  if (!dashboard) return null;

  return (
    <div style={{ padding: "20px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link to="/" className="mono" style={{ fontSize: 12, color: "var(--ink-soft)", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <ArrowLeft size={12} /> Back
        </Link>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn" onClick={copyLink}>{copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy link"}</button>
          {isOwner && (
            <button className="btn" onClick={() => setFiltersOpen((o) => !o)}><Filter size={13} /> Filters</button>
          )}
        </div>
      </div>

      <h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>{dashboard.name}</h1>

      {selection && (
        <button
          onClick={() => setSelection(null)}
          className="btn-ghost mono"
          style={{ marginTop: 10, fontSize: 11, padding: "4px 8px", background: "var(--teal-soft)", color: "var(--teal)", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Filtered by {selection.field}: {selection.value} <X size={11} />
        </button>
      )}

      {isOwner && filtersOpen && (
        <div className="card" style={{ padding: 12, marginTop: 12, display: "flex", flexWrap: "wrap", gap: 20 }}>
          {sheetsUsed.length === 0 && <div className="mono" style={{ fontSize: 12, color: "var(--ink-faint)" }}>Add a chart first to filter its data.</div>}
          {sheetsUsed.map((sheet) => (
            <div key={sheet.id}>
              <div className="mono" style={{ fontSize: 10, textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>{sheet.name}</div>
              {sheet.columns.filter((c) => c.type === "dimension").map((d) => {
                const uniq = Array.from(new Set(sheet.rows.map((r) => String(r[d.name] ?? "")))).slice(0, 20);
                return (
                  <div key={d.name} style={{ marginBottom: 8, minWidth: 130 }}>
                    <div className="mono" style={{ fontSize: 10, color: "var(--ink-faint)" }}>{d.name}</div>
                    <div style={{ maxHeight: 100, overflow: "auto" }}>
                      {uniq.map((v) => (
                        <label key={v} className="mono" style={{ display: "flex", gap: 6, fontSize: 11, cursor: "pointer" }}>
                          <input type="checkbox" checked={(filters[sheet.id]?.[d.name] || []).includes(v)} onChange={() => toggleFilterValue(sheet.id, d.name, v)} />
                          {v || "(blank)"}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <DashboardCharts
        charts={charts}
        sheetsById={sheetsById}
        filters={filters}
        readOnly={!isOwner}
        onUpdateChart={isOwner ? updateChart : undefined}
        onRemoveChart={isOwner ? removeChart : undefined}
        selection={selection}
        onSelectionChange={setSelection}
      >
        {isOwner && (
          <button onClick={addChart} style={{ minHeight: 240, border: "1.5px dashed var(--border)", borderRadius: 10, background: "transparent", color: "var(--ink-faint)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer" }}>
            <Plus size={18} /> Add chart
          </button>
        )}
      </DashboardCharts>
    </div>
  );
}
