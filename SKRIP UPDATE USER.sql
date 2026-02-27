/**
 * SKRIP PENGELOLAAN USER (LBPOS)
 * Jalankan skrip ini di SQL Editor Supabase.
 * File ini berisi skrip otomatis dan perintah manual untuk mengelola akses.
 */

-- =============================================================
-- A. SKRIP AKTIVASI USER OTOMATIS (Sangat Disarankan)
-- =============================================================
/*
CARA PAKAI:
1. Klik "+ New Query" di SQL Editor Supabase.
2. Copy seluruh blok DO $$ sampai END $$; di bawah ini.
3. Ganti nilai di bagian DECLARE sesuai user yang baru Anda buat.
4. Klik RUN.
*/

DO $$
DECLARE
    -- 1. PASTE UID (User ID) dari menu Authentication di sini
    v_user_id UUID := 'MASUKKAN_UID_DI_SINI'; 
    
    -- 2. ISI DATA PROFIL
    v_nama TEXT := 'Nama Lengkap User';
    v_telepon TEXT := '08xxx';
    
    -- 3. PILIH ROLE: 'admin', 'owner', 'kasir', atau 'operator'
    v_role public.app_role := 'owner'; 
    
    -- 4. PASTE ID TOKO (Ambil dari tabel public.tenants)
    -- Kosongkan (NULL) jika hanya ingin buat Admin Global tanpa toko
    v_tenant_id UUID := 'MASUKKAN_ID_TENANT_DI_SINI'; 
BEGIN

    -- Masukkan ke tabel Profiles
    INSERT INTO public.profiles (id, nama, no_telepon, global_role)
    VALUES (v_user_id, v_nama, v_telepon, v_role)
    ON CONFLICT (id) DO UPDATE 
    SET nama = EXCLUDED.nama, 
        no_telepon = EXCLUDED.no_telepon, 
        global_role = EXCLUDED.global_role;

    -- Hubungkan ke Toko jika ID Tenant diisi
    IF v_tenant_id IS NOT NULL THEN
        INSERT INTO public.user_tenants (user_id, tenant_id, role, is_active)
        VALUES (v_user_id, v_tenant_id, v_role, true)
        ON CONFLICT (user_id, tenant_id) DO UPDATE 
        SET role = EXCLUDED.role, is_active = true;
        
        RAISE NOTICE 'Berhasil! User % Aktif sebagai % di Toko %', v_nama, v_role, v_tenant_id;
    ELSE
        RAISE NOTICE 'Berhasil! User % Aktif sebagai % (Tanpa Toko)', v_nama, v_role;
    END IF;

END $$;


-- =============================================================
-- B. PERINTAH MANUAL (Jika dibutuhkan)
-- =============================================================

-- Cek Daftar Semua User & Role & Nama Tokonya
-- SELECT 
--     p.id as user_id, 
--     u.email, 
--     p.nama, 
--     p.global_role, 
--     t.nama as nama_toko,
--     ut.role as role_di_toko
-- FROM public.profiles p
-- JOIN auth.users u ON p.id = u.id
-- LEFT JOIN public.user_tenants ut ON p.id = ut.user_id
-- LEFT JOIN public.tenants t ON ut.tenant_id = t.id;

-- Cari ID Toko (Tenant)
-- SELECT id, kode, nama FROM public.tenants;

-- Cari ID User berdasarkan Email
-- SELECT id, email FROM auth.users WHERE email = 'na_grow@yahoo.com';
