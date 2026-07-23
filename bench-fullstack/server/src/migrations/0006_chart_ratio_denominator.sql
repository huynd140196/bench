-- SUM(y_field)/SUM(y_field_denominator) aggregate-then-divide ratio charts.
-- NULL denominator = not a ratio chart, untouched default behavior.
ALTER TABLE charts ADD COLUMN y_field_denominator TEXT;
