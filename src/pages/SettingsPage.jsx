import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import LicenseBanner from '../components/LicenseBanner';

const WA_VARS = [
    { tag: '{{nama}}', desc: 'Nama pelanggan' },
    { tag: '{{kode}}', desc: 'Kode pesanan' },
    { tag: '{{status}}', desc: 'Status pesanan' },
    { tag: '{{status_bayar}}', desc: 'Status pembayaran' },
    { tag: '{{nominal}}', desc: 'Total tagihan' },
];

const STATUS_META = [
    { key: 'pesanan_masuk', label: '📥 Pesanan Masuk', color: '#6366f1' },
    { key: 'sedang_dicuci', label: '🫧 Sedang Dicuci', color: '#3b82f6' },
    { key: 'selesai_dicuci', label: '✅ Selesai Dicuci', color: '#10b981' },
    { key: 'sudah_diambil', label: '🏠 Sudah Diambil', color: '#6b7280' },
];

const STATUS_LABEL_MAP = {
    pesanan_masuk: 'Pesanan Masuk',
    sedang_dicuci: 'Sedang Dicuci',
    selesai_dicuci: 'Selesai Dicuci',
    sudah_diambil: 'Sudah Diambil',
};

const DEFAULT_TEMPLATES = {
    pesanan_masuk: 'Halo *{{nama}}*,\n\nPesanan laundry Anda telah kami terima! 📥\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n💳 *Pembayaran:* {{status_bayar}}\n💰 *Total:* {{nominal}}\n\nTerima kasih!',
    sedang_dicuci: 'Halo *{{nama}}*,\n\nPesanan laundry Anda sedang dalam proses pencucian. 🫧\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}',
    selesai_dicuci: 'Halo *{{nama}}*,\n\nPesanan laundry Anda sudah selesai dan siap diambil! 🎉\n\n📦 *Kode:* {{kode}}\n🔄 *Status:* {{status}}\n💳 *Pembayaran:* {{status_bayar}}\n💰 *Total:* {{nominal}}',
    sudah_diambil: 'Halo *{{nama}}*,\n\nTerima kasih sudah mengambil laundry Anda. Sampai jumpa lagi! 👋\n\n📦 *Kode:* {{kode}}',
};

const PREVIEW_DATA = {
    nama: 'Budi Santoso',
    kode: 'LND-20260226001',
    status: 'Selesai Dicuci',
    status_bayar: 'Belum Lunas',
    nominal: 'Rp 35.000',
};

function renderPreview(template, status) {
    const data = { ...PREVIEW_DATA, status: STATUS_LABEL_MAP[status] || status };
    return template
        .replace(/{{nama}}/g, data.nama)
        .replace(/{{kode}}/g, data.kode)
        .replace(/{{status}}/g, data.status)
        .replace(/{{status_bayar}}/g, data.status_bayar)
        .replace(/{{nominal}}/g, data.nominal);
}

