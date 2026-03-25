create table if not exists floors (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text,
  created_at timestamptz default now()
);

create table if not exists wards (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  code text,
  floor_id uuid references floors(id) on delete set null,
  created_at timestamptz default now()
);

create table if not exists workspace_mappings (
  id uuid default gen_random_uuid() primary key,
  workspace_key text unique not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  updated_by text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table cylinders add column if not exists floor_name text;
alter table cylinders add column if not exists mapped_device_id uuid;
alter table cylinders add column if not exists mapped_device_label text;
alter table cylinders alter column device_id drop not null;
