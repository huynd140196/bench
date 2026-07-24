import React, { useMemo } from "react";
// react-grid-layout 2.x's default export is a new composable-hooks API; the flat v1-style
// props this file uses (layout/cols/rowHeight/isDraggable/draggableHandle/onDragStop, etc.,
// plus the WidthProvider HOC) live under its dedicated "/legacy" compatibility subpath instead.
import { ReactGridLayout as GridLayout, WidthProvider } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const ReactGridLayout = WidthProvider(GridLayout);

export const GRID_COLS = 12;
export const GRID_ROW_HEIGHT = 30;
const DEFAULT_W = 4; // 3-per-row at 12 cols, matching the old CSS grid's 3-column tier
const DEFAULT_H = 9; // ~270px at rowHeight 30 + margins, roughly the old fixed card height

// Every chart needs a layout entry (react-grid-layout requires one per child), but not every
// chart has ever been explicitly positioned (grid_x is null until the user's first real drag/
// resize on it — see ChartCard.jsx/charts.js). Already-positioned charts keep their exact saved
// spot; never-positioned ones are assigned a 3-per-row flow slot, placed AFTER every positioned
// chart's lowest occupied row so the two groups can't collide by construction, no matter how
// they're interleaved in sort_order.
export function computeGridLayout(charts) {
  const positioned = [];
  const unpositioned = [];
  charts.forEach((c) => (c.grid_x != null ? positioned.push(c) : unpositioned.push(c)));

  const layout = positioned.map((c) => ({
    i: c.id,
    x: c.grid_x,
    y: c.grid_y ?? 0,
    w: c.grid_w ?? DEFAULT_W,
    h: c.grid_h ?? DEFAULT_H,
  }));

  const flowStartY = positioned.reduce((max, c) => Math.max(max, (c.grid_y ?? 0) + (c.grid_h ?? DEFAULT_H)), 0);
  unpositioned.forEach((c, idx) => {
    layout.push({
      i: c.id,
      x: (idx % 3) * DEFAULT_W,
      y: flowStartY + Math.floor(idx / 3) * DEFAULT_H,
      w: DEFAULT_W,
      h: DEFAULT_H,
    });
  });
  return layout;
}

// Desktop-width grid: free-form drag/resize in editor mode, or the exact same saved layout
// rendered fully static (no drag, no resize grips) in read-only — same component, same
// computed positions, just non-interactive, so a public viewer sees precisely what the owner
// arranged rather than an approximation. Narrow-width and the plain stacked fallback never
// import this component at all (see DashboardCharts.jsx).
export default function DashboardGridLayout({ charts, readOnly, onLayoutItemChange, children, renderChart }) {
  const layout = useMemo(() => computeGridLayout(charts), [charts]);

  const handleStop = (_layout, _oldItem, newItem) => {
    onLayoutItemChange(newItem.i, { gridX: newItem.x, gridY: newItem.y, gridW: newItem.w, gridH: newItem.h });
  };

  return (
    <>
      <ReactGridLayout
        className="dashboard-grid-layout"
        layout={layout}
        cols={GRID_COLS}
        rowHeight={GRID_ROW_HEIGHT}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        isDraggable={!readOnly}
        isResizable={!readOnly}
        draggableHandle=".chart-drag-handle"
        onDragStop={readOnly ? undefined : handleStop}
        onResizeStop={readOnly ? undefined : handleStop}
        compactType="vertical"
      >
        {charts.map((c) => <div key={c.id}>{renderChart(c)}</div>)}
      </ReactGridLayout>
      {children}
    </>
  );
}
