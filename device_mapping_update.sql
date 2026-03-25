-- 1. Backfill existing sensor readings from the mapped cylinder device id.
update public.sensor_readings sr
set cylinder_id = c.id
from public.cylinders c
where sr.cylinder_id is null
  and sr.esp32_device_id is not null
  and c.esp32_device_id = sr.esp32_device_id;

-- 2. Keep future direct ESP32 inserts mapped automatically using cylinders.esp32_device_id.
create or replace function public.attach_cylinder_from_device_id()
returns trigger as $$
declare
  mapped_cylinder_id uuid;
begin
  if new.cylinder_id is not null then
    return new;
  end if;

  select c.id
    into mapped_cylinder_id
  from public.cylinders c
  where c.esp32_device_id = new.esp32_device_id
  limit 1;

  if mapped_cylinder_id is not null then
    new.cylinder_id := mapped_cylinder_id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_attach_cylinder_from_device_id on public.sensor_readings;
create trigger trg_attach_cylinder_from_device_id
before insert on public.sensor_readings
for each row
execute function public.attach_cylinder_from_device_id();

-- 3. Optional cleanup: old manual device records are no longer used by the app.
-- delete from public.iot_devices;
