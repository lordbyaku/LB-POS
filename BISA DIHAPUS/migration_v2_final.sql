-- ========================================================
-- MIGRATION V2 FINAL (UUID VERSION - FIXED ENUM)
-- Jalankan skrip ini di Supabase SQL Editor
-- ========================================================

-- 1. Tabel Konfigurasi Tenant (WA Templates, dsb)
create table if not exists public.tenant_settings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  unique (tenant_id, key)
);

-- Trigger updated_at tenant_settings
do $$ begin
  create trigger trg_tenant_settings_updated_at
    before update on public.tenant_settings
    for each row execute procedure public.set_updated_at();
exception when others then null; end $$;

-- RLS tenant_settings
alter table public.tenant_settings enable row level security;
do $$ begin
  create policy "tenant_settings_tenant_scoped" on public.tenant_settings
    for all using (public.has_tenant_access(tenant_id))
    with check (public.has_tenant_access(tenant_id));
exception when others then null; end $$;


-- 2. Update Profil Toko di Tabel Tenants
alter table public.tenants 
add column if not exists alamat_lengkap text,
add column if not exists logo_url text,
add column if not exists footer_struk text default 'Terima kasih atas kepercayaan Anda!';


-- 3. Update Status Pembayaran di Tabel Orders
-- Menggunakan nama enum unik 'order_pay_status' agar tidak bentrok dengan payment_status sistem
do $$ begin
  create type public.order_pay_status as enum ('belum_lunas', 'lunas');
exception when duplicate_object then null; end $$;

alter table public.orders
add column if not exists status_pembayaran public.order_pay_status not null default 'belum_lunas',
add column if not exists metode_pembayaran text default 'tunai',
add column if not exists dibayar_idr bigint not null default 0;


-- 4. Tabel Pengeluaran (Expense Tracker)
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kategori    text not null,
  jumlah_idr  bigint not null,
  keterangan  text,
  tanggal     date not null default current_date,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);

-- RLS expenses
alter table public.expenses enable row level security;
do $$ begin
  create policy "expenses_tenant_scoped" on public.expenses
    for all using (public.has_tenant_access(tenant_id))
    with check (public.has_tenant_access(tenant_id));
exception when others then null; end $$;
