create table if not exists public.cylinder_types (
  id uuid primary key default gen_random_uuid(),
  type_name text not null unique,
  full_weight numeric(10,2) not null,
  empty_weight numeric(10,2) not null,
  created_at timestamptz not null default now()
);

alter table public.cylinders
  add column if not exists type_id uuid references public.cylinder_types(id) on delete set null;

create table if not exists public.refill_logs (
  id uuid primary key default gen_random_uuid(),
  cylinder_id uuid not null references public.cylinders(id) on delete cascade,
  type_id uuid not null references public.cylinder_types(id) on delete restrict,
  refill_time timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create or replace view public.cylinder_live_view as
with latest_telemetry as (
  select distinct on (device_id)
    device_id,
    current_weight,
    leak_detect,
    valve_position,
    created_at
  from public.iot_telemetry
  order by device_id, created_at desc
)
select
  c.id,
  c.cylinder_num,
  c.device_id,
  c.ward,
  c.floor,
  c.type_id,
  ct.type_name,
  ct.full_weight,
  ct.empty_weight,
  lt.current_weight,
  greatest(0, lt.current_weight - ct.empty_weight) as gas_weight,
  case
    when lt.current_weight is null or ct.full_weight is null or ct.empty_weight is null or ct.full_weight <= ct.empty_weight then null
    else least(100, greatest(0, ((lt.current_weight - ct.empty_weight) / nullif(ct.full_weight - ct.empty_weight, 0)) * 100))
  end as gas_percent,
  lt.leak_detect,
  lt.valve_position,
  lt.created_at as timestamp
from public.cylinders c
left join public.cylinder_types ct on ct.id = c.type_id
left join latest_telemetry lt on lt.device_id = c.device_id;
