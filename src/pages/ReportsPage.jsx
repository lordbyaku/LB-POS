import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const formatShort = (d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '';

function toISO(d) { return d; }

const DATE_SHORTCUTS = [
    { label: 'Hari Ini', fn: () => { const t = new Date().toISOString().split('T')[0]; return [t, t]; } },
    { label: '7 Hari', fn: () => { const t = new Date(), f = new Date(t); f.setDate(t.getDate() - 6); return [f.toISOString().split('T')[0], t.toISOString().split('T')[0]]; } },
    { label: 'Bulan Ini', fn: () => { const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth(), 1); return [f.toISOString().split('T')[0], t.toISOString().split('T')[0]]; } },
    { label: 'Bulan Lalu', fn: () => { const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth() - 1, 1); const e = new Date(t.getFullYear(), t.getMonth(), 0); return [f.toISOString().split('T')[0], e.toISOString().split('T')[0]]; } },
    { label: '30 Hari', fn: () => { const t = new Date(), f = new Date(t); f.setDate(t.getDate() - 29); return [f.toISOString().split('T')[0], t.toISOString().split('T')[0]]; } },
];

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem' }}>
                <div style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{formatShort(label)}</div>
                <div style={{ color: 'var(--primary)', fontWeight: 700 }}>{formatRp(payload[0]?.value)}</div>
                {payload[1] && <div style={{ color: '#ef4444', fontWeight: 600 }}>-{formatRp(payload[1]?.value)}</div>}
            </div>
        );
    }
    return null;
};

