-- Add new columns to telemetry table
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS aux_voltage numeric;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS load_state integer; -- 0: Off, 1: On
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS pv_voltage numeric;
ALTER TABLE telemetry ADD COLUMN IF NOT EXISTS pv_current numeric;
