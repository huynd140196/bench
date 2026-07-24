-- Free-form drag/resize position, in react-grid-layout units (12-col grid). NULL means "never
-- explicitly positioned" — the client computes a sensible default on read (approximating the
-- old 3-per-row flow via sort_order) rather than this migration backfilling a value, so the
-- default logic can change later without needing another migration.
ALTER TABLE charts ADD COLUMN grid_x INTEGER;
ALTER TABLE charts ADD COLUMN grid_y INTEGER;
ALTER TABLE charts ADD COLUMN grid_w INTEGER;
ALTER TABLE charts ADD COLUMN grid_h INTEGER;