export default function ReportsPage({ tenantId }) {
    const [tab, setTab] = useState('summary');
    const [harian, setHarian] = useState([]);
    const [expenses, setExpenses] = useState([]);
    const [belumDiambil, setBelumDiambil] = useState([]);
    const [repeatCustomer, setRepeatCustomer] = useState([]);
    const [serviceStats, setServiceStats] = useState([]);
    const [loading, setLoading] = useState(false);

    const [dateFrom, setDateFrom] = useState(() => {
        const d = new Date(); d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    });
    const [dateTo, setDateTo] = useState(() => new Date().toISOString().split('T')[0]);

    function applyShortcut(fn) {
        const [f, t] = fn();
        setDateFrom(f);
        setDateTo(t);
    }

    const loadHarian = useCallback(async () => {
        const { data } = await supabase.from('v_laporan_harian').select('*').eq('tenant_id', tenantId)
            .gte('tanggal', toISO(dateFrom)).lte('tanggal', toISO(dateTo)).order('tanggal', { ascending: true });
        setHarian(data || []);
    }, [tenantId, dateFrom, dateTo]);

    const loadExpenses = useCallback(async () => {
        const { data } = await supabase.from('expenses').select('*').eq('tenant_id', tenantId)
            .gte('tanggal', dateFrom).lte('tanggal', dateTo).order('tanggal', { ascending: true });
        setExpenses(data || []);
    }, [tenantId, dateFrom, dateTo]);

    const loadBelumDiambil = useCallback(async () => {
        const { data } = await supabase.from('v_order_belum_diambil').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });
        setBelumDiambil(data || []);
    }, [tenantId]);

    const loadRepeatCustomer = useCallback(async () => {
        const { data } = await supabase.from('v_repeat_customer').select('*').eq('tenant_id', tenantId).order('total_order', { ascending: false }).limit(50);
        setRepeatCustomer(data || []);
    }, [tenantId]);

    const loadServiceStats = useCallback(async () => {
        const { data, error } = await supabase
            .from('order_items')
            .select(`jumlah, subtotal, service_id, services(nama_layanan, satuan), orders!inner(created_at, status)`)
            .eq('orders.tenant_id', tenantId)
            .gte('orders.created_at', dateFrom + 'T00:00:00')
            .lte('orders.created_at', dateTo + 'T23:59:59');
        if (error) throw error;
        const statsMap = {};
        data?.forEach(item => {
            const sId = item.service_id;
            if (!statsMap[sId]) statsMap[sId] = { nama: item.services?.nama_layanan || 'Unknown', satuan: item.services?.satuan || '', count: 0, total_qty: 0, total_omzet: 0 };
            statsMap[sId].count += 1;
            statsMap[sId].total_qty += Number(item.jumlah || 0);
            statsMap[sId].total_omzet += Number(item.subtotal || 0);
        });
        setServiceStats(Object.values(statsMap).sort((a, b) => b.total_qty - a.total_qty));
    }, [tenantId, dateFrom, dateTo]);

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            if (tab === 'summary') await Promise.all([loadHarian(), loadExpenses()]);
            else if (tab === 'belum') await loadBelumDiambil();
            else if (tab === 'repeat') await loadRepeatCustomer();
            else if (tab === 'services') await loadServiceStats();
        } catch (e) {
            console.error('Load report error:', e);
        }
        setLoading(false);
    }, [tab, loadHarian, loadExpenses, loadBelumDiambil, loadRepeatCustomer, loadServiceStats]);

    useEffect(() => {
        if (!tenantId) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, [tenantId, loadData]);

    const totalOmzet = harian.reduce((s, r) => s + (r.omzet_idr || 0), 0);
    const totalExp = expenses.reduce((s, r) => s + (r.jumlah_idr || 0), 0);
    const netProfit = totalOmzet - totalExp;

    // Build chart data merging harian + expenses by date
    const chartData = harian.map(r => {
        const dayExp = expenses.filter(e => e.tanggal === r.tanggal).reduce((s, e) => s + e.jumlah_idr, 0);
        return { tanggal: r.tanggal, omzet: r.omzet_idr || 0, pengeluaran: dayExp };
    });

    async function exportToCSV() {
        const { data: detailOrders } = await supabase
            .from('orders')
            .select(`kode, created_at, total_idr, status_pembayaran, customers(nama, no_telepon)`)
            .eq('tenant_id', tenantId)
            .gte('created_at', dateFrom + 'T00:00:00')
            .lte('created_at', dateTo + 'T23:59:59')
            .order('created_at', { ascending: false });
        if (!detailOrders || detailOrders.length === 0) return alert('Tidak ada data untuk diekspor');
        let csv = "data:text/csv;charset=utf-8,Tanggal,No Order,Pelanggan,No WA,Total (IDR),Status Bayar\n";
        detailOrders.forEach(o => {
            csv += `"${new Date(o.created_at).toLocaleDateString()}","${o.kode}","${o.customers?.nama || ''}","${o.customers?.no_telepon || ''}",${o.total_idr},"${o.status_pembayaran || ''}"\n`;
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csv));
        link.setAttribute("download", `laporan_${dateFrom}_${dateTo}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }

    async function exportExpenseCSV() {
        const { data: exp } = await supabase.from('expenses').select('*')
            .eq('tenant_id', tenantId).gte('tanggal', dateFrom).lte('tanggal', dateTo).order('tanggal', { ascending: false });
        if (!exp || exp.length === 0) return alert('Tidak ada data pengeluaran');
        let csv = "data:text/csv;charset=utf-8,Tanggal,Kategori,Jumlah (IDR),Keterangan\n";
        exp.forEach(e => { csv += `"${e.tanggal}","${e.kategori}",${e.jumlah_idr},"${e.keterangan || ''}"\n`; });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csv));
        link.setAttribute("download", `pengeluaran_${dateFrom}_${dateTo}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }

    return (
        <div className="page">
            <div className="page-header">
                <h2>Laporan & Analitik</h2>
                <div style={{ display: 'flex', gap: 6 }}>
                    {tab === 'summary' && harian.length > 0 && (
                        <>
                            <button className="btn btn-secondary btn-sm" onClick={exportToCSV}>📥 Order CSV</button>
                            <button className="btn btn-secondary btn-sm" onClick={exportExpenseCSV}>📥 Biaya CSV</button>
                        </>
                    )}
                </div>
            </div>

            <div className="filter-scroll" style={{ marginBottom: 15 }}>
                <div className="filter-tabs">
                    <button className={`tab-btn ${tab === 'summary' ? 'active' : ''}`} onClick={() => setTab('summary')}>Keuangan</button>
                    <button className={`tab-btn ${tab === 'services' ? 'active' : ''}`} onClick={() => setTab('services')}>Layanan</button>
                    <button className={`tab-btn ${tab === 'belum' ? 'active' : ''}`} onClick={() => setTab('belum')}>Belum Diambil</button>
                    <button className={`tab-btn ${tab === 'repeat' ? 'active' : ''}`} onClick={() => setTab('repeat')}>Pelanggan</button>
                </div>
            </div>

            {(tab === 'summary' || tab === 'services') && (
                <>
                    {/* Date shortcuts */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {DATE_SHORTCUTS.map(s => (
                            <button
                                key={s.label}
                                onClick={() => applyShortcut(s.fn)}
                                style={{
                                    fontSize: '0.75rem', padding: '4px 12px', borderRadius: 20,
                                    background: 'var(--surface)', border: '1px solid var(--border)',
                                    color: 'var(--text)', cursor: 'pointer', transition: 'all 0.15s',
                                    fontWeight: 500
                                }}
                            >{s.label}</button>
                        ))}
                    </div>

                    <div className="date-filter card" style={{ padding: 10, display: 'flex', gap: 10, alignItems: 'center', marginBottom: 15 }}>
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ flex: 1 }} />
                        <span style={{ color: 'var(--text-dim)' }}>s/d</span>
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ flex: 1 }} />
                    </div>
                </>
            )}

            {loading ? <div className="loading-state"><div className="spinner" /></div> : (
                <>
                    {tab === 'summary' && (
                        <>
                            <div className="stats-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 15 }}>
                                <div className="stat-card" style={{ background: 'var(--surface)' }}>
                                    <span className="stat-label">Omzet (Bruto)</span>
                                    <span className="stat-value" style={{ color: 'var(--primary)', fontSize: '1.1rem' }}>{formatRp(totalOmzet)}</span>
                                </div>
                                <div className="stat-card" style={{ background: 'var(--surface)' }}>
                                    <span className="stat-label">Pengeluaran</span>
                                    <span className="stat-value" style={{ color: 'var(--error)', fontSize: '1.1rem' }}>-{formatRp(totalExp)}</span>
                                </div>
                                <div className="stat-card" style={{ gridColumn: 'span 2', background: netProfit >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${netProfit >= 0 ? 'var(--success)' : 'var(--error)'}` }}>
                                    <span className="stat-label">Laba Bersih (Net)</span>
                                    <span className="stat-value" style={{ color: netProfit >= 0 ? 'var(--success)' : 'var(--error)', fontSize: '1.4rem', fontWeight: 'bold' }}>{formatRp(netProfit)}</span>
                                </div>
                            </div>

                            {/* Bar Chart */}
                            {chartData.length > 0 && (
                                <div className="card" style={{ padding: 16, marginBottom: 15 }}>
                                    <h4 style={{ margin: '0 0 12px', fontSize: '0.9rem' }}>📊 Grafik Omzet vs Pengeluaran</h4>
                                    <ResponsiveContainer width="100%" height={200}>
                                        <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                            <XAxis dataKey="tanggal" tickFormatter={formatShort} tick={{ fontSize: 10, fill: '#94a3b8' }} interval="preserveStartEnd" />
                                            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={v => v >= 1000000 ? (v / 1000000).toFixed(1) + 'jt' : v >= 1000 ? (v / 1000).toFixed(0) + 'rb' : v} />
                                            <Tooltip content={<CustomTooltip />} />
                                            <Bar dataKey="omzet" fill="#6366f1" radius={[4, 4, 0, 0]} name="Omzet" />
                                            <Bar dataKey="pengeluaran" fill="#ef4444" radius={[4, 4, 0, 0]} name="Pengeluaran" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                    <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: '0.75rem' }}>
                                        <span style={{ color: '#6366f1' }}>■ Omzet</span>
                                        <span style={{ color: '#ef4444' }}>■ Pengeluaran</span>
                                    </div>
                                </div>
                            )}

                            <div className="table-wrapper card">
                                <table className="report-table">
                                    <thead><tr><th>Tanggal</th><th>Order</th><th>Omzet</th></tr></thead>
                                    <tbody>
                                        {harian.slice().reverse().map((r, i) => (
                                            <tr key={i}>
                                                <td>{formatDate(r.tanggal)}</td>
                                                <td>{r.jumlah_order}</td>
                                                <td>{formatRp(r.omzet_idr)}</td>
                                            </tr>
                                        ))}
                                        {harian.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px', color: 'var(--text-dim)' }}>Tidak ada data dalam range ini</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}

                    {tab === 'services' && (
                        <div className="admin-list">
                            {serviceStats.length === 0 && (
                                <div className="card" style={{ padding: '20px', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    Belum ada data pesanan dalam periode ini.
                                </div>
                            )}
                            {serviceStats.map((s, i) => (
                                <div className="admin-card" key={i} style={{ marginBottom: 10 }}>
                                    <div className="admin-card-header" style={{ marginBottom: 5 }}>
                                        <div style={{ flex: 1 }}>
                                            <div className="admin-card-title">{s.nama}</div>
                                            <div className="admin-card-sub">{s.total_qty} {s.satuan} dari {s.count} pesanan</div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ color: 'var(--accent)', fontWeight: 'bold' }}>{formatRp(s.total_omzet)}</div>
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Total Omzet</div>
                                        </div>
                                    </div>
                                    <div style={{ height: 4, background: 'var(--bg3)', borderRadius: 2, overflow: 'hidden' }}>
                                        <div style={{ height: '100%', background: 'var(--primary)', width: `${(s.total_qty / serviceStats[0].total_qty) * 100}%` }} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {tab === 'belum' && (
                        <div className="table-wrapper card">
                            <table className="report-table">
                                <thead><tr><th>Pelanggan</th><th>Status</th><th>Total</th></tr></thead>
                                <tbody>
                                    {belumDiambil.map(r => (
                                        <tr key={r.id}>
                                            <td>{r.customer_nama}<br /><small>{r.kode}</small></td>
                                            <td><span className={`badge badge-${r.status}`}>{r.status.replace(/_/g, ' ')}</span></td>
                                            <td>{formatRp(r.total_idr)}</td>
                                        </tr>
                                    ))}
                                    {belumDiambil.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px' }}>Semua sudah diambil! 🎉</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {tab === 'repeat' && (
                        <div className="table-wrapper card">
                            <table className="report-table">
                                <thead><tr><th>Nama</th><th>Order</th><th>Total</th></tr></thead>
                                <tbody>
                                    {repeatCustomer.map(r => (
                                        <tr key={r.customer_id}>
                                            <td>{r.nama}</td>
                                            <td><strong>{r.total_order}x</strong></td>
                                            <td>{formatRp(r.total_belanja_idr)}</td>
                                        </tr>
                                    ))}
                                    {repeatCustomer.length === 0 && <tr><td colSpan="3" style={{ textAlign: 'center', padding: '20px' }}>Belum ada data pelanggan.</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
