-- ========================================================
-- MIGRATION: Order Items & Multi-Service Support
-- ========================================================

-- 1. Tabel untuk detail item pesanan (Cart)
create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  order_id    uuid not null references public.orders(id) on delete cascade,
  service_id  uuid references public.services(id) on delete set null,
  nama_item   text not null, -- Nama layanan saat dipesan
  harga_satuan bigint not null,
  jumlah      numeric(10,2) not null, -- kg atau pcs
  satuan      text,
  subtotal    bigint not null,
  created_at  timestamptz default now()
);

alter table public.order_items enable row level security;
create policy "order_items_access" on public.order_items
  for all using (public.has_tenant_access(tenant_id));

-- 2. Memperbaiki enum role (LB POS Branding)
-- Tidak ada perubahan schema untuk branding, hanya perubahan teks di UI.
