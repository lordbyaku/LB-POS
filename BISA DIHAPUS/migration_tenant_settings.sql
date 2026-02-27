-- =============================================
-- MIGRATION: tenant_settings
-- Jalankan di Supabase SQL Editor
-- =============================================

-- Tabel konfigurasi per-tenant (key-value JSONB)
create table if not exists public.tenant_settings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id) on delete cascade,
  key         text not null,             -- e.g. 'wa_templates'
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  unique (tenant_id, key)
);

-- Trigger updated_at
create trigger trg_tenant_settings_updated_at
  before update on public.tenant_settings
  for each row execute procedure public.set_updated_at();

-- RLS: hanya user yang punya akses tenant yang bisa baca/tulis
alter table public.tenant_settings enable row level security;

create policy "tenant_settings_tenant_scoped" on public.tenant_settings
  for all
  using  (public.has_tenant_access(tenant_id))
  with check (public.has_tenant_access(tenant_id));

-- =============================================
-- DEFAULT TEMPLATE WA (opsional — untuk referensi)
-- Template menggunakan placeholder:
--   {{nama}}     → nama pelanggan
--   {{kode}}     → kode order
--   {{status}}   → label status (human-readable)
-- =============================================
-- Contoh insert default (ubah UUID tenant sesuai kebutuhan):
-- insert into public.tenant_settings (tenant_id, key, value) values
-- ('<TENANT_UUID>', 'wa_templates', '{
--   "pesanan_masuk":  "Halo *{{nama}}*,\n\nPesanan laundry Anda telah kami terima.\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n\nTerima kasih telah menggunakan layanan kami! 🧺",
--   "sedang_dicuci":  "Halo *{{nama}}*,\n\nPesanan laundry Anda sedang dalam proses pencucian.\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n\nTerima kasih! 🧺",
--   "selesai_dicuci": "Halo *{{nama}}*,\n\nPesanan laundry Anda sudah selesai dicuci dan siap diambil! 🎉\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n\nTerima kasih! 🧺",
--   "sudah_diambil":  "Halo *{{nama}}*,\n\nTerima kasih sudah mengambil laundry Anda. Sampai jumpa lagi! 👋\n\n📦 *Kode:* {{kode}}"
-- }')
-- on conflict (tenant_id, key) do nothing;
