import { supabase } from './supabase';

const WA_API_URL = import.meta.env.VITE_WA_API_URL;
const WA_API_KEY = import.meta.env.VITE_WA_API_KEY;
const OWNER_EMAIL = import.meta.env.VITE_OWNER_EMAIL;

// ──────────────────────────────────────────────
// Default templates (fallback jika DB kosong)
// ──────────────────────────────────────────────
const DEFAULT_TEMPLATES = {
    pesanan_masuk:
        'Halo *{{nama}}*,\n\nPesanan laundry Anda telah kami terima! 📥\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n\nTerima kasih telah menggunakan layanan kami! 🧺',
    sedang_dicuci:
        'Halo *{{nama}}*,\n\nPesanan laundry Anda sedang dalam proses pencucian. 🫧\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n\nTerima kasih! 🧺',
    selesai_dicuci:
        'Halo *{{nama}}*,\n\nPesanan laundry Anda sudah selesai dan siap diambil! 🎉\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n\nTerima kasih! 🧺',
    sudah_diambil:
        'Halo *{{nama}}*,\n\nTerima kasih sudah mengambil laundry Anda. Sampai jumpa lagi! 👋\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}',
};

const STATUS_LABEL = {
    pesanan_masuk: 'Pesanan Masuk',
    sedang_dicuci: 'Sedang Dicuci ✅',
    selesai_dicuci: 'Selesai Dicuci 🎉',
    sudah_diambil: 'Sudah Diambil ✔️',
};

/**
 * Format nomor HP Indonesia ke format internasional (628xxx)
 * @param {string} phone
 * @returns {string}
 */
function formatPhoneID(phone) {
    if (!phone) return '';
    let p = phone.replace(/\D/g, '');
    if (p.startsWith('0')) p = '62' + p.slice(1);
    if (!p.startsWith('62')) p = '62' + p;
    return p;
}

/**
 * Ambil template WA dari tenant_settings DB.
 * Return object { pesanan_masuk, sedang_dicuci, selesai_dicuci, sudah_diambil }.
 * Fallback ke DEFAULT_TEMPLATES jika tidak ditemukan.
 * @param {string} tenantId
 * @returns {Promise<object>}
 */
export async function getWaTemplates(tenantId) {
    if (!tenantId) return { ...DEFAULT_TEMPLATES };
    try {
        const { data, error } = await supabase
            .from('tenant_settings')
            .select('value')
            .eq('tenant_id', tenantId)
            .eq('key', 'wa_templates')
            .maybeSingle();

        if (!error && data?.value) {
            return { ...DEFAULT_TEMPLATES, ...data.value };
        }
    } catch (err) {
        console.warn('Failed to fetch waTemplates:', err);
    }
    return { ...DEFAULT_TEMPLATES };
}

/**
 * Render template — ganti placeholder dengan nilai nyata.
 * @param {string} template
 * @param {{ nama: string, kode: string, status: string, status_bayar: string, nominal: string }} vars
 * @returns {string}
 */
function renderTemplate(template, vars) {
    return template
        .replace(/\{\{nama\}\}/g, vars.nama || 'Pelanggan')
        .replace(/\{\{kode\}\}/g, vars.kode || '-')
        .replace(/\{\{status\}\}/g, vars.status || '-')
        .replace(/\{\{status_bayar\}\}/g, vars.status_bayar || '-')
        .replace(/\{\{nominal\}\}/g, vars.nominal || '-');
}

/**
 * Kirim notifikasi WhatsApp ke pelanggan ketika status order berubah.
 * Template diambil dari DB tenant (atau fallback default).
 *
 * @param {object} order - { kode, customerName, customerPhone, status, tenantId, statusBayar, totalIdr }
 * @returns {Promise<boolean>} true jika sukses
 */
export async function sendWaNotification(order) {
    if (!WA_API_URL || !WA_API_KEY || !OWNER_EMAIL) {
        console.warn('Konfigurasi WA belum diisi di .env');
        return false;
    }

    if (!order.customerPhone) {
        console.warn('No. telepon pelanggan tidak tersedia, notifikasi WA tidak dikirim.');
        return false;
    }

    // Cek apakah fitur WA diaktifkan oleh admin
    try {
        const { data: waSet } = await supabase
            .from('tenant_settings')
            .select('value')
            .eq('tenant_id', order.tenantId)
            .eq('key', 'feature_wa')
            .maybeSingle();

        if (waSet && waSet.value === false) {
            console.log('Fitur WA dinonaktifkan oleh Admin, mengabaikan pengiriman.');
            return false;
        }
    } catch (e) {
        console.warn('Gagal memuat pengaturan WA:', e.message);
    }

    // Ambil template dari DB (atau default)
    const templates = await getWaTemplates(order.tenantId);
    const rawTemplate = templates[order.status] || DEFAULT_TEMPLATES[order.status] || DEFAULT_TEMPLATES.pesanan_masuk;

    const statusText = STATUS_LABEL[order.status] || order.status;
    const nominalText = order.totalIdr != null
        ? 'Rp ' + Number(order.totalIdr).toLocaleString('id-ID')
        : '-';
    const statusBayarText = order.statusBayar === 'lunas' ? '✅ Lunas'
        : order.statusBayar === 'belum_bayar' ? '⏳ Belum Bayar'
            : order.statusBayar || '-';

    const message = renderTemplate(rawTemplate, {
        nama: order.customerName || 'Pelanggan',
        kode: order.kode,
        status: statusText,
        status_bayar: statusBayarText,
        nominal: nominalText,
    });

    const formattedPhone = formatPhoneID(order.customerPhone);

    try {
        const res = await fetch(WA_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': WA_API_KEY,
            },
            body: JSON.stringify({
                phone: formattedPhone,
                message,
                owner_email: OWNER_EMAIL,
            }),
        });

        if (!res.ok) {
            const errText = await res.text();
            console.error('WA API error:', res.status, errText);
        }
        return res.ok;
    } catch (err) {
        console.error('Gagal kirim WA:', err);
        return false;
    }
}
