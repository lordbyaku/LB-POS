import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const SATUAN_OPTIONS = ['kg', 'pcs', 'lusin', 'pasang', 'item'];

function ServiceForm({ initial = {}, tenantId, onSave, onCancel }) {
    const [nama, setNama] = useState(initial.nama_layanan || '');
    const [satuan, setSatuan] = useState(initial.satuan || 'kg');
    const [harga, setHarga] = useState(initial.harga_default_idr ? String(initial.harga_default_idr) : '');
    const [estimasi, setEstimasi] = useState(initial.estimasi_jam ? String(initial.estimasi_jam) : '');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        const parsedHarga = parseInt(harga, 10);
        if (!nama.trim()) { setError('Nama layanan wajib diisi.'); return; }
        if (isNaN(parsedHarga) || parsedHarga <= 0) { setError('Harga harus angka positif.'); return; }

        setSaving(true);
        const payload = {
            tenant_id: tenantId,
            nama_layanan: nama.trim(),
            satuan,
            harga_default_idr: parsedHarga,
            estimasi_jam: estimasi ? parseInt(estimasi, 10) : null,
        };

        let err;
        if (initial.id) {
            ({ error: err } = await supabase.from('services').update(payload).eq('id', initial.id));
        } else {
            ({ error: err } = await supabase.from('services').insert(payload));
        }

        if (err) setError(err.message);
        else onSave();
        setSaving(false);
    }

    return (
        <form className="form-card" onSubmit={handleSubmit}>
            <h3>{initial.id ? '✏️ Edit Layanan' : '➕ Tambah Layanan'}</h3>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="form-group">
                <label>Nama Layanan *</label>
                <input type="text" value={nama} onChange={e => setNama(e.target.value)} placeholder="Contoh: Cuci + Setrika" required />
            </div>

            <div className="form-row">
                <div className="form-group">
                    <label>Satuan *</label>
                    <select value={satuan} onChange={e => setSatuan(e.target.value)}>
                        {SATUAN_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label>Harga Default (Rp/{satuan}) *</label>
                    <input type="number" value={harga} onChange={e => setHarga(e.target.value)} placeholder="5000" min="0" required />
                </div>
            </div>

            <div className="form-group">
                <label>Estimasi Waktu (jam)</label>
                <input type="number" value={estimasi} onChange={e => setEstimasi(e.target.value)} placeholder="24" min="1" />
            </div>

            <div className="form-actions">
                <button type="button" className="btn btn-secondary" onClick={onCancel}>Batal</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan...' : '💾 Simpan'}</button>
            </div>
        </form>
    );
}

const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');

export default function ServicesPage({ tenantId }) {
    const [services, setServices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editService, setEditService] = useState(null); // null = add new
    const [toast, setToast] = useState('');

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

    const loadServices = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from('services')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('nama_layanan');
        setServices(data || []);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        if (tenantId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadServices();
        }
    }, [tenantId, loadServices]);

    async function handleToggleActive(service) {
        const { error: e } = await supabase
            .from('services')
            .update({ aktif: !service.aktif })
            .eq('id', service.id);
        if (e) showToast('❌ ' + e.message);
        else {
            showToast(service.aktif ? '⏸ Layanan dinonaktifkan' : '✅ Layanan diaktifkan');
            loadServices();
        }
    }

    async function handleDelete(service) {
        if (!window.confirm(`Hapus layanan "${service.nama_layanan}"? Pesanan lama yang merujuk layanan ini tidak akan terpengaruh.`)) return;
        const { error: e } = await supabase.from('services').delete().eq('id', service.id);
        if (e) showToast('❌ Gagal hapus: ' + e.message);
        else { showToast('🗑️ Layanan dihapus.'); loadServices(); }
    }

    function handleSaved() {
        showToast('✅ Layanan berhasil disimpan!');
        setShowForm(false);
        setEditService(null);
        loadServices();
    }

    function handleEdit(svc) {
        setEditService(svc);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function handleAddNew() {
        setEditService(null);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    const activeCount = services.filter(s => s.aktif).length;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>Layanan</h2>
                    <p className="text-muted">{activeCount} layanan aktif</p>
                </div>
                {!showForm && (
                    <button className="btn btn-primary" onClick={handleAddNew}>+ Tambah</button>
                )}
            </div>

            {showForm && (
                <ServiceForm
                    key={editService?.id || 'new'}
                    initial={editService || {}}
                    tenantId={tenantId}
                    onSave={handleSaved}
                    onCancel={() => { setShowForm(false); setEditService(null); }}
                />
            )}

            {loading ? (
                <div className="loading-state"><div className="spinner" /></div>
            ) : services.length === 0 ? (
                <div className="empty-state">
                    <span>🧺</span>
                    <p>Belum ada layanan. Tambah layanan pertama!</p>
                </div>
            ) : (
                <div className="services-list">
                    {services.map(svc => (
                        <div className={`service-card ${!svc.aktif ? 'service-inactive' : ''}`} key={svc.id}>
                            <div className="service-card-main">
                                <div className="service-info">
                                    <div className="service-name">{svc.nama_layanan}</div>
                                    <div className="service-meta">
                                        <span className="service-price">{formatRp(svc.harga_default_idr)}/{svc.satuan}</span>
                                        {svc.estimasi_jam && <span className="service-eta">⏱ ~{svc.estimasi_jam} jam</span>}
                                    </div>
                                </div>
                                <span className={`badge-service ${svc.aktif ? 'aktif' : 'nonaktif'}`}>
                                    {svc.aktif ? '✅ Aktif' : '⏸ Nonaktif'}
                                </span>
                            </div>

                            <div className="service-actions">
                                <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(svc)}>✏️ Edit</button>
                                <button
                                    className={`btn btn-sm ${svc.aktif ? 'btn-warning' : 'btn-success'}`}
                                    onClick={() => handleToggleActive(svc)}
                                >
                                    {svc.aktif ? '⏸ Nonaktifkan' : '✅ Aktifkan'}
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => handleDelete(svc)}>🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
