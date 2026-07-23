-- Optional user-set title overriding the chart's auto-generated label. NULL/empty means
-- "keep showing the auto-generated label" so existing charts are unaffected.
ALTER TABLE charts ADD COLUMN title TEXT;
