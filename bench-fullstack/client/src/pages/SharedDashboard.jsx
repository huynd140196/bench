import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { X } from "lucide-react";
import { api } from "../api";
import { timeAgo } from "../utils";
import DashboardCharts from "../components/DashboardCharts";
import DashboardSkeleton from "../components/DashboardSkeleton";

// Public, always read-only: reachable by anyone (including logged-out visitors) via the
// dashboard's own id — no token, no login, no workspace membership required. Click-to-select
// highlighting and cross-filtering (part of the read-only viewing experience, not an edit)
// still work here via client-only `selection` state.
export default function SharedDashboard() {
  const { dashboardId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState(null);

  useEffect(() => {
    api.getDashboardById(dashboardId).then(setData).catch((e) => setError(e.message));
  }, [dashboardId]);

  if (error) return <div style={{ padding: 40, textAlign: "center" }} className="mono">{error}</div>;
  if (!data) return <DashboardSkeleton />;

  const sheetsById = Object.fromEntries(data.sheets.map((s) => [s.id, s]));
  const filters = data.dashboard.filters || {};

  return (
    <div style={{ padding: "20px 16px" }}>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginBottom: 4 }}>Read-only dashboard</div>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>{data.dashboard.name}</h1>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-faint)", marginTop: 2 }}>updated {timeAgo(data.dashboard.updated_at)}</div>
      {selection && (
        <button
          onClick={() => setSelection(null)}
          className="btn-ghost mono"
          style={{ marginTop: 10, fontSize: 11, padding: "4px 8px", background: "var(--teal-soft)", color: "var(--teal)", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          Filtered by {selection.field}: {selection.value} <X size={11} />
        </button>
      )}
      <DashboardCharts
        charts={data.charts}
        sheetsById={sheetsById}
        filters={filters}
        readOnly
        selection={selection}
        onSelectionChange={setSelection}
      />
    </div>
  );
}
