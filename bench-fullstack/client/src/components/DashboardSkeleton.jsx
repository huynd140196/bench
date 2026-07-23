import React from "react";
import ChartCardSkeleton from "./ChartCardSkeleton";

// Shared loading placeholder for SharedDashboard.jsx and Dashboard.jsx's initial load —
// at that point ownership isn't known yet either way (the dashboard fetch that would tell
// us hasn't resolved), so this renders identically for any viewer. Once the real dashboard
// loads, Dashboard.jsx's owner/editor UI takes over completely untouched by this.
export default function DashboardSkeleton({ count = 3 }) {
  return (
    <div style={{ padding: "20px 16px" }}>
      <div className="skeleton-block" style={{ width: 110, height: 11, marginBottom: 8 }} />
      <div className="skeleton-block" style={{ width: 240, height: 22 }} />
      <div className="chart-grid">
        {Array.from({ length: count }).map((_, i) => <ChartCardSkeleton key={i} />)}
      </div>
    </div>
  );
}
