-- Number/KPI widget's formula-mode "display as fraction" toggle: shows the two aggregate
-- values as "numerator/denominator" instead of the computed percentage-style result. Nullable
-- like every other Number-widget format field; null/0 means the existing percentage-style
-- display (the only option before this).
ALTER TABLE charts ADD COLUMN number_show_fraction INTEGER;
