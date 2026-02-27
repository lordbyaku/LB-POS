import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const formatDate = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '∞';

function generateCode(prefix = 'LND') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = prefix + '-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

export default function VouchersPage({ tenantId }) {
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [toast, setToast] = useState('');
    const [showForm, setShowForm] = useState(false);

    // Form state
    const [kode, setKode] = useState('');
    const [tipe, setTipe] = useState('nominal'); // nominal | persen
    const [nilai, setNilai] = useState('');
    const [minOrder, setMinOrder] = useState('0');
    const [kuota, setKuota] = useState('100');
    const [expDate, setExpDate] = useState('');

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const loadVouchers = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        const { data } = await supabase
            .from('vouchers')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });
        setVouchers(data || []);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadVouchers();
    }, [loadVouchers]);

    function resetForm() {
        setKode('');
        setTipe('nominal');
        setNilai('');
        setMinOrder('0');
        setKuota('100');
        setExpDate('');
        setShowForm(false);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!kode || !nilai) return;
        setSubmitting(true);
        const { error } = await supabase.from('vouchers').insert({
            tenant_id: tenantId,
            kode_voucher: kode.toUpperCase().trim(),
            tipe_potongan: tipe,
            nilai: parseInt(nilai),
            min_order: parseInt(minOrder) || 0,
            kuota: parseInt(kuota) || 999,
            tgl_kadaluarsa: expDate || null,
            is_active: true,
        });
        if (error) {
            showToast('❌ ' + (error.code === '23505' ? 'Kode voucher sudah ada!' : error.message));
        } else {
            showToast('✅ Voucher berhasil dibuat!');
            resetForm();
            loadVouchers();
        }
        setSubmitting(false);
    }

    async function toggleActive(v) {
        const { error } = await supabase.from('vouchers').update({ is_active: !v.is_active }).eq('id', v.id);
        if (!error) {
            showToast(v.is_active ? '⏸️ Voucher dinonaktifkan' : '▶️ Voucher diaktifkan');
            loadVouchers();
        }
    }

    async function deleteVoucher(v) {
        if (!window.confirm(`Hapus voucher ${v.kode_voucher}?`)) return;
        const { error } = await supabase.from('vouchers').delete().eq('id', v.id);
        if (!error) { showToast('🗑️ Voucher dihapus'); loadVouchers(); }
    }

    function copyCode(code) {
        navigator.clipboard.writeText(code).then(() => showToast(`📋 "${code}" disalin!`));
    }

    const isExpired = (tgl) => tgl && new Date(tgl) < new Date();

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>🎟️ Voucher</h2>
                    <p className="text-muted">{vouchers.filter(v => v.is_active).length} voucher aktif</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => { setShowForm(true); setKode(generateCode()); }}>
                    + Buat Voucher
                </button>
            </div>

            {/* Create Form Modal */}
            {showForm && (
                <>
                    <div className="status-menu-overlay" onClick={resetForm} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
                        padding: 20, zIndex: 1000, width: '92%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                        maxHeight: '90vh', overflowY: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0 }}>🎟️ Buat Voucher Baru</h3>
                            <button onClick={resetForm} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group">
                                <label>Kode Voucher</label>
                                <div style={{ display: 'flex', gap: 6 }}>
                                    <input
                                        type="text"
                                        value={kode}
                                        onChange={e => setKode(e.target.value.toUpperCase())}
                                        placeholder="LND-XXXXX"
                                        style={{ flex: 1, fontFamily: 'monospace', letterSpacing: 2, fontWeight: 700 }}
                                        required
                                    />
                                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => setKode(generateCode())} title="Generate ulang">🔀</button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Tipe Diskon</label>
                                <div className="toggle-group" style={{ marginBottom: 0 }}>
                                    <button type="button" className={`toggle-btn ${tipe === 'nominal' ? 'active' : ''}`} onClick={() => setTipe('nominal')}>Nominal (Rp)</button>
                                    <button type="button" className={`toggle-btn ${tipe === 'persen' ? 'active' : ''}`} onClick={() => setTipe('persen')}>Persen (%)</button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label>{tipe === 'persen' ? 'Diskon (%)' : 'Diskon (Rp)'}</label>
                                <input
                                    type="number"
                                    value={nilai}
                                    onChange={e => setNilai(e.target.value)}
                                    placeholder={tipe === 'persen' ? 'mis: 10 (10%)' : 'mis: 5000'}
                                    max={tipe === 'persen' ? 100 : undefined}
                                    required
                                />
                                {tipe === 'persen' && nilai && (
                                    <div style={{ fontSize: '0.78rem', color: 'var(--accent)', marginTop: 2 }}>
                                        Potongan: {nilai}% dari total order
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                                <div className="form-group">
                                    <label>Min. Order (Rp)</label>
                                    <input type="number" value={minOrder} onChange={e => setMinOrder(e.target.value)} placeholder="0" />
                                </div>
                                <div className="form-group">
                                    <label>Kuota Pemakaian</label>
                                    <input type="number" value={kuota} onChange={e => setKuota(e.target.value)} placeholder="100" />
                                </div>
                            </div>

                            <div className="form-group">
                                <label>Kadaluarsa (kosongkan = selamanya)</label>
                                <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} />
                            </div>

                            {/* Preview */}
                            {kode && nilai && (
                                <div style={{
                                    background: 'linear-gradient(135deg, var(--primary-glow), rgba(16,185,129,0.1))',
                                    border: '1px dashed var(--primary)', borderRadius: 12, padding: 14,
                                    textAlign: 'center', marginTop: 4
                                }}>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>Preview Voucher</div>
                                    <div style={{ fontFamily: 'monospace', fontSize: '1.2rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: 2 }}>{kode}</div>
                                    <div style={{ fontSize: '0.85rem', color: 'var(--accent)', marginTop: 4 }}>
                                        Hemat {tipe === 'persen' ? nilai + '%' : formatRp(parseInt(nilai) || 0)}
                                        {parseInt(minOrder) > 0 ? ` • Min. ${formatRp(parseInt(minOrder))}` : ''}
                                    </div>
                                </div>
                            )}

                            <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>
                                {submitting ? '⏳ Menyimpan...' : '✅ Buat Voucher'}
                            </button>
                        </form>
                    </div>
                </>
            )}

            {/* Voucher List */}
            {loading ? (
                <div className="loading-state"><div className="spinner" /></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {vouchers.length === 0 && (
                        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🎟️</div>
                            Belum ada voucher. Buat voucher pertama!
                        </div>
                    )}
                    {vouchers.map(v => {
                        const expired = isExpired(v.tgl_kadaluarsa);
                        const statusColor = !v.is_active ? 'var(--text-dim)' : expired ? 'var(--warning)' : 'var(--success)';
                        const statusLabel = !v.is_active ? 'Nonaktif' : expired ? 'Kadaluarsa' : 'Aktif';
                        return (
                            <div key={v.id} className="card voucher-card" style={{
                                padding: '14px 16px',
                                opacity: !v.is_active || expired ? 0.7 : 1,
                                borderLeft: `3px solid ${statusColor}`,
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                                            <span
                                                style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 700, color: 'var(--primary)', cursor: 'pointer', letterSpacing: 1 }}
                                                onClick={() => copyCode(v.kode_voucher)}
                                                title="Klik untuk menyalin"
                                            >
                                                {v.kode_voucher}
                                            </span>
                                            <button onClick={() => copyCode(v.kode_voucher)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.8rem', color: 'var(--text-dim)' }} title="Salin kode">📋</button>
                                            <span style={{
                                                fontSize: '0.65rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                                                background: statusColor + '22', color: statusColor, border: `1px solid ${statusColor}44`
                                            }}>{statusLabel}</span>
                                        </div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--accent)' }}>
                                            {v.tipe_potongan === 'persen' ? `${v.nilai}% OFF` : `- ${formatRp(v.nilai)}`}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                            {v.min_order > 0 && <span>Min. {formatRp(v.min_order)}</span>}
                                            <span>Kuota: {v.kuota || '∞'}</span>
                                            <span>Exp: {formatDate(v.tgl_kadaluarsa)}</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                        <button
                                            onClick={() => toggleActive(v)}
                                            className="btn btn-secondary btn-sm"
                                            style={{ fontSize: '0.72rem', padding: '5px 8px' }}
                                        >
                                            {v.is_active ? '⏸️' : '▶️'}
                                        </button>
                                        <button
                                            onClick={() => deleteVoucher(v)}
                                            style={{
                                                background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                                                color: 'var(--error)', borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: '0.72rem'
                                            }}
                                        >🗑️</button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
