-- Which view a Number/KPI widget currently shows: 'number' (default, the plain figure) or
-- 'pie' (the same overall-ratio pie widget, fed numerator/denominator from formula-mode's
-- evaluated aggregates instead of a real ratio-agg chart's y_field/y_field_denominator
-- columns). Nullable/defaulted to 'number' in application code, same convention as
-- number_show_fraction, so existing rows need no backfill. All number_* formatting fields
-- stay stored and untouched regardless of which mode is active, so toggling back restores
-- them exactly as they were.
ALTER TABLE charts ADD COLUMN number_display_mode TEXT;
