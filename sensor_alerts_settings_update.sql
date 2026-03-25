-- Persist alert thresholds in DB so Settings and triggers use the same source of truth.
create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

insert into public.app_settings (setting_key, setting_value)
values (
  'alert_thresholds',
  jsonb_build_object(
    'low_gas_pct', 20,
    'danger_gas_pct', 10,
    'leak_warn_ppm', 120,
    'leak_danger_ppm', 200
  )
)
on conflict (setting_key) do nothing;

-- Cylinder metadata used for live gas calculations.
alter table public.cylinders
  add column if not exists empty_cylinder_weight_kg numeric(10,2) default 0;

-- Backfill sensor rows using the mapped device id on cylinders.
update public.sensor_readings sr
set cylinder_id = c.id
from public.cylinders c
where sr.cylinder_id is null
  and sr.esp32_device_id is not null
  and c.esp32_device_id = sr.esp32_device_id;

-- Compute gas weight / gas % from current total weight and raise alerts from sensor data.
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
        and a.esp32_device_id = new.esp32_device_id
        and a.alert_type = 'LEAK_DANGER'
        and coalesce(a.is_resolved, false) = false
    );
  elsif coalesce(new.leakage_ppm, 0) >= leak_warn then
    insert into public.alerts (cylinder_id, esp32_device_id, alert_type, message, severity)
    select new.cylinder_id, new.esp32_device_id, 'LEAK_WARNING', 'Leakage warning: ' || round(new.leakage_ppm)::text || ' ppm', 'warning'
    where not exists (
      select 1 from public.alerts a
      where a.cylinder_id is not distinct from new.cylinder_id
        and a.esp32_device_id = new.esp32_device_id
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
        and a.esp32_device_id = new.esp32_device_id
        and a.alert_type = 'LOW_GAS_DANGER'
        and coalesce(a.is_resolved, false) = false
    );
  elsif coalesce(new.gas_level_pct, 100) <= low_gas then
    insert into public.alerts (cylinder_id, esp32_device_id, alert_type, message, severity)
    select new.cylinder_id, new.esp32_device_id, 'LOW_GAS', 'Gas below threshold: ' || round(new.gas_level_pct, 1)::text || '%', 'warning'
    where not exists (
      select 1 from public.alerts a
      where a.cylinder_id is not distinct from new.cylinder_id
        and a.esp32_device_id = new.esp32_device_id
        and a.alert_type = 'LOW_GAS'
        and coalesce(a.is_resolved, false) = false
    );
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_process_sensor_reading_from_device on public.sensor_readings;
create trigger trg_process_sensor_reading_from_device
before insert on public.sensor_readings
for each row
execute function public.process_sensor_reading_from_device();
