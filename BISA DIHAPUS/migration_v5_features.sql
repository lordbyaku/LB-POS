-- ========================================================
-- MIGRATION: Feature Management & Voucher Toggle
-- ========================================================

-- Tambah setting flag untuk fitur voucher
-- Secara default AKTIF (true). Admin bisa menonaktifkan per tenant.
insert into public.tenant_settings (tenant_id, key, value)
select id, 'feature_voucher', 'true'::jsonb from public.tenants
on conflict (tenant_id, key) do nothing;
