import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import LicenseBanner from '../components/LicenseBanner';

const CATEGORIES = ['Deterjen/Sabun', 'Listrik/Air', 'Gaji Karyawan', 'Sewa Tempat', 'Maintenance', 'Lainnya'];
const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');

export default function ExpensePage({ tenantId, licenseStatus, profile }) {
    const [expenses, setExpenses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [kategori, setKategori] = useState(CATEGORIES[0]);
    const [jumlah, setJumlah] = useState('');
    const [ket, setKet] = useState('');
    const [tanggal, setTanggal] = useState(new Date().toISOString().split('T')[0]);
    const [toast, setToast] = useState('');

    // Summary by category
    const categoryTotals = CATEGORIES.reduce((acc, cat) => {
        acc[cat] = expenses.filter(e => e.kategori === cat).reduce((s, e) => s + e.jumlah_idr, 0);
        return acc;
    }, {});
    const grandTotal = expenses.reduce((s, e) => s + e.jumlah_idr, 0);

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const loadExpenses = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from('expenses').select('*')
            .eq('tenant_id', tenantId)
            .order('tanggal', { ascending: false })
            .limit(100);
        setExpenses(data || []);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadExpenses();
    }, [tenantId, loadExpenses]);

    async function handleSubmit(e) {
        e.preventDefault();
        if (licenseStatus === 'kedaluwarsa') return;
        setSubmitting(true);
        const { error } = await supabase.from('expenses').insert({
            tenant_id: tenantId, kategori, jumlah_idr: parseInt(jumlah), keterangan: ket, tanggal, created_by: profile?.id
        });
        if (!error) { setJumlah(''); setKet(''); loadExpenses(); showToast('✅ Pengeluaran ditambahkan'); }
        else showToast('❌ Gagal: ' + error.message);
        setSubmitting(false);
    }

    async function handleDelete(id) {
        if (!confirm('Hapus catatan pengeluaran ini?')) return;
        await supabase.from('expenses').delete().eq('id', id);
        loadExpenses();
        showToast('🗑️ Dihapus');
    }

    function exportCSV() {
        if (expenses.length === 0) return alert('Tidak ada data pengeluaran');
        let csv = "data:text/csv;charset=utf-8,Tanggal,Kategori,Jumlah (IDR),Keterangan\n";
        expenses.forEach(e => {
            csv += `"${e.tanggal}","${e.kategori}",${e.jumlah_idr},"${e.keterangan || ''}"\n`;
        });
        const link = document.createElement("a");
        link.setAttribute("href", encodeURI(csv));
        link.setAttribute("download", `pengeluaran_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link); link.click(); document.body.removeChild(link);
    }

    return (
        <div className="page">
            <LicenseBanner status={licenseStatus} />
            <div className="page-header">
                <div>
                    <h2>Pengeluaran</h2>
                    <p className="text-muted">Catat biaya operasional</p>
                </div>
                {expenses.length > 0 && (
                    <button className="btn btn-secondary btn-sm" onClick={exportCSV}>📥 Export CSV</button>
                )}
            </div>

            {/* Summary Cards */}
            {!loading && expenses.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div className="stat-card" style={{ gridColumn: 'span 2', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                        <span className="stat-label">Total Pengeluaran (100 Terakhir)</span>
                        <span className="stat-value" style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '1.2rem' }}>-{formatRp(grandTotal)}</span>
                    </div>
                    {Object.entries(categoryTotals).filter(([, v]) => v > 0).map(([cat, val]) => (
                        <div key={cat} className="card" style={{ padding: '8px 12px' }}>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{cat}</div>
                            <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: '0.9rem' }}>-{formatRp(val)}</div>
                        </div>
                    ))}
                </div>
            )}

            <form onSubmit={handleSubmit} className="form-card">
                <div className="form-row">
                    <div className="form-group">
                        <label>Tanggal</label>
                        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Kategori</label>
                        <select value={kategori} onChange={e => setKategori(e.target.value)}>
                            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
                <div className="form-group">
                    <label>Jumlah (Rp)</label>
                    <input type="number" value={jumlah} onChange={e => setJumlah(e.target.value)} placeholder="0" required />
                </div>
                <div className="form-group">
                    <label>Keterangan</label>
                    <input type="text" value={ket} onChange={e => setKet(e.target.value)} placeholder="Misal: Beli Rinso 5kg" />
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={submitting || licenseStatus === 'kedaluwarsa'}>
                    {submitting ? 'Menyimpan...' : '➕ Tambah Pengeluaran'}
                </button>
            </form>

            <div className="expense-list" style={{ marginTop: 20 }}>
                <h3>Riwayat Pengeluaran</h3>
                {loading ? <p>Memuat...</p> : (
                    <div className="table-wrapper">
                        <table className="report-table">
                            <thead>
                                <tr><th>Tgl</th><th>Kategori</th><th>Jumlah</th><th>Ket</th><th>Aksi</th></tr>
                            </thead>
                            <tbody>
                                {expenses.map(ex => (
                                    <tr key={ex.id}>
                                        <td style={{ whiteSpace: 'nowrap' }}>{ex.tanggal}</td>
                                        <td>{ex.kategori}</td>
                                        <td style={{ color: 'var(--error)', whiteSpace: 'nowrap' }}>- Rp {ex.jumlah_idr.toLocaleString('id-ID')}</td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{ex.keterangan || '-'}</td>
                                        <td><button className="btn-icon" onClick={() => handleDelete(ex.id)}>🗑️</button></td>
                                    </tr>
                                ))}
                                {expenses.length === 0 && <tr><td colSpan="5" style={{ textAlign: 'center' }}>Belum ada pengeluaran</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
