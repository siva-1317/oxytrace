-- Suppliers / Dealers registry
create table suppliers (
  id uuid default gen_random_uuid() primary key,
  supplier_name text not null,
  contact_person text,
  phone text,
  email text,
  address text,
  city text,
  gstin text,
  supplier_type text default 'dealer', -- 'manufacturer' | 'dealer' | 'distributor'
  is_active boolean default true,
  rating float default 0,
  notes text,
  created_at timestamptz default now()
);

-- Purchase orders / incoming loads
create table stock_orders (
  id uuid default gen_random_uuid() primary key,
  order_number text unique not null,
  supplier_id uuid references suppliers(id) on delete set null,
  order_date date not null,
  expected_delivery_date date,
  actual_delivery_date date,
  status text default 'pending', -- 'pending' | 'in_transit' | 'delivered' | 'cancelled' | 'partial'
  total_cylinders_ordered int default 0,
  total_cylinders_received int default 0,
  total_amount numeric(12,2) default 0,
  paid_amount numeric(12,2) default 0,
  payment_status text default 'unpaid', -- 'unpaid' | 'partial' | 'paid'
  payment_method text, -- 'cash' | 'bank_transfer' | 'cheque' | 'upi'
  invoice_number text,
  invoice_url text,
  notes text,
  received_by text,
  created_at timestamptz default now()
);

-- Individual cylinder items inside each order
create table stock_order_items (
  id bigint generated always as identity primary key,
  order_id uuid references stock_orders(id) on delete cascade,
  cylinder_size text not null,        -- 'B-type 10L' | 'D-type 46L' | 'Jumbo 47L' etc.
  gas_type text default 'oxygen',     -- 'oxygen' | 'medical_air' | 'nitrous_oxide'
  quantity_ordered int default 0,
  quantity_received int default 0,
  unit_price numeric(10,2) default 0,
  total_price numeric(10,2) default 0,
  pressure_bar float,                 -- pressure of incoming cylinders in bar
  batch_number text,
  expiry_date date,
  condition text default 'good'       -- 'good' | 'damaged' | 'returned'
);

-- Stock inventory snapshot (current on-hand stock)
create table stock_inventory (
  id uuid default gen_random_uuid() primary key,
  cylinder_size text not null,
  gas_type text default 'oxygen',
  quantity_full int default 0,        -- full cylinders available
  quantity_empty int default 0,       -- empty cylinders waiting for return/refill
  quantity_in_use int default 0,      -- currently deployed to wards
  quantity_damaged int default 0,
  reorder_level int default 5,        -- alert when stock falls below this
  unit_price numeric(10,2),
  last_updated timestamptz default now(),
  unique(cylinder_size, gas_type)
);

-- Stock transactions log (every movement)
create table stock_transactions (
  id bigint generated always as identity primary key,
  transaction_type text not null,   -- 'received' | 'issued' | 'returned' | 'damaged' | 'adjusted'
  cylinder_size text not null,
  gas_type text default 'oxygen',
  quantity int not null,
  reference_id text,               -- order number or ward name
  reference_type text,             -- 'order' | 'ward_issue' | 'return' | 'manual'
  ward text,
  performed_by text,
  notes text,
  created_at timestamptz default now()
);
