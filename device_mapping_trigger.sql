-- Map direct sensor_readings inserts to the linked cylinder using esp32_device_id/device_id.
create or replace function public.attach_cylinder_from_device_id()
returns trigger as $$
declare
  mapped_cylinder_id uuid;
begin
  if new.cylinder_id is not null then
    return new;
  end if;

  select d.cylinder_id
    into mapped_cylinder_id
  from public.iot_devices d
  where d.device_id = new.esp32_device_id
  limit 1;

  if mapped_cylinder_id is null then
    select c.id
      into mapped_cylinder_id
    from public.cylinders c
    where c.esp32_device_id = new.esp32_device_id
    limit 1;
  end if;

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
