import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const STATUS_LABEL = {
    pesanan_masuk: 'Pesanan Masuk',
    sedang_dicuci: 'Sedang Dicuci',
    selesai_dicuci: 'Selesai Dicuci',
    sudah_diambil: 'Sudah Diambil',
};

const STATUS_OPTIONS = [
    { value: 'pesanan_masuk', label: '📥 Pesanan Masuk' },
    { value: 'sedang_dicuci', label: '🫧 Sedang Dicuci' },
    { value: 'selesai_dicuci', label: '✅ Selesai Dicuci' },
    { value: 'sudah_diambil', label: '🏠 Sudah Diambil' },
];

const STATUS_COLORS = {
    pesanan_masuk: '#f59e0b',
    sedang_dicuci: '#3b82f6',
    selesai_dicuci: '#10b981',
    sudah_diambil: '#6b7280',
};

const PAY_STATUS_CONFIG = {
    lunas: { label: 'LUNAS', color: '#10b981', bg: 'rgba(16,185,129,0.1)' },
    belum_lunas: { label: 'BELUM LUNAS', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    dp: { label: 'DP', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
};

const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
}) : '-';

export default function OrderCard({ order, onUpdateStatus, onReprint, onDelete, onEdit, updating }) {
    const [showStatusMenu, setShowStatusMenu] = useState(false);
    const [showHistory, setShowHistory] = useState(false);
    const [history, setHistory] = useState([]);
    const [histLoading, setHistLoading] = useState(false);

    const payCfg = PAY_STATUS_CONFIG[order.status_pembayaran] || PAY_STATUS_CONFIG.belum_lunas;

    const loadHistory = useCallback(async () => {
        if (history.length > 0) { setShowHistory(h => !h); return; }
        setHistLoading(true);
        const { data } = await supabase
            .from('order_status_logs')
            .select('status_lama, status_baru, catatan, created_at')
            .eq('order_id', order.id)
            .order('created_at', { ascending: true });
        setHistory(data || []);
        setHistLoading(false);
        setShowHistory(true);
    }, [order.id, history.length]);

    function handleStatusSelect(targetStatus) {
        if (targetStatus === order.status) {
            setShowStatusMenu(false);
            return;
        }
        if (!window.confirm(`Ubah status ke "${STATUS_LABEL[targetStatus]}"?`)) {
            setShowStatusMenu(false);
            return;
        }
        setShowStatusMenu(false);
        onUpdateStatus(targetStatus);
    }

    function shareToWhatsApp() {
        let phone = order.customers?.no_telepon;
        if (!phone) {
            alert('Nomor HP pelanggan tidak tersedia!');
            return;
        }
        if (phone.startsWith('0')) {
            phone = '62' + phone.substring(1);
        }
        const msg = `Halo ${order.customers?.nama || 'Kak'},\nBerikut detail pesanan laundry Anda:\n\n📦 *Kode:* ${order.kode}\n🔄 *Status:* ${STATUS_LABEL[order.status] || order.status}\n💰 *Status Bayar:* ${payCfg.label.toUpperCase()}\n💸 *Nominal:* ${formatRp(order.total_idr)}\n\nTerima kasih!`;
        const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');
    }

    return (
        <div className="order-card-premium" style={{
            background: 'var(--surface)',
            borderRadius: 24,
            padding: '24px',
            border: '1px solid var(--border)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            color: 'var(--text)',
            position: 'relative'
        }}>
            {/* Header: Code & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 800, letterSpacing: 0.5 }}>#{order.kode}</span>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {onEdit && <button onClick={onEdit} style={{ background: 'var(--surface2)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', fontSize: '0.85rem' }}>✏️</button>}
                            {onDelete && <button onClick={onDelete} style={{ background: 'rgba(239, 68, 68, 0.1)', border: 'none', borderRadius: 8, padding: 6, cursor: 'pointer', fontSize: '0.85rem' }}>🗑️</button>}
                        </div>
                    </div>
                    <h2 style={{ margin: '8px 0 0 0', fontSize: '1.6rem', fontWeight: 900 }}>{order.customers?.nama || 'PELANGGAN'}</h2>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 800, padding: '6px 14px', borderRadius: 12,
                        background: 'rgba(255,255,255,0.05)', color: 'var(--text-muted)', border: '1.5px solid var(--border)', textTransform: 'uppercase'
                    }}>
                        {STATUS_LABEL[order.status]?.toUpperCase()}
                    </span>
                    <span style={{
                        fontSize: '0.72rem', fontWeight: 800, padding: '6px 14px', borderRadius: 12,
                        background: payCfg.bg, color: payCfg.color, border: `1.5px solid ${payCfg.color}44`, textTransform: 'uppercase'
                    }}>
                        {payCfg.label}
                    </span>
                </div>
            </div>

            {/* Contacts */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-dim)', marginBottom: 20 }}>
                <span style={{ color: 'var(--error)' }}>📞</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 600 }}>{order.customers?.no_telepon || '-'}</span>
            </div>

            {/* Items Box - Screenshot Style */}
            <div style={{
                background: '#00000033', padding: '16px 20px', borderRadius: 20,
                border: '1px solid var(--border)', marginBottom: 20
            }}>
                {order.order_items && order.order_items.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {order.order_items.map((it, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                                <span style={{ color: 'var(--text-muted)' }}>• {it.nama_item}</span>
                                <span style={{ fontWeight: 800 }}>{it.jumlah} {it.satuan}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>• {order.services?.nama_layanan || 'Layanan'}</span>
                        <span style={{ fontWeight: 800 }}>{order.berat_kg || 0} kg</span>
                    </div>
                )}
            </div>

            {/* Price & Payments */}
            <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', fontWeight: 600, marginBottom: 4 }}>Total Pembayaran</div>
                <div style={{ fontSize: '1.8rem', fontWeight: 900, color: 'var(--accent)' }}>{formatRp(order.total_idr)}</div>
            </div>

            {/* Meta: Date & Logs */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--text-dim)', marginBottom: 24, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <span style={{ fontSize: '1rem' }}>📅</span>
                <span>{formatDate(order.created_at)}</span>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <button onClick={onReprint} className="btn-action-outline-premium">🖨️ Struk</button>
                    <button onClick={loadHistory} className="btn-action-outline-premium">
                        {histLoading ? '⏳' : '📅'} Log
                    </button>
                    <button onClick={shareToWhatsApp} className="btn-action-outline-premium" style={{ color: '#2b9d4c', borderColor: '#2b9d4c33' }}>
                        💬 WA
                    </button>
                </div>

                <div style={{ position: 'relative' }}>
                    <button
                        className="btn-status-detail-premium"
                        onClick={() => setShowStatusMenu(!showStatusMenu)}
                        disabled={updating}
                    >
                        {updating ? 'Processing...' : 'Update Status ▾'}
                    </button>

                    {showStatusMenu && (
                        <>
                            <div className="status-menu-overlay" onClick={() => setShowStatusMenu(false)} />
                            <div className="status-menu-detail" style={{
                                position: 'absolute', bottom: 'calc(100% + 12px)', right: 0,
                                background: 'var(--surface2)', border: '1px solid var(--border)',
                                borderRadius: 16, boxShadow: '0 15px 40px rgba(0,0,0,0.5)',
                                overflow: 'hidden', minWidth: 200, zIndex: 200
                            }}>
                                {STATUS_OPTIONS.map(opt => (
                                    <button
                                        key={opt.value}
                                        style={{
                                            width: '100%', padding: '14px 18px', border: 'none',
                                            background: order.status === opt.value ? 'var(--primary-glow)' : 'transparent',
                                            color: order.status === opt.value ? 'var(--primary)' : 'var(--text)',
                                            textAlign: 'left', fontWeight: 700, cursor: 'pointer',
                                            display: 'flex', alignItems: 'center', gap: 10
                                        }}
                                        onClick={() => handleStatusSelect(opt.value)}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Status History Collapsible */}
            {showHistory && (
                <div style={{
                    marginTop: 20, background: 'var(--bg2)', padding: 16, borderRadius: 20,
                    border: '1px solid var(--border)'
                }}>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 800, marginBottom: 12, letterSpacing: 1 }}>RIWAYAT PROSES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {history.map((h, i) => (
                            <div key={i} style={{ display: 'flex', gap: 12, position: 'relative' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLORS[h.status_baru], marginTop: 4, flexShrink: 0 }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.8rem', fontWeight: 800, color: STATUS_COLORS[h.status_baru] }}>{STATUS_LABEL[h.status_baru]}</span>
                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{new Date(h.created_at).toLocaleTimeString()}</span>
                                    </div>
                                    {h.catatan && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{h.catatan}</div>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
