import { supabase } from './supabase';

/**
 * Ambil status lisensi efektif untuk tenant saat ini.
 * @param {string} tenantId
 * @returns {Promise<'aktif'|'masa_tenggang'|'kedaluwarsa'|null>}
 */
export async function getLicenseStatus(tenantId) {
    if (!tenantId) return null;

    try {
        const { data, error } = await supabase
            .from('licenses')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('is_active', true)
            .order('end_at', { ascending: false })
            .limit(1);

        if (error || !data || data.length === 0) return 'kedaluwarsa';

        const record = data[0];
        const now = new Date();
        const endAt = new Date(record.end_at);
        const graceEnd = new Date(endAt.getTime() + record.grace_days * 24 * 60 * 60 * 1000);

        if (now <= endAt) return 'aktif';
        if (now <= graceEnd) return 'masa_tenggang';
        return 'kedaluwarsa';
    } catch (e) {
        console.error('getLicenseStatus Error:', e);
        return 'kedaluwarsa';
    }
}

/**
 * Ambil info lisensi lengkap
 */
export async function getLicenseInfo(tenantId) {
    if (!tenantId) return null;

    const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
        .order('end_at', { ascending: false })
        .limit(1);

    if (error || !data || data.length === 0) return null;
    return data[0];
}

/** Format status lisensi ke label Indonesia */
export function licenseStatusLabel(status) {
    return {
        aktif: 'AKTIF',
        masa_tenggang: 'MASA TENGGANG',
        kedaluwarsa: 'KEDALUWARSA',
    }[status] || 'Tidak Diketahui';
}
