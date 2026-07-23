-- Opt-in top-N/bottom-N truncation mode for categorical charts (bar/line/area/pie),
-- replacing the fixed "always top 12 + Other" default for a chart once set.
-- rank_limit NULL (default) = today's default behavior, untouched.
ALTER TABLE charts ADD COLUMN rank_limit INTEGER;
ALTER TABLE charts ADD COLUMN rank_direction TEXT NOT NULL DEFAULT 'top';
ALTER TABLE charts ADD COLUMN rank_show_other INTEGER NOT NULL DEFAULT 0;
