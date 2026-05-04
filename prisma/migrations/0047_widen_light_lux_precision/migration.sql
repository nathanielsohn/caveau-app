-- Allow physically plausible Sentinel light readings up to 50,000 lux.
-- DECIMAL(5,2) tops out at 999.99, while the ingest schema accepts values
-- in bright inspection / loading conditions.

ALTER TABLE "sensor_readings"
  ALTER COLUMN "light_lux" TYPE DECIMAL(7,2);

ALTER TABLE "sensor_reading_hourly_rollups"
  ALTER COLUMN "light_lux_avg" TYPE DECIMAL(7,2),
  ALTER COLUMN "light_lux_min" TYPE DECIMAL(7,2),
  ALTER COLUMN "light_lux_max" TYPE DECIMAL(7,2);

ALTER TABLE "sensor_reading_daily_rollups"
  ALTER COLUMN "light_lux_avg" TYPE DECIMAL(7,2),
  ALTER COLUMN "light_lux_min" TYPE DECIMAL(7,2),
  ALTER COLUMN "light_lux_max" TYPE DECIMAL(7,2);
