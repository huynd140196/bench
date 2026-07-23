import React from "react";

// Placeholder matching a real ChartCard's shape (header row + body block) so the grid
// doesn't shift size once real cards swap in. Used while dashboard/chart/sheet data is
// still loading — never shown once real ChartCards have data to render.
export default function ChartCardSkeleton() {
  return (
    <div className="card" style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: "1px solid var(--border-soft)" }}>
        <div className="skeleton-block" style={{ width: 14, height: 14, borderRadius: 4 }} />
        <div className="skeleton-block" style={{ width: 120, height: 12 }} />
      </div>
      <div style={{ padding: 12, minHeight: 240, display: "flex", alignItems: "flex-end" }}>
        <div className="skeleton-block" style={{ width: "100%", height: 220 }} />
      </div>
    </div>
  );
}
