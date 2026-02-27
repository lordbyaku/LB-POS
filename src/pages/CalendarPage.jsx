import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendWaNotification } from '../lib/waNotify';
import OrderCard from '../components/OrderCard';
import ReceiptModal from '../components/ReceiptModal';

const DAYS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

const STATUS_COLOR = {
    pesanan_masuk: '#f59e0b',
    sedang_dicuci: '#3b82f6',
    selesai_dicuci: '#10b981',
    sudah_diambil: '#6b7280',
};
const STATUS_LABEL = {
    pesanan_masuk: 'Masuk',
    sedang_dicuci: 'Dicuci',
    selesai_dicuci: 'Selesai',
    sudah_diambil: 'Diambil',
};

const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const formatTime = (d) => d ? new Date(d).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '';

export default function CalendarPage({ tenantId, profile, licenseStatus }) {
    const now = new Date();
    const [year, setYear] = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(now.toISOString().slice(0, 10)); // Default to today
    const [dayOrders, setDayOrders] = useState([]);

    // Detailed Order Modal
    const [detailOrder, setDetailOrder] = useState(null);
    const [updating, setUpdating] = useState(null);
    const [toast, setToast] = useState('');
    const [printOrder, setPrintOrder] = useState(null);
    const [isMinimized, setIsMinimized] = useState(false);

    const showToast = (msg) => {
        setToast(msg);
        setTimeout(() => setToast(''), 3000);
    };

    const loadOrders = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        const startDate = new Date(year, month, 1).toISOString().split('T')[0];
        const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

        const { data } = await supabase
            .from('orders')
            .select(`
                *,
                customers ( nama, no_telepon, alamat, poin_balance ),
                services ( nama_layanan, satuan, estimasi_jam ),
                order_items (*)
            `)
            .eq('tenant_id', tenantId)
            .gte('created_at', startDate + 'T00:00:00')
            .lte('created_at', endDate + 'T23:59:59')
            .order('created_at', { ascending: true });

        const allOrders = data || [];
        setOrders(allOrders);

        // Grouping logic for day selection
        const ordersByDate = {};
        allOrders.forEach(o => {
            const d = o.created_at.slice(0, 10);
            if (!ordersByDate[d]) ordersByDate[d] = [];
            ordersByDate[d].push(o);
        });

        if (selectedDate) {
            setDayOrders(ordersByDate[selectedDate] || []);
        }

        setLoading(false);
    }, [tenantId, year, month, selectedDate]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadOrders();
    }, [loadOrders]);

    // Group orders by date string (YYYY-MM-DD)
    const ordersByDateMap = {};
    orders.forEach(o => {
        const d = o.created_at.slice(0, 10);
        if (!ordersByDateMap[d]) ordersByDateMap[d] = [];
        ordersByDateMap[d].push(o);
    });

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    function selectDay(day) {
        if (!day) return;
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setSelectedDate(dateStr);
        setDayOrders(ordersByDateMap[dateStr] || []);
    }

    async function handleStatusUpdate(order, targetStatus) {
        if (licenseStatus !== 'aktif') return showToast('❌ Lisensi tidak aktif');
        setUpdating(order.id);
        const { error } = await supabase.rpc('update_order_status', { p_order_id: order.id, p_new_status: targetStatus });
        if (error) showToast('❌ Gagal: ' + error.message);
        else {
            showToast(`✅ Berhasil diupdate`);
            loadOrders();
            const { data } = await supabase.from('orders').select('*, customers(*), services(*), order_items(*)').eq('id', order.id).single();
            if (data) setDetailOrder(data);
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
            setDetailOrder(null);
            loadOrders();
        }
    }

    const toggleMinimize = () => setIsMinimized(!isMinimized);

    const totalOrdersMonth = orders.length;
    const totalOmzetMonth = orders.reduce((s, o) => s + (o.total_idr || 0), 0);

    return (
        <div className="page" style={{ paddingBottom: 100 }}>
            <div className="page-header" style={{ marginBottom: 12 }}>
                <div>
                    <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>{profile?.tenant_name || 'LB POS INDONESIA'}</h2>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{totalOrdersMonth} order · {formatRp(totalOmzetMonth)}</p>
                </div>
                <button className="btn btn-icon" onClick={loadOrders} disabled={loading} style={{ background: 'var(--surface2)', borderRadius: '50%' }}>🔄</button>
            </div>

            {/* Calendar Controls */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 }}>
                <button onClick={() => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); }} className="btn-icon" style={{ background: 'var(--surface2)', borderRadius: 10, width: 36, height: 36 }}>‹</button>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: 800, fontSize: '1.2rem' }}>{MONTHS[month]}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{year}</div>
                </div>
                <button onClick={() => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); }} className="btn-icon" style={{ background: 'var(--surface2)', borderRadius: 10, width: 36, height: 36 }}>›</button>
            </div>

            {/* Calendar Grid */}
            <div className="card" style={{ padding: 16, marginBottom: 20, background: 'var(--surface)', borderRadius: 20 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 12 }}>
                    {DAYS.map(d => <div key={d} style={{ textAlign: 'center', fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-muted)' }}>{d}</div>)}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                    {cells.map((day, idx) => {
                        if (!day) return <div key={idx} />;
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        const dayOrd = ordersByDateMap[dateStr] || [];
                        const isSelected = dateStr === selectedDate;
                        const isToday = dateStr === now.toISOString().slice(0, 10);

                        return (
                            <div key={idx} onClick={() => selectDay(day)} style={{
                                minHeight: 48, borderRadius: 12, padding: '6px 2px',
                                background: isSelected ? 'var(--primary)' : 'var(--bg2)',
                                border: isToday ? '1.5px solid var(--primary)' : '1.5px solid transparent',
                                cursor: 'pointer', textAlign: 'center',
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                                position: 'relative'
                            }}>
                                <span style={{ fontSize: '0.9rem', fontWeight: isToday || isSelected ? 800 : 500, color: isSelected ? 'white' : isToday ? 'var(--primary)' : 'var(--text)' }}>{day}</span>
                                {dayOrd.length > 0 && (
                                    <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center', maxWidth: '80%' }}>
                                        {dayOrd.slice(0, 3).map((o, i) => (
                                            <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: isSelected ? 'white' : STATUS_COLOR[o.status] || 'gray' }} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20, justifyContent: 'center' }}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[k] }} />
                        {v}
                    </div>
                ))}
            </div>

            {/* Order List for Selected Day */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                    📜 {new Date(selectedDate + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 600 }}>{dayOrders.length} order</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {dayOrders.length === 0 ? (
                    <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', background: 'var(--surface2)', border: '1px dashed var(--border)' }}>
                        Tidak ada pesanan pada tanggal ini
                    </div>
                ) : dayOrders.map(o => (
                    <div key={o.id} className="card" onClick={() => { setDetailOrder(o); setIsMinimized(false); }} style={{
                        padding: '14px 16px', borderRadius: 16, cursor: 'pointer',
                        background: 'linear-gradient(to right, var(--surface), var(--surface2))',
                        borderLeft: `4px solid ${STATUS_COLOR[o.status]}`,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--primary)', letterSpacing: 0.5 }}>{o.kode}</span>
                                <span style={{ fontSize: '0.65rem', fontWeight: 800, padding: '2px 8px', borderRadius: 20, background: STATUS_COLOR[o.status] + '22', color: STATUS_COLOR[o.status], textTransform: 'uppercase' }}>{STATUS_LABEL[o.status]}</span>
                            </div>
                            <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{o.customers?.nama} <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.8rem' }}>· {formatTime(o.created_at)}</span></div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 900, color: 'var(--accent)', fontSize: '1rem' }}>{formatRp(o.total_idr)}</div>
                            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: o.status_pembayaran === 'lunas' ? 'var(--success)' : 'var(--warning)' }}>
                                {o.status_pembayaran === 'lunas' ? '✓ Lunas' : 'Belum Lunas'}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Detail Order Modal */}
            {detailOrder && (
                <>
                    {!isMinimized && <div className="status-menu-overlay" onClick={() => setDetailOrder(null)} style={{ opacity: 0.8 }} />}
                    <div
                        onDoubleClick={toggleMinimize}
                        style={{
                            position: 'fixed', bottom: 0, left: '50%',
                            transform: `translateX(-50%) ${isMinimized ? 'translateY(calc(100% - 60px))' : 'translateY(0)'}`,
                            width: '100%', maxWidth: 500, zIndex: 1000,
                            padding: isMinimized ? '12px 16px 20px' : '20px 16px 40px',
                            background: 'var(--bg)',
                            borderTopLeftRadius: 30, borderTopRightRadius: 30,
                            boxShadow: '0 -10px 40px rgba(0,0,0,0.5)',
                            maxHeight: isMinimized ? '60px' : '85vh',
                            overflowY: isMinimized ? 'hidden' : 'auto',
                            transition: 'all 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                            cursor: 'pointer'
                        }}
                    >
                        <div
                            onClick={toggleMinimize}
                            style={{ width: 40, height: 4, background: 'var(--border)', borderRadius: 2, margin: '0 auto 12px', opacity: 0.5 }}
                        />

                        {isMinimized ? (
                            <div onClick={toggleMinimize} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontSize: '0.85rem', fontWeight: 800 }}>
                                    <span style={{ color: 'var(--primary)' }}>#{detailOrder.kode}</span> · {detailOrder.customers?.nama}
                                </div>
                                <div style={{ fontSize: '0.9rem' }}>🔼</div>
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <button className="btn btn-icon" onClick={toggleMinimize} style={{ background: 'var(--surface2)', borderRadius: 10, fontSize: '0.8rem', padding: '4px 12px' }}>➖ Minimize</button>
                                    <button className="btn btn-icon" onClick={() => setDetailOrder(null)} style={{ background: 'var(--surface2)', borderRadius: 10, fontSize: '1rem', width: 32, height: 32 }}>✕</button>
                                </div>
                                <OrderCard
                                    order={detailOrder}
                                    updating={updating === detailOrder.id}
                                    onUpdateStatus={(st) => handleStatusUpdate(detailOrder, st)}
                                    onReprint={() => setPrintOrder(detailOrder)}
                                    onDelete={() => handleDeleteOrder(detailOrder.id, detailOrder.kode)}
                                    onEdit={null}
                                    onLunasi={null}
                                    isAdmin={profile?.role === 'owner' || profile?.global_role === 'admin'}
                                />
                            </>
                        )}
                    </div>
                </>
            )}

            {printOrder && <ReceiptModal order={printOrder} onClose={() => setPrintOrder(null)} isPrint />}
            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
