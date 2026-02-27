import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import LicenseBanner from '../components/LicenseBanner';

export default function InventoryPage({ tenantId, licenseStatus, profile }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [nama, setNama] = useState('');
    const [satuan, setSatuan] = useState('liter');
    const [stokMin, setStokMin] = useState('1');

    const loadInventory = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase.from('inventory_items').select('*').eq('tenant_id', tenantId).order('nama_barang');
        setItems(data || []);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        if (tenantId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadInventory();
        }
    }, [tenantId, loadInventory]);

    async function addProduct(e) {
        e.preventDefault();
        setSubmitting(true);
        const { error } = await supabase.from('inventory_items').insert({
            tenant_id: tenantId,
            nama_barang: nama,
            satuan,
            stok_minimum: parseFloat(stokMin)
        });
        if (!error) {
            setNama('');
            loadInventory();
        }
        setSubmitting(false);
    }

    async function updateStock(id, currentStock, type) {
        const amount = prompt(`Jumlah stok ${type === 'masuk' ? 'masuk' : 'keluar'}?`);
        if (!amount || isNaN(amount)) return;

        const val = parseFloat(amount);
        const newStock = type === 'masuk' ? currentStock + val : currentStock - val;

        const { error } = await supabase.from('inventory_items').update({ stok: newStock }).eq('id', id);
        if (!error) {
            await supabase.from('inventory_logs').insert({
                item_id: id, tenant_id: tenantId, tipe: type, jumlah: val, created_by: profile?.id
            });
            loadInventory();
        }
    }

    return (
        <div className="page">
            <LicenseBanner status={licenseStatus} />
            <div className="page-header">
                <h2>Inventaris Stok</h2>
                <p className="text-muted">Pantau deterjen & bahan laundry</p>
            </div>

            <form onSubmit={addProduct} className="form-card" style={{ marginBottom: 20 }}>
                <div className="form-row">
                    <input type="text" value={nama} onChange={e => setNama(e.target.value)} placeholder="Nama Barang (mis: Deterjen Liquid)" required />
                    <select value={satuan} onChange={e => setSatuan(e.target.value)}>
                        <option value="liter">Liter</option>
                        <option value="kg">Kg</option>
                        <option value="pcs">Pcs</option>
                    </select>
                </div>
                <div className="form-group">
                    <label>Stok Minimum (Peringatan)</label>
                    <input type="number" value={stokMin} onChange={e => setStokMin(e.target.value)} />
                </div>
                <button type="submit" className="btn btn-primary btn-full" disabled={submitting}>Tambah Produk</button>
            </form>

            <div className="inventory-grid">
                {loading ? <p>Memuat...</p> : items.map(item => (
                    <div key={item.id} className={`card inventory-card ${item.stok <= item.stok_minimum ? 'low-stock' : ''}`}>
                        <div className="inv-header">
                            <h4>{item.nama_barang}</h4>
                            <span className="badge">{item.satuan}</span>
                        </div>
                        <div className="inv-body">
                            <span className="stock-value">{item.stok}</span>
                            {item.stok <= item.stok_minimum && <span className="warning-text">⚠️ Stok kritis!</span>}
                        </div>
                        <div className="inv-actions">
                            <button className="btn btn-secondary btn-sm" onClick={() => updateStock(item.id, item.stok, 'masuk')}>➕ Stok</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => updateStock(item.id, item.stok, 'keluar')}>➖ Pakai</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
