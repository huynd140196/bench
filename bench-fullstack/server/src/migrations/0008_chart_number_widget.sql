-- Single-number "Number"/"KPI" widget chart type. number_mode: 'quick' | 'formula'.
-- number_respect_filters defaults to true (matches every other chart type's behavior).
-- number_format_json holds { decimals, abbreviate, prefix, suffix }.
ALTER TABLE charts ADD COLUMN number_mode TEXT;
ALTER TABLE charts ADD COLUMN number_field TEXT;
ALTER TABLE charts ADD COLUMN number_agg TEXT;
ALTER TABLE charts ADD COLUMN number_formula TEXT;
ALTER TABLE charts ADD COLUMN number_respect_filters INTEGER NOT NULL DEFAULT 1;
ALTER TABLE charts ADD COLUMN number_format_json TEXT;
