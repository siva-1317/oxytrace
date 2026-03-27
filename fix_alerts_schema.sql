-- Run this completely in the Supabase SQL Editor

-- 1. Ensure the alerts table doesn't have broken triggers referencing esp32_device_id
drop trigger if exists trg_generate_sensor_alerts on public.iot_telemetry;
drop trigger if exists trg_process_sensor_reading_from_device on public.sensor_readings;

-- 2. Safely add the column back if it was accidentally dropped, so that we can gracefully remove or keep it
alter table public.alerts add column if not exists esp32_device_id text;

-- 3. Recreate the trigger that processes sensor readings but safely handle esp32_device_id
create or replace function public.process_sensor_reading_from_device()
returns trigger as $$
declare
  cyl record;
  threshold_cfg jsonb;
  current_total_weight numeric := coalesce(new.gas_weight_kg, 0);
  gas_weight numeric := 0;
  gas_pct numeric := 0;
  leak_warn numeric := 120;
  leak_danger numeric := 200;
  low_gas numeric := 20;
  danger_gas numeric := 10;
begin
  select *
    into cyl
  from public.cylinders
  where id = new.cylinder_id
     or (new.cylinder_id is null and esp32_device_id = new.esp32_device_id)
  limit 1;

  if cyl.id is not null then
    new.cylinder_id := cyl.id;
    gas_weight := greatest(current_total_weight - coalesce(cyl.empty_cylinder_weight_kg, 0), 0);
    new.gas_weight_kg := gas_weight;

    if coalesce(cyl.total_capacity_kg, 0) > 0 then
      gas_pct := round(least(100, greatest(0, (gas_weight / cyl.total_capacity_kg) * 100))::numeric, 2);
      new.gas_level_pct := gas_pct;
    end if;
  end if;

  select setting_value
    into threshold_cfg
  from public.app_settings
  where setting_key = 'alert_thresholds';

  if threshold_cfg is not null then
    leak_warn := coalesce((threshold_cfg->>'leak_warn_ppm')::numeric, leak_warn);
    leak_danger := coalesce((threshold_cfg->>'leak_danger_ppm')::numeric, leak_danger);
    low_gas := coalesce((threshold_cfg->>'low_gas_pct')::numeric, low_gas);
    danger_gas := coalesce((threshold_cfg->>'danger_gas_pct')::numeric, danger_gas);
  end if;

  if coalesce(new.leakage_ppm, 0) >= leak_danger then
    insert into public.alerts (cylinder_id, esp32_device_id, alert_type, message, severity)
    select new.cylinder_id, new.esp32_device_id, 'LEAK_DANGER', 'Dangerous leakage: ' || round(new.leakage_ppm)::text || ' ppm', 'critical'
    where not exists (
      select 1 from public.alerts a
      where a.cylinder_id is not distinct from new.cylinder_id
        and a.alert_type = 'LEAK_DANGER'
        and coalesce(a.is_resolved, false) = false
    );
  elsif coalesce(new.leakage_ppm, 0) >= leak_warn then
    insert into public.alerts (cylinder_id, esp32_device_id, alert_type, message, severity)
    select new.cylinder_id, new.esp32_device_id, 'LEAK_WARNING', 'Leakage warning: ' || round(new.leakage_ppm)::text || ' ppm', 'warning'
    where not exists (
      select 1 from public.alerts a
      where a.cylinder_id is not distinct from new.cylinder_id
        and a.alert_type = 'LEAK_WARNING'
        and coalesce(a.is_resolved, false) = false
    );
  end if;

  if coalesce(new.gas_level_pct, 100) <= danger_gas then
    insert into public.alerts (cylinder_id, esp32_device_id, alert_type, message, severity)
    select new.cylinder_id, new.esp32_device_id, 'LOW_GAS_DANGER', 'Gas critically low: ' || round(new.gas_level_pct, 1)::text || '%', 'critical'
    where not exists (
      select 1 from public.alerts a
      where a.cylinder_id is not distinct from new.cylinder_id
        and a.alert_type = 'LOW_GAS_DANGER'
        and coalesce(a.is_resolved, false) = false
    );
  elsif coalesce(new.gas_level_pct, 100) <= low_gas then
    insert into public.alerts (cylinder_id, esp32_device_id, alert_type, message, severity)
    select new.cylinder_id, new.esp32_device_id, 'LOW_GAS', 'Gas below threshold: ' || round(new.gas_level_pct, 1)::text || '%', 'warning'
    where not exists (
      select 1 from public.alerts a
      where a.cylinder_id is not distinct from new.cylinder_id
        and a.alert_type = 'LOW_GAS'
        and coalesce(a.is_resolved, false) = false
    );
  end if;

  return new;
end;
$$ language plpgsql;

create trigger trg_process_sensor_reading_from_device
before insert on public.sensor_readings
for each row
execute function public.process_sensor_reading_from_device();

-- Force Schema Cache reload
NOTIFY pgrst, 'reload schema';
