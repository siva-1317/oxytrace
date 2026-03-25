-- IoT Telemetry Data (Time-series)
create table iot_telemetry (
  id bigint generated always as identity primary key,
  device_id text not null,               -- Device key sent by the ESP32 and matched to cylinders.esp32_device_id
  current_weight numeric(10,2) not null,
  leak_detect boolean default false,
  valve_position boolean default false,
  created_at timestamptz default now()
);

-- Supabase RLS Policies (Assuming mostly anon writes from ESP32 or authenticated reads from dashboard)
alter table iot_telemetry enable row level security;

-- Allow public read access (Modify if you require authentication to view)
create policy "Allow public read access to iot_telemetry" on iot_telemetry for select using (true);

-- Allow ESP32 to insert telemetry data anonymously
create policy "Allow anonymous inserts to iot_telemetry" on iot_telemetry for insert with check (true);