export default function SettingsPage({ tenantId, licenseStatus }) {
    const [templates, setTemplates] = useState({ ...DEFAULT_TEMPLATES });
    const [tenantInfo, setTenantInfo] = useState({ nama: '', alamat: '', no_telepon: '', footer_struk: '' });
    const [activeTab, setActiveTab] = useState('profil');
    const [activeWaTab, setActiveWaTab] = useState('pesanan_masuk');
    const [showPreview, setShowPreview] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');
    const [dirty, setDirty] = useState(false);
    const [copiedTag, setCopiedTag] = useState('');

    function copyVar(tag) {
        navigator.clipboard.writeText(tag).catch(() => { });
        setCopiedTag(tag);
        setTimeout(() => setCopiedTag(''), 1800);
    }

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

    const loadSettings = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        const { data: waData } = await supabase.from('tenant_settings').select('value')
            .eq('tenant_id', tenantId).eq('key', 'wa_templates').maybeSingle();
        if (waData?.value) setTemplates({ ...DEFAULT_TEMPLATES, ...waData.value });

        const { data: tData } = await supabase.from('tenants').select('nama, no_telepon, alamat, footer_struk')
            .eq('id', tenantId).maybeSingle();
        if (tData) setTenantInfo(tData);

        setDirty(false);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadSettings();
    }, [loadSettings]);

    async function handleSave() {
        if (licenseStatus === 'kedaluwarsa') { showToast('❌ Lisensi habis.'); return; }
        setSaving(true);
        try {
            if (activeTab === 'wa_templates') {
                await supabase.from('tenant_settings').upsert({ tenant_id: tenantId, key: 'wa_templates', value: templates }, { onConflict: 'tenant_id,key' });
            } else {
                await supabase.from('tenants').update(tenantInfo).eq('id', tenantId);
            }
            showToast('✅ Pengaturan disimpan!');
            setDirty(false);
        } catch (err) {
            showToast('❌ Gagal: ' + err.message);
        }
        setSaving(false);
    }

    const activeTemplate = templates[activeWaTab] || '';
    const previewText = renderPreview(activeTemplate, activeWaTab);

    return (
        <div className="page">
            <LicenseBanner status={licenseStatus} />
            <div className="page-header">
                <div>
                    <h2>Pengaturan</h2>
                    <p className="text-muted">Kelola toko & notifikasi</p>
                </div>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || !dirty || licenseStatus === 'kedaluwarsa'}>
                    {saving ? '⏳...' : '💾 Simpan'}
                </button>
            </div>

            <div className="settings-main-tabs">
                <button className={`settings-main-tab ${activeTab === 'profil' ? 'active' : ''}`} onClick={() => setActiveTab('profil')}>🏪 Toko</button>
                <button className={`settings-main-tab ${activeTab === 'wa_templates' ? 'active' : ''}`} onClick={() => setActiveTab('wa_templates')}>💬 WA</button>
            </div>

            {loading ? (
                <div className="loading-state"><div className="spinner" /></div>
            ) : activeTab === 'profil' ? (
                <div className="form-card">
                    <div className="form-group">
                        <label>Nama Toko</label>
                        <input type="text" value={tenantInfo.nama} onChange={e => { setTenantInfo({ ...tenantInfo, nama: e.target.value }); setDirty(true); }} />
                    </div>
                    <div className="form-group">
                        <label>No. HP Toko</label>
                        <input type="text" value={tenantInfo.no_telepon || ''} onChange={e => { setTenantInfo({ ...tenantInfo, no_telepon: e.target.value }); setDirty(true); }} />
                    </div>
                    <div className="form-group">
                        <label>Alamat Toko</label>
                        <textarea rows="2" value={tenantInfo.alamat || ''} onChange={e => { setTenantInfo({ ...tenantInfo, alamat: e.target.value }); setDirty(true); }} />
                    </div>
                    <div className="form-group">
                        <label>Pesan Footer Struk</label>
                        <input type="text" value={tenantInfo.footer_struk || ''} onChange={e => { setTenantInfo({ ...tenantInfo, footer_struk: e.target.value }); setDirty(true); }} />
                    </div>
                </div>
            ) : (
                <>
                    <div className="settings-status-tabs" style={{ marginBottom: 10 }}>
                        {STATUS_META.map(s => (
                            <button key={s.key} className={`settings-status-tab ${activeWaTab === s.key ? 'active' : ''}`} onClick={() => { setActiveWaTab(s.key); setShowPreview(false); }}>{s.label}</button>
                        ))}
                    </div>

                    <textarea
                        className="settings-textarea"
                        value={activeTemplate}
                        onChange={e => { setTemplates({ ...templates, [activeWaTab]: e.target.value }); setDirty(true); }}
                        rows={10}
                    />

                    <div style={{ marginTop: 10 }}>
                        <p className="text-muted" style={{ fontSize: '0.72rem', marginBottom: 6 }}>🖱️ Klik untuk copy:</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {WA_VARS.map(v => (
                                <button
                                    key={v.tag}
                                    onClick={() => copyVar(v.tag)}
                                    title={v.desc}
                                    style={{
                                        cursor: 'pointer',
                                        background: copiedTag === v.tag ? '#10b981' : '#1e293b',
                                        color: copiedTag === v.tag ? '#fff' : '#94a3b8',
                                        border: `1px solid ${copiedTag === v.tag ? '#10b981' : '#334155'}`,
                                        borderRadius: 6, padding: '3px 10px',
                                        fontSize: '0.75rem', fontFamily: 'monospace',
                                        transition: 'all 0.2s', lineHeight: 1.6,
                                    }}
                                >
                                    {copiedTag === v.tag ? '✅ Copied!' : v.tag}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* WA Preview */}
                    <div style={{ marginTop: 14 }}>
                        <button
                            onClick={() => setShowPreview(v => !v)}
                            style={{
                                background: 'rgba(37,211,102,0.12)', color: '#25d366',
                                border: '1px solid rgba(37,211,102,0.3)', borderRadius: 8,
                                padding: '6px 14px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600
                            }}
                        >
                            {showPreview ? '🙈 Sembunyikan Preview' : '👁️ Preview Pesan WA'}
                        </button>
                    </div>

                    {showPreview && (
                        <div style={{ marginTop: 12, background: '#075e54', borderRadius: 12, padding: 14 }}>
                            <div style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>Preview WhatsApp — data contoh</div>
                            <div style={{
                                background: '#dcf8c6', color: '#111', padding: '10px 12px',
                                borderRadius: '12px 12px 2px 12px', whiteSpace: 'pre-wrap',
                                fontSize: '0.85rem', lineHeight: 1.5, maxWidth: '90%', marginLeft: 'auto',
                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                            }}>
                                {previewText}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.3)', textAlign: 'right', marginTop: 6 }}>
                                ✓✓ 14:39
                            </div>
                        </div>
                    )}
                </>
            )}
            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
