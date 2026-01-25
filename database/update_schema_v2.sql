-- Add new columns for efficiency and yield
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS yield_today numeric;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS efficiency numeric;
