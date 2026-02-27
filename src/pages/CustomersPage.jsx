import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

function getPoinLevel(pts) {
    if (pts >= 500) return { label: '💎 Diamond', color: '#a78bfa', next: null, progress: 100 };
    if (pts >= 200) return { label: '🥇 Gold', color: '#f59e0b', next: 500, progress: ((pts - 200) / 300) * 100 };
    if (pts >= 50) return { label: '🥈 Silver', color: '#94a3b8', next: 200, progress: ((pts - 50) / 150) * 100 };
    return { label: '🥉 Bronze', color: '#f97316', next: 50, progress: (pts / 50) * 100 };
}

export default function CustomersPage({ tenantId, licenseStatus }) {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [orders, setOrders] = useState([]);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [editData, setEditData] = useState({});
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState('');

    const canWrite = licenseStatus !== 'kedaluwarsa';

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const loadCustomers = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        const { data } = await supabase
            .from('customers')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('nama');
        setCustomers(data || []);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadCustomers();
    }, [loadCustomers]);

    async function loadOrders(customerId) {
        setOrdersLoading(true);
        const { data } = await supabase
            .from('orders')
            .select('kode, total_idr, status, status_pembayaran, created_at')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
            .limit(20);
        setOrders(data || []);
        setOrdersLoading(false);
    }

    function selectCustomer(c) {
        setSelectedCustomer(c);
        setEditMode(false);
        setEditData({ nama: c.nama, no_telepon: c.no_telepon, alamat: c.alamat || '' });
        loadOrders(c.id);
    }

    async function handleSaveEdit() {
        if (!editData.nama || !editData.no_telepon) return showToast('Nama dan No. HP wajib diisi');
        setSaving(true);
        const { error } = await supabase
            .from('customers')
            .update({ nama: editData.nama.trim(), no_telepon: editData.no_telepon.trim(), alamat: editData.alamat.trim() })
            .eq('id', selectedCustomer.id);
        if (error) {
            showToast('❌ Gagal: ' + error.message);
        } else {
            showToast('✅ Data pelanggan diperbarui');
            setEditMode(false);
            const updated = { ...selectedCustomer, ...editData };
            setSelectedCustomer(updated);
            loadCustomers();
        }
        setSaving(false);
    }

    async function handleDelete(c) {
        if (!window.confirm(`Hapus pelanggan ${c.nama}? Semua data terkait akan tetap ada.`)) return;
        const { error } = await supabase.from('customers').delete().eq('id', c.id);
        if (error) showToast('❌ Tidak bisa hapus: ' + error.message);
        else {
            showToast('🗑️ Pelanggan dihapus');
            setSelectedCustomer(null);
            loadCustomers();
        }
    }

    // Fuzzy filter
    function fuzzyMatch(str, q) {
        const s = (str || '').toLowerCase(), p = q.toLowerCase();
        let si = 0;
        for (let pi = 0; pi < p.length; pi++) {
            while (si < s.length && s[si] !== p[pi]) si++;
            if (si >= s.length) return false;
            si++;
        }
        return true;
    }

    const filtered = search
        ? customers.filter(c => fuzzyMatch(c.nama, search) || fuzzyMatch(c.no_telepon, search))
        : customers;

    const STATUS_LABEL = { pesanan_masuk: 'Masuk', sedang_dicuci: 'Dicuci', selesai_dicuci: 'Selesai', sudah_diambil: 'Diambil' };
    const PAY_COLOR = { lunas: '#10b981', belum_lunas: '#f59e0b', dp: '#3b82f6' };

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>👥 Pelanggan</h2>
                    <p className="text-muted">{customers.length} total pelanggan</p>
                </div>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}>🔍</span>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari nama atau nomor HP..."
                    style={{ paddingLeft: 36 }}
                />
                {search && (
                    <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                )}
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Customer List */}
                <div style={{ flex: 1, minWidth: 0 }}>
                    {loading ? <div className="loading-state"><div className="spinner" /></div> : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {filtered.length === 0 && (
                                <div className="card" style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {search ? `Tidak ada hasil untuk "${search}"` : 'Belum ada pelanggan'}
                                </div>
                            )}
                            {filtered.map(c => (
                                <div
                                    key={c.id}
                                    onClick={() => selectCustomer(c)}
                                    className="card"
                                    style={{
                                        padding: '12px 16px', cursor: 'pointer',
                                        border: selectedCustomer?.id === c.id ? '2px solid var(--primary)' : '1px solid var(--border)',
                                        background: selectedCustomer?.id === c.id ? 'var(--primary-glow)' : 'var(--surface)',
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        transition: 'all 0.2s ease',
                                        borderRadius: 'var(--radius-sm)'
                                    }}
                                >
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text)' }}>{c.nama}</div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <span>📱 {c.no_telepon}</span>
                                        </div>
                                        {c.alamat && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: 'var(--text-dim)',
                                                marginTop: 4,
                                                whiteSpace: 'nowrap',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                fontStyle: 'italic'
                                            }}>
                                                📍 {c.alamat}
                                            </div>
                                        )}
                                    </div>
                                    <span style={{
                                        fontSize: '0.7rem',
                                        background: 'rgba(245, 158, 11, 0.1)',
                                        color: '#f59e0b',
                                        padding: '3px 8px',
                                        borderRadius: 20,
                                        fontWeight: 800,
                                        whiteSpace: 'nowrap',
                                        marginLeft: 8
                                    }}>
                                        {c.poin_balance || 0} pts
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Detail Panel */}
                {selectedCustomer && (
                    <div className="card" style={{ flex: '0 0 300px', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {editMode ? (
                            <>
                                <h4 style={{ margin: 0 }}>✏️ Edit Pelanggan</h4>
                                <div className="form-group">
                                    <label>Nama</label>
                                    <input value={editData.nama} onChange={e => setEditData({ ...editData, nama: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>No. WhatsApp</label>
                                    <input value={editData.no_telepon} onChange={e => setEditData({ ...editData, no_telepon: e.target.value })} />
                                </div>
                                <div className="form-group">
                                    <label>Alamat</label>
                                    <input value={editData.alamat} onChange={e => setEditData({ ...editData, alamat: e.target.value })} />
                                </div>
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveEdit} disabled={saving}>
                                        {saving ? '⏳...' : '💾 Simpan'}
                                    </button>
                                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditMode(false)}>Batal</button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div>
                                        <h4 style={{ margin: 0 }}>{selectedCustomer.nama}</h4>
                                        <a href={`tel:${selectedCustomer.no_telepon}`} style={{ color: 'var(--primary)', fontSize: '0.85rem' }}>
                                            📞 {selectedCustomer.no_telepon}
                                        </a>
                                    </div>
                                </div>

                                {/* #12 - Loyalty Poin Panel */}
                                {(() => {
                                    const pts = selectedCustomer.poin_balance || 0;
                                    const lvl = getPoinLevel(pts);
                                    return (
                                        <div style={{ background: 'linear-gradient(135deg, var(--bg3), var(--surface2))', borderRadius: 10, padding: 12, border: '1px solid var(--border)' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                                                <div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Poin Loyalitas</div>
                                                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: lvl.color, lineHeight: 1.1 }}>{pts.toLocaleString()}</div>
                                                    <div style={{ fontSize: '0.7rem', color: lvl.color, fontWeight: 600 }}>{lvl.label}</div>
                                                </div>
                                                <span className="poin-badge-anim" style={{ fontSize: '2rem' }}>⭐</span>
                                            </div>
                                            {lvl.next && (
                                                <>
                                                    <div style={{ height: 5, background: 'var(--bg)', borderRadius: 10, overflow: 'hidden', marginBottom: 3 }}>
                                                        <div style={{ height: '100%', width: `${Math.min(lvl.progress, 100)}%`, background: lvl.color, borderRadius: 10, transition: 'width 0.6s ease' }} />
                                                    </div>
                                                    <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>{lvl.next - pts} poin lagi ke level berikutnya</div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })()}
                                {selectedCustomer.alamat && (
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>📍 {selectedCustomer.alamat}</div>
                                )}
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                    Bergabung: {formatDate(selectedCustomer.created_at)}
                                </div>
                                {canWrite && (
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setEditMode(true)}>✏️ Edit</button>
                                        <button className="btn btn-sm" style={{ flex: 1, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid #ef4444' }} onClick={() => handleDelete(selectedCustomer)}>🗑️ Hapus</button>
                                    </div>
                                )}

                                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />
                                <h5 style={{ margin: 0, fontSize: '0.85rem' }}>📋 Histori Pesanan</h5>
                                {ordersLoading ? <div className="spinner" style={{ width: 20, height: 20 }} /> : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                                        {orders.length === 0 && <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', textAlign: 'center', padding: 12 }}>Belum ada pesanan</div>}
                                        {orders.map(o => (
                                            <div key={o.id} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', fontSize: '0.82rem' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                    <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{o.kode}</span>
                                                    <span style={{ color: PAY_COLOR[o.status_pembayaran] || '#888', fontWeight: 600, fontSize: '0.75rem' }}>
                                                        {o.status_pembayaran?.replace('_', ' ') || '-'}
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
                                                    <span style={{ color: 'var(--text-muted)' }}>{formatDate(o.created_at)}</span>
                                                    <span style={{ fontWeight: 600 }}>{formatRp(o.total_idr)}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
