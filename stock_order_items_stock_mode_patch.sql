alter table public.stock_order_items
add column if not exists stock_mode text default 'replace_cylinder';
