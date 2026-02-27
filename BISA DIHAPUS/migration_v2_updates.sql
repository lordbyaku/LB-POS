-- =============================================
-- MIGRATION: Fitur Toko, Pembayaran & Pengeluaran
-- =============================================

-- 1. Tambah kolom profil toko di tabel tenants
alter table public.tenants 
add column if not exists alamat_lengkap text,
add column if not exists logo_url text,
add column if not exists footer_struk text default 'Terima kasih atas kepercayaan Anda!';

-- 2. Tambah kolom pembayaran di tabel orders
create type public.payment_status as enum ('belum_lunas', 'lunas');

alter table public.orders
add column if not exists status_pembayaran public.payment_status not null default 'belum_lunas',
add column if not exists metode_pembayaran text default 'tunai', -- tunai, transfer, qris
add column if not exists dibayar_idr bigint not null default 0;

-- 3. Tabel Pengeluaran (Expense Tracker)
create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  kategori    text not null,             -- Listrik, Sabun, Gaji, Sewa, Lainnya
  jumlah_idr  bigint not null,
  keterangan  text,
  tanggal     date not null default current_date,
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id)
);

-- RLS untuk expenses
alter table public.expenses enable row level security;

create policy "expenses_tenant_scoped" on public.expenses
  for all using (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));

-- Trigger updated_at (tenants)
create trigger trg_tenants_updated_at_profile
  before update on public.tenants
  for each row execute procedure public.set_updated_at();
