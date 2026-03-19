-- IoT Devices Registry
create table iot_devices (
  id uuid default gen_random_uuid() primary key,
  device_id text unique not null,        -- MAC Address or assigned unique identifier
  assigned_ward text,                    -- Ward where this cylinder/device is deployed
  cylinder_size text,
  gas_type text default 'oxygen',
  status text default 'active',          -- 'active' | 'offline' | 'maintenance'
  battery_level numeric(5,2) default 100.0,
  last_seen timestamptz,
  notes text,
  created_at timestamptz default now()
);

-- IoT Telemetry Data (Time-series)
create table iot_telemetry (
  id bigint generated always as identity primary key,
  device_id text references iot_devices(device_id) on delete cascade,
  pressure_bar numeric(10,2) not null,   -- Real-time pressure reading
  battery_level numeric(5,2),            -- Real-time battery reading
  fill_percentage numeric(5,2),          -- Calculated fill percentage based on max pressure of cylinder size
  recorded_at timestamptz default now()
);

-- Supabase RLS Policies (Assuming mostly anon writes from ESP32 or authenticated reads from dashboard)
alter table iot_devices enable row level security;
alter table iot_telemetry enable row level security;

-- Allow public read access (Modify if you require authentication to view)
create policy "Allow public read access to iot_devices" on iot_devices for select using (true);
create policy "Allow public read access to iot_telemetry" on iot_telemetry for select using (true);

-- Allow ESP32 to insert telemetry data anonymously
create policy "Allow anonymous inserts to iot_telemetry" on iot_telemetry for insert with check (true);
create policy "Allow anonymous updates to iot_devices" on iot_devices for update using (true);
create policy "Allow anonymous inserts to iot_devices" on iot_devices for insert with check (true);

-- Create a function to automatically update the 'last_seen' and 'battery_level' in iot_devices when new telemetry arrives
create or replace function update_device_last_seen()
returns trigger as $$
begin
  update iot_devices
  set last_seen = NEW.recorded_at,
      battery_level = COALESCE(NEW.battery_level, battery_level)
  where device_id = NEW.device_id;
  return NEW;
end;
$$ language plpgsql;

create trigger trg_update_device_last_seen
after insert on iot_telemetry
for each row
execute function update_device_last_seen();
