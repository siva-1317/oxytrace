-- Remove the legacy iot_devices registry and keep telemetry standalone.

alter table if exists public.iot_telemetry
  drop constraint if exists iot_telemetry_device_id_fkey;

drop trigger if exists trg_update_device_last_seen on public.iot_telemetry;
drop function if exists public.update_device_last_seen();

drop policy if exists "Allow public read access to iot_devices" on public.iot_devices;
drop policy if exists "Allow anonymous updates to iot_devices" on public.iot_devices;
drop policy if exists "Allow anonymous inserts to iot_devices" on public.iot_devices;

drop table if exists public.iot_devices;
