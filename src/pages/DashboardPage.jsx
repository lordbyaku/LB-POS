import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { sendWaNotification } from '../lib/waNotify';
import LicenseBanner from '../components/LicenseBanner';
import OrderCard from '../components/OrderCard';
import ReceiptModal from '../components/ReceiptModal';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const STATUS_LABEL = {
    pesanan_masuk: 'Pesanan Masuk',
    sedang_dicuci: 'Sedang Dicuci',
    selesai_dicuci: 'Selesai Dicuci',
    sudah_diambil: 'Sudah Diambil',
};

const STATUS_COLORS_CHART = ['#6366f1', '#3b82f6', '#10b981', '#6b7280'];
const STATUS_KEYS = ['pesanan_masuk', 'sedang_dicuci', 'selesai_dicuci', 'sudah_diambil'];
const formatRpShort = (n) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'jt' : n >= 1000 ? (n / 1000).toFixed(0) + 'rb' : String(n);

export default function DashboardPage({ tenantId, licenseStatus, profile }) {
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(null);
    const [toast, setToast] = useState('');
    const [filter, setFilter] = useState('active');
    const [printOrder, setPrintOrder] = useState(null);
    const [sortBy, setSortBy] = useState('newest'); // newest | oldest | highest

    // Search
    const [search, setSearch] = useState('');

    // Editing
    const [editingOrder, setEditingOrder] = useState(null);
    const [editNote, setEditNote] = useState('');
    const [editPayStatus, setEditPayStatus] = useState('');
    const [editPayMethod, setEditPayMethod] = useState('');
    const [editDibayar, setEditDibayar] = useState('');
    const [editSaving, setEditSaving] = useState(false);

    // Realtime
    const channelRef = useRef(null);

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3500);
    };

    const loadOrders = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        const { data, error } = await supabase
            .from('orders')
            .select(`*, customers ( nama, no_telepon, alamat ), services ( nama_layanan, satuan ), order_items (*)`)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (!error) {
            let filtered = data || [];
            if (filter === 'active') filtered = filtered.filter(o => o.status !== 'sudah_diambil');
            else if (filter !== 'all') filtered = filtered.filter(o => o.status === filter);
            setOrders(filtered);
        }
        setLoading(false);
    }, [tenantId, filter]);

    // Setup Realtime subscription
    useEffect(() => {
        if (!tenantId) return;

        // Initial load
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadOrders();

        // Subscribe to realtime changes
        channelRef.current = supabase
            .channel(`orders-${tenantId}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'orders',
                filter: `tenant_id=eq.${tenantId}`,
            }, () => {
                loadOrders();
            })
            .subscribe();

        return () => {
            if (channelRef.current) {
                supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [tenantId, filter, loadOrders]);

    async function handleStatusUpdate(order, targetStatus) {
        if (licenseStatus !== 'aktif') return showToast('❌ Lisensi tidak aktif / Masa Tenggang');
        setUpdating(order.id);
        const { error } = await supabase.rpc('update_order_status', { p_order_id: order.id, p_new_status: targetStatus });
        if (error) showToast('❌ Gagal: ' + error.message);
        else {
            showToast(`✅ Berhasil: ${STATUS_LABEL[targetStatus]}`);
            loadOrders();
            await sendWaNotification({ kode: order.kode, customerName: order.customers?.nama, customerPhone: order.customers?.no_telepon, status: targetStatus, tenantId, statusBayar: order.status_pembayaran, totalIdr: order.total_idr });
        }
        setUpdating(null);
    }

    async function handleDeleteOrder(id, kode) {
        if (!confirm(`Hapus pesanan ${kode}? Data akan hilang selamanya.`)) return;
        const { error } = await supabase.from('orders').delete().eq('id', id);
        if (error) alert('Gagal: ' + error.message);
        else {
            await supabase.from('audit_logs').insert({
                tenant_id: tenantId, user_id: profile?.id, aksi: 'DELETE_ORDER', entitas: 'orders', entitas_id: id, data_lama: { kode }
            });
            showToast('🗑️ Pesanan dihapus');
            loadOrders();
        }
    }

    function openEditModal(order) {
        setEditingOrder(order);
        setEditNote(order.catatan || '');
        setEditPayStatus(order.status_pembayaran || 'belum_lunas');
        setEditPayMethod(order.metode_pembayaran || 'tunai');
        setEditDibayar(String(order.dibayar_idr || 0));
    }

    async function handleSaveEdit() {
        if (!editingOrder) return;
        setEditSaving(true);
        const { error } = await supabase
            .from('orders')
            .update({
                catatan: editNote || null,
                status_pembayaran: editPayStatus,
                metode_pembayaran: editPayMethod,
                dibayar_idr: parseInt(editDibayar) || 0,
            })
            .eq('id', editingOrder.id);
        if (error) {
            showToast('❌ Gagal update: ' + error.message);
        } else {
            showToast('✅ Pesanan diperbarui');
            setEditingOrder(null);
            loadOrders();
        }
        setEditSaving(false);
    }

    async function handleLunasi(order) {
        if (!confirm(`Tandai pesanan ${order.kode} sebagai LUNAS?`)) return;
        setUpdating(order.id);
        const { error } = await supabase
            .from('orders')
            .update({ status_pembayaran: 'lunas', dibayar_idr: order.total_idr })
            .eq('id', order.id);
        if (error) showToast('❌ Gagal: ' + error.message);
        else {
            showToast('✅ Pesanan sudah LUNAS');
            loadOrders();
        }
        setUpdating(null);
    }

    // Fuzzy search on displayed orders
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

    const activeCount = orders.filter(o => o.status !== 'sudah_diambil').length;

    // Today's summary
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayOrders = orders.filter(o => o.created_at?.slice(0, 10) === todayStr);
    const todayOmzet = todayOrders.reduce((s, o) => s + (o.total_idr || 0), 0);
    const todayBelumLunas = todayOrders.filter(o => o.status_pembayaran !== 'lunas');

    // Chart data
    const chartData = STATUS_KEYS.map((key, i) => ({
        name: STATUS_LABEL[key],
        value: orders.filter(o => o.status === key).length,
        color: STATUS_COLORS_CHART[i]
    })).filter(d => d.value > 0);

    // Sort + Search + Advanced Filter
    const [payFilter, setPayFilter] = useState('all'); // all | belum | lunas
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    let displayedOrders = search
        ? orders.filter(o =>
            fuzzyMatch(o.kode, search) ||
            fuzzyMatch(o.customers?.nama, search) ||
            fuzzyMatch(o.customers?.no_telepon, search)
        )
        : [...orders];

    if (payFilter !== 'all') {
        if (payFilter === 'belum') displayedOrders = displayedOrders.filter(o => o.status_pembayaran !== 'lunas');
        else displayedOrders = displayedOrders.filter(o => o.status_pembayaran === 'lunas');
    }

    if (dateFrom) {
        displayedOrders = displayedOrders.filter(o => o.created_at >= dateFrom + 'T00:00:00');
    }
    if (dateTo) {
        displayedOrders = displayedOrders.filter(o => o.created_at <= dateTo + 'T23:59:59');
    }

    if (sortBy === 'oldest') displayedOrders = displayedOrders.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (sortBy === 'highest') displayedOrders = displayedOrders.sort((a, b) => b.total_idr - a.total_idr);
    else displayedOrders = displayedOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 11) return 'Selamat Pagi';
        if (hour < 15) return 'Selamat Siang';
        if (hour < 19) return 'Selamat Sore';
        return 'Selamat Malam';
    };

    return (
        <div className="page dashboard-page">
            <div className="dashboard-welcome" style={{ marginBottom: 20 }}>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', fontWeight: 500 }}>{getGreeting()},</div>
                <h1 style={{ fontSize: '1.6rem', margin: '2px 0' }}>{profile?.tenant_name || 'LB POS INDONESIA'}</h1>
                <p style={{ fontSize: '0.82rem', margin: 0, opacity: 0.8 }}>Siap memproses cucian hari ini? ⚡</p>
            </div>

            {/* Today's Summary - Premium Look */}
            {todayOrders.length > 0 && (
                <div className="dashboard-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, marginBottom: 20 }}>
                    <div className="stat-card-premium" style={{
                        background: 'linear-gradient(135deg, rgba(88, 153, 255, 0.15) 0%, rgba(88, 153, 255, 0.05) 100%)',
                        border: '1px solid rgba(88, 153, 255, 0.2)',
                        padding: '16px', borderRadius: 'var(--radius)', position: 'relative', overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', right: -10, top: -10, fontSize: '3rem', opacity: 0.1, pointerEvents: 'none' }}>📋</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>ORDER HARI INI</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 4 }}>{todayOrders.length}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>{todayBelumLunas.length} belum lunas</div>
                    </div>
                    <div className="stat-card-premium" style={{
                        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(16, 185, 129, 0.05) 100%)',
                        border: '1px solid rgba(16, 185, 129, 0.2)',
                        padding: '16px', borderRadius: 'var(--radius)', position: 'relative', overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', right: -10, top: -10, fontSize: '3rem', opacity: 0.1, pointerEvents: 'none' }}>💰</div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.5, textTransform: 'uppercase' }}>OMZET HARI INI</div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 4 }}>{formatRpShort(todayOmzet)}</div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 2 }}>dari {todayOrders.length} pesanan</div>
                    </div>
                </div>
            )}

            {/* #6 - Mini Chart Status - Integrated */}
            {chartData.length > 0 && (
                <div style={{
                    background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                    padding: '18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 16,
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ width: 100, height: 100, flexShrink: 0 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={chartData} cx="50%" cy="50%" innerRadius={28} outerRadius={46} dataKey="value" paddingAngle={4}>
                                    {chartData.map((entry, i) => <Cell key={i} fill={entry.color} strokeWidth={0} />)}
                                </Pie>
                                <Tooltip formatter={(v, n) => [v + ' pesanan', n]} contentStyle={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, fontSize: '0.78rem', boxShadow: 'var(--shadow)' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8, fontWeight: 700, letterSpacing: 0.5 }}>PANTAU STATUS</div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 12px' }}>
                            {chartData.map((d, i) => (
                                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem' }}>
                                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, flexShrink: 0 }} />
                                    <span style={{ color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name.split(' ')[0]}</span>
                                    <span style={{ fontWeight: 800, color: d.color, marginLeft: 'auto' }}>{d.value}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            <div className="page-header" style={{ marginBottom: 12 }}>
                <h2 style={{ fontSize: '1.15rem' }}>Pesanan Aktif <span style={{ color: 'var(--text-dim)', fontWeight: 400, marginLeft: 4 }}>({activeCount})</span></h2>
                <button className="btn btn-icon refresh-btn" onClick={loadOrders} style={{ borderRadius: '50%', width: 36, height: 36 }}>🔄</button>
            </div>

            {/* Search - Modern Glassmorphism */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', fontSize: '1rem', pointerEvents: 'none' }}>🔍</span>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari kode atau nama pelanggan..."
                    style={{
                        padding: '14px 16px 14px 44px', borderRadius: 'var(--radius-sm)',
                        background: 'var(--bg2)', border: '1px solid var(--border)',
                        fontSize: '0.92rem', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.2)'
                    }}
                />
                {search && (
                    <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'var(--surface2)', border: 'none', color: 'var(--text-muted)', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: '0.7rem' }}>✕</button>
                )}
            </div>

            <div className="filter-scroll">
                <div className="filter-tabs">
                    {['active', 'pesanan_masuk', 'sedang_dicuci', 'selesai_dicuci', 'sudah_diambil', 'all'].map(f => (
                        <button
                            key={f}
                            className={`tab-btn ${filter === f ? 'active' : ''}`}
                            onClick={() => setFilter(f)}
                        >
                            {f === 'active' ? '🔄 Aktif' :
                                f === 'pesanan_masuk' ? '📥 Masuk' :
                                    f === 'sedang_dicuci' ? '🫧 Cuci' :
                                        f === 'selesai_dicuci' ? '✅ Selesai' :
                                            f === 'sudah_diambil' ? '🏠 Ambil' : '✨ Semua'}
                        </button>
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontWeight: 600, whiteSpace: 'nowrap' }}>Urutkan:</span>
                    {[
                        { key: 'newest', label: 'Terbaru', icon: '🕐' },
                        { key: 'oldest', label: 'Terlama', icon: '🕛' },
                        { key: 'highest', label: 'Tertinggi', icon: '💰' },
                    ].map(s => (
                        <button
                            key={s.key}
                            onClick={() => setSortBy(s.key)}
                            style={{
                                fontSize: '0.75rem', padding: '6px 14px', borderRadius: 30, whiteSpace: 'nowrap',
                                background: sortBy === s.key ? 'rgba(88, 153, 255, 0.15)' : 'var(--bg2)',
                                border: `1px solid ${sortBy === s.key ? 'var(--primary)' : 'var(--border)'}`,
                                color: sortBy === s.key ? 'var(--primary)' : 'var(--text-dim)', cursor: 'pointer', fontWeight: 700,
                                transition: 'all 0.2s ease', display: 'flex', alignItems: 'center', gap: 4
                            }}
                        >
                            <span>{s.icon}</span> {s.label}
                        </button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                    <select
                        value={payFilter} onChange={e => setPayFilter(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '12px', background: 'var(--bg2)', border: '1px solid var(--border)', fontSize: '0.8rem', color: 'var(--text)', outline: 'none' }}
                    >
                        <option value="all">Semua Pembayaran</option>
                        <option value="belum">Belum Lunas / Kasbon</option>
                        <option value="lunas">Sudah Lunas</option>
                    </select>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg2)', padding: '4px 12px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ padding: 4, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.8rem', outline: 'none' }} />
                        <span style={{ color: 'var(--text-dim)', fontSize: '0.8rem', fontWeight: 600 }}>s/d</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ padding: 4, background: 'transparent', border: 'none', color: 'var(--text)', fontSize: '0.8rem', outline: 'none' }} />
                        {(dateFrom || dateTo) && <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ background: 'var(--surface2)', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '0.8rem', width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>}
                    </div>
                </div>
            </div>


            {!tenantId ? (
                <div className="empty-state" style={{ padding: 40, textAlign: 'center' }}>
                    <p>⚠️ Tidak ada tenant aktif.</p>
                    <p style={{ fontSize: '0.8rem' }}>Hubungi admin untuk mengaktifkan akses Anda.</p>
                </div>
            ) : loading ? <p>Memuat...</p> : (
                <div className="order-list">
                    {displayedOrders.length === 0 && (
                        <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                            {search ? `Tidak ada hasil untuk "${search}"` : 'Tidak ada pesanan'}
                        </div>
                    )}
                    {displayedOrders.map(order => (
                        <OrderCard
                            key={order.id}
                            order={order}
                            updating={updating === order.id}
                            onUpdateStatus={(st) => handleStatusUpdate(order, st)}
                            onReprint={() => setPrintOrder(order)}
                            onDelete={() => handleDeleteOrder(order.id, order.kode)}
                            onEdit={() => openEditModal(order)}
                            onLunasi={() => handleLunasi(order)}
                            isAdmin={profile?.role === 'owner' || profile?.global_role === 'admin'}
                        />
                    ))}
                </div>
            )}

            {toast && <div className="toast">{toast}</div>}
            {printOrder && <ReceiptModal order={printOrder} onClose={() => setPrintOrder(null)} isPrint />}

            {/* Edit Modal */}
            {editingOrder && (
                <>
                    <div className="status-menu-overlay" onClick={() => setEditingOrder(null)} />
                    <div style={{
                        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
                        padding: 20, zIndex: 1000, width: '90%', maxWidth: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <h3 style={{ margin: 0 }}>✏️ Edit Pesanan</h3>
                            <button onClick={() => setEditingOrder(null)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
                        </div>
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                            Kode: <strong style={{ color: 'var(--primary)' }}>{editingOrder.kode}</strong>
                        </div>

                        <div className="form-group">
                            <label>Catatan</label>
                            <input type="text" value={editNote} onChange={e => setEditNote(e.target.value)} placeholder="Catatan pesanan..." />
                        </div>
                        <div className="form-group">
                            <label>Status Pembayaran</label>
                            <select value={editPayStatus} onChange={e => setEditPayStatus(e.target.value)}>
                                <option value="belum_lunas">Belum Lunas</option>
                                <option value="lunas">Lunas</option>
                                <option value="dp">DP / Uang Muka</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Metode Pembayaran</label>
                            <select value={editPayMethod} onChange={e => setEditPayMethod(e.target.value)}>
                                <option value="tunai">Tunai</option>
                                <option value="transfer">Transfer</option>
                                <option value="qris">QRIS</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label>Jumlah Dibayar (Rp)</label>
                            <input type="number" value={editDibayar} onChange={e => setEditDibayar(e.target.value)} placeholder="0" />
                        </div>

                        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSaveEdit} disabled={editSaving}>
                                {editSaving ? '⏳...' : '💾 Simpan'}
                            </button>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setEditingOrder(null)}>Batal</button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
