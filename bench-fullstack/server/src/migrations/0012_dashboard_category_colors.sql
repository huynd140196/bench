-- Persisted per-dashboard color overrides: a JSON object mapping a stable key to a hex color
-- string. Keys are namespaced to avoid a category name colliding with a measure name in the
-- same map: "cat:<name>" for a bar/pie category, "cat:__others__" (a fixed sentinel, not the
-- literal "Others (N)" display string) for the rank/truncation overflow bucket regardless of
-- its current count, and "field:<yField>" for a line/area chart's whole-series color. Stored
-- once per dashboard (not per chart), same as filters_json, so one category/measure gets one
-- consistent color across every chart on the dashboard that shows it.
ALTER TABLE dashboards ADD COLUMN category_colors_json TEXT NOT NULL DEFAULT '{}';
