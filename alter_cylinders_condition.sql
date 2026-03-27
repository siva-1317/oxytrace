-- Run this in the Supabase SQL Editor
alter table cylinders add column if not exists condition text default 'good';
