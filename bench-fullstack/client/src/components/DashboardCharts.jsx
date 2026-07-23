import React from "react";
import ChartCard from "./ChartCard";
import { applyFilters } from "./charting";

// Renders the chart grid shared by the owner-editable Dashboard page and the
// always-read-only SharedDashboard page. Pass `readOnly` to hide chart edit
// controls; `children` renders extra trailing grid cells (e.g. an "Add chart" tile).
//
// `selection` is the dashboard-wide, client-only click-to-cross-filter state:
// { chartId, sheetId, field, value } | null. It's applied to every OTHER chart sharing
// that sheetId (the originating chart already reflects its own click via its local
// drill/selection state, and re-filtering its own rows here would collapse it down to a
// single bar instead of just highlighting one).
export default function DashboardCharts({ charts, sheetsById, filters, readOnly, onUpdateChart, onRemoveChart, selection, onSelectionChange, children }) {
  return (
    <div className="chart-grid">
      {charts.map((c) => {
        const sheet = sheetsById[c.sheet_id];
        if (!sheet) return null;
        // baseRows: persisted Filters-panel filters only, never the ephemeral click-to-cross-filter
        // selection below — the Number widget's "respect dashboard filters" reads from this, since
        // it can never originate (and so can never clear) a cross-filter selection set by another chart.
        const baseRows = applyFilters(sheet.rows, filters[c.sheet_id] || {});
        let rows = baseRows;
        const isSelectionOrigin = selection?.chartId === c.id;
        if (selection && selection.sheetId === sheet.id && !isSelectionOrigin) {
          rows = rows.filter((r) => String(r[selection.field] ?? "") === selection.value);
        }
        const dims = sheet.columns.filter((f) => f.type === "dimension");
        const meas = sheet.columns.filter((f) => f.type === "measure");
        return (
          <ChartCard
            key={c.id}
            chart={c}
            sheet={sheet}
            rows={rows}
            baseRows={baseRows}
            dims={dims}
            meas={meas}
            readOnly={readOnly}
            onUpdate={onUpdateChart}
            onRemove={onRemoveChart}
            isSelectionOrigin={isSelectionOrigin}
            activeSelectionValue={isSelectionOrigin ? selection.value : null}
            onSelect={
              onSelectionChange
                ? (field, value) => onSelectionChange(value == null ? null : { chartId: c.id, sheetId: sheet.id, field, value })
                : undefined
            }
          />
        );
      })}
      {children}
    </div>
  );
}
