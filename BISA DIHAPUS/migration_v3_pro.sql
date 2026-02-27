-- ========================================================
-- MIGRATION V3 PRO (Membership, Inventory, Promo, Audit)
-- ========================================================

-- 1. POIN & LOYALITAS
alter table public.customers 
add column if not exists poin_balance bigint default 0;

-- 2. PEMBAYARAN PARSIAL (DP)
alter table public.orders
add column if not exists uang_muka_idr bigint default 0;
-- sisa_idr bisa dihitung dari total_idr - dibayar_idr


-- 3. MANAJEMEN STOK (INVENTARIS)
create table if not exists public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  nama_barang text not null,
  satuan      text not null, -- kg, liter, pcs, bks
  stok        numeric(12,2) default 0,
  stok_minimum numeric(12,2) default 0,
  updated_at  timestamptz default now()
);

create table if not exists public.inventory_logs (
  id          uuid primary key default gen_random_uuid(),
  item_id     uuid not null references public.inventory_items(id) on delete cascade,
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  tipe        text not null, -- 'masuk' atau 'keluar'
  jumlah      numeric(12,2) not null,
  keterangan  text,
  created_at  timestamptz default now(),
  created_by  uuid references public.profiles(id)
);

alter table public.inventory_items enable row level security;
alter table public.inventory_logs enable row level security;

create policy "inventory_items_access" on public.inventory_items
  for all using (public.has_tenant_access(tenant_id));
create policy "inventory_logs_access" on public.inventory_logs
  for all using (public.has_tenant_access(tenant_id));


-- 6. VOUCHER & KODE PROMO
create table if not exists public.vouchers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  kode_voucher  text not null,
  tipe_potongan text not null, -- 'persen' atau 'nominal'
  nilai         bigint not null,
  min_order     bigint default 0,
  kuota         int default 999,
  tgl_kadaluarsa date,
  is_active     boolean default true,
  created_at    timestamptz default now(),
  unique(tenant_id, kode_voucher)
);

alter table public.vouchers enable row level security;
create policy "vouchers_access" on public.vouchers
  for all using (public.has_tenant_access(tenant_id));


-- 7. AUDIT LOG (KEAMANAN)
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  user_id     uuid references public.profiles(id),
  aksi        text not null, -- e.g: 'DELETE_ORDER', 'CHANGE_PRICE'
  entitas     text,          -- e.g: 'orders', 'services'
  entitas_id  uuid,
  data_lama   jsonb,
  data_baru   jsonb,
  ip_address  text,
  created_at  timestamptz default now()
);

alter table public.audit_logs enable row level security;
create policy "audit_logs_access" on public.audit_logs
  for all using (public.has_tenant_access(tenant_id));
