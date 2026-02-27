import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import ReceiptModal from '../components/ReceiptModal';

export default function NewOrderPage({ tenantId, licenseStatus, profile }) {
    const [customers, setCustomers] = useState([]);
    const [isNewCustomer, setIsNewCustomer] = useState(false);
    const [selectedCustomerId, setSelectedCustomerId] = useState('');
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');

    // Fuzzy search states
    const [customerSearch, setCustomerSearch] = useState('');
    const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const customerSearchRef = useRef(null);
    const dropdownRef = useRef(null);

    const [services, setServices] = useState([]);
    const [serviceId, setServiceId] = useState('');
    const [weight, setWeight] = useState('');
    const [price, setPrice] = useState('');

    // Cart System
    const [cart, setCart] = useState([]);

    // Fitur Pro States
    const [paymentStatus, setPaymentStatus] = useState('belum_lunas');
    const [paymentMethod, setPaymentMethod] = useState('tunai');
    const [dpAmount, setDpAmount] = useState('');
    const [voucherCode, setVoucherCode] = useState('');
    const [discount, setDiscount] = useState(0);
    const [note, setNote] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [receiptOrder, setReceiptOrder] = useState(null);

    const canWrite = licenseStatus === 'aktif';

    const [vouchersEnabled, setVouchersEnabled] = useState(true);

    // Fuzzy filter logic
    function fuzzyMatch(str, pattern) {
        const s = str.toLowerCase();
        const p = pattern.toLowerCase();
        let si = 0;
        for (let pi = 0; pi < p.length; pi++) {
            while (si < s.length && s[si] !== p[pi]) si++;
            if (si >= s.length) return false;
            si++;
        }
        return true;
    }

    const filteredCustomers = customerSearch
        ? customers.filter(c =>
            fuzzyMatch(c.nama, customerSearch) ||
            fuzzyMatch(c.no_telepon, customerSearch)
        )
        : customers;

    function selectCustomer(c) {
        setSelectedCustomerId(c.id);
        setCustomerSearch(c.nama + ' (' + (c.poin_balance || 0) + ' pts)');
        setShowCustomerDropdown(false);
        setHighlightedIndex(-1);
    }

    function handleCustomerSearchKeyDown(e) {
        if (!showCustomerDropdown) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightedIndex(i => Math.min(i + 1, filteredCustomers.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightedIndex(i => Math.max(i - 1, 0));
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightedIndex >= 0 && filteredCustomers[highlightedIndex]) {
                selectCustomer(filteredCustomers[highlightedIndex]);
            }
        } else if (e.key === 'Escape') {
            setShowCustomerDropdown(false);
        }
    }

    // Close dropdown on outside click
    useEffect(() => {
        function handleClickOutside(e) {
            if (
                customerSearchRef.current && !customerSearchRef.current.contains(e.target) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target)
            ) {
                setShowCustomerDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadBasicData = useCallback(async () => {
        const { data: c } = await supabase.from('customers').select('*').eq('tenant_id', tenantId).order('nama');
        setCustomers(c || []);
        if (c?.length === 0) setIsNewCustomer(true);

        const { data: s } = await supabase.from('services').select('*').eq('tenant_id', tenantId).eq('aktif', true).order('nama_layanan');
        setServices(s || []);
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId) return;
        loadBasicData();
        // Check feature toggle
        supabase.from('tenant_settings').select('value').eq('tenant_id', tenantId).eq('key', 'feature_voucher').maybeSingle()
            .then(({ data, error }) => {
                if (!error && data) setVouchersEnabled(data.value === true);
                else setVouchersEnabled(true);
            });
    }, [tenantId, loadBasicData]);

    // Auto update price in input field
    useEffect(() => {
        const svc = services.find(s => s.id === serviceId);
        if (svc && weight) {
            setPrice(String(Math.round(svc.harga_default_idr * parseFloat(weight || 1))));
        }
    }, [serviceId, weight, services]);

    function addToCart() {
        if (!serviceId || !weight || !price) {
            alert('Pilih layanan dan isi berat/jumlah');
            return;
        }
        const svc = services.find(s => s.id === serviceId);
        const newItem = {
            id: Date.now(),
            service_id: serviceId,
            nama_item: svc ? svc.nama_layanan : 'Layanan Custom',
            harga_satuan: parseInt(price) / parseFloat(weight),
            jumlah: parseFloat(weight),
            satuan: svc ? svc.satuan : 'kg',
            subtotal: parseInt(price)
        };
        setCart([...cart, newItem]);
        // Reset current item input
        setServiceId('');
        setWeight('');
        setPrice('');
    }

    function removeFromCart(id) {
        setCart(cart.filter(item => item.id !== id));
    }

    const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);
    const finalDisplayPrice = cartTotal - discount;

    async function checkVoucher() {
        if (!voucherCode) return;
        const { data, error: vErr } = await supabase
            .from('vouchers')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('kode_voucher', voucherCode.toUpperCase().trim())
            .eq('is_active', true)
            .single();

        if (vErr || !data) {
            alert('Voucher tidak valid');
            setDiscount(0);
            return;
        }
        if (cartTotal < data.min_order) {
            alert(`Min. order Rp ${data.min_order.toLocaleString()}`);
            return;
        }
        const pot = data.tipe_potongan === 'persen' ? Math.round((cartTotal * data.nilai) / 100) : data.nilai;
        setDiscount(pot);
        alert(`Diskon Rp ${pot.toLocaleString()} terpasang!`);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!canWrite) return;
        if (cart.length === 0) {
            alert('Keranjang masih kosong');
            return;
        }
        setLoading(true);
        setError('');

        try {
            let customerId = selectedCustomerId;
            if (isNewCustomer) {
                const { data: cust, error: custErr } = await supabase
                    .from('customers')
                    .upsert({ tenant_id: tenantId, nama: name.trim(), no_telepon: phone.trim(), alamat: address.trim() }, { onConflict: 'tenant_id,no_telepon' })
                    .select().single();
                if (custErr) throw custErr;
                customerId = cust.id;
            }

            if (!customerId) throw new Error('Pilih pelanggan');

            const kode = 'LND-' + Date.now();
            const parsedDp = parseInt(dpAmount) || 0;

            // 1. Insert Order
            const { data: newOrder, error: orderErr } = await supabase
                .from('orders')
                .insert({
                    tenant_id: tenantId,
                    kode,
                    customer_id: customerId,
                    total_idr: finalDisplayPrice,
                    status: 'pesanan_masuk',
                    barcode_value: kode,
                    catatan: note || null,
                    status_pembayaran: paymentStatus === 'lunas' ? 'lunas' : 'belum_lunas',
                    metode_pembayaran: paymentMethod,
                    dibayar_idr: paymentStatus === 'lunas' ? finalDisplayPrice : parsedDp,
                    uang_muka_idr: parsedDp,
                    created_by: profile?.id
                })
                .select(`*, customers ( nama, no_telepon, alamat )`)
                .single();

            if (orderErr) throw orderErr;

            // 2. Insert Order Items (Cart)
            const itemsPayload = cart.map(item => ({
                tenant_id: tenantId,
                order_id: newOrder.id,
                service_id: item.service_id,
                nama_item: item.nama_item,
                harga_satuan: item.harga_satuan,
                jumlah: item.jumlah,
                satuan: item.satuan,
                subtotal: item.subtotal
            }));
            const { error: itemsErr } = await supabase.from('order_items').insert(itemsPayload);
            if (itemsErr) throw itemsErr;

            // Poin: 1 poin per 10rb
            const pts = Math.floor(finalDisplayPrice / 10000);
            if (pts > 0) {
                const curCust = customers.find(c => c.id === customerId);
                await supabase.from('customers').update({ poin_balance: (curCust?.poin_balance || 0) + pts }).eq('id', customerId);
            }

            // Audit Log
            await supabase.from('audit_logs').insert({
                tenant_id: tenantId, user_id: profile?.id, aksi: 'CREATE_ORDER', entitas: 'orders', entitas_id: newOrder.id, data_baru: newOrder
            });

            setReceiptOrder(newOrder);
            loadBasicData();
            // Reset
            setCart([]); setNote(''); setDpAmount(''); setVoucherCode(''); setDiscount(0);
        } catch (err) { alert(err.message); }
        setLoading(false);
    }

    return (
        <div className="page" style={{ paddingBottom: '100px' }}>
            <div className="page-header" style={{ marginBottom: 20 }}>
                <div>
                    <h2 style={{ fontSize: '1.6rem', fontWeight: 800 }}>Kasir Utama</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Buat pesanan baru dengan cepat & mudah</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {error && <div className="alert alert-error">{error}</div>}

                {/* Section: Pelanggan */}
                <div className="stat-card-premium" style={{
                    background: 'var(--surface)',
                    padding: 20,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h3 style={{ fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.2rem' }}>👥</span> Data Pelanggan
                        </h3>
                        <div className="toggle-group" style={{ maxWidth: '240px' }}>
                            <button type="button" className={`toggle-btn ${!isNewCustomer ? 'active' : ''}`} onClick={() => setIsNewCustomer(false)}>Pelanggan Lama</button>
                            <button type="button" className={`toggle-btn ${isNewCustomer ? 'active' : ''}`} onClick={() => setIsNewCustomer(true)}>Pelanggan Baru</button>
                        </div>
                    </div>

                    {!isNewCustomer ? (
                        <div style={{ position: 'relative' }}>
                            <div style={{ position: 'relative' }}>
                                <span style={{
                                    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                                    fontSize: '1rem', color: 'var(--text-muted)', pointerEvents: 'none', zIndex: 1
                                }}>🔍</span>
                                <input
                                    ref={customerSearchRef}
                                    type="text"
                                    value={customerSearch}
                                    onChange={e => {
                                        setCustomerSearch(e.target.value);
                                        setSelectedCustomerId('');
                                        setShowCustomerDropdown(true);
                                        setHighlightedIndex(-1);
                                    }}
                                    onFocus={() => setShowCustomerDropdown(true)}
                                    onKeyDown={handleCustomerSearchKeyDown}
                                    placeholder="Cari nama atau nomor handphone..."
                                    className="glass-input"
                                    style={{
                                        padding: '12px 14px 12px 42px',
                                        width: '100%',
                                        borderRadius: 'var(--radius-sm)',
                                        background: 'var(--bg3)',
                                        border: '1px solid var(--border)',
                                        color: 'var(--text)',
                                        fontSize: '0.95rem'
                                    }}
                                    autoComplete="off"
                                    required={!isNewCustomer && !selectedCustomerId}
                                />
                                {customerSearch && (
                                    <button
                                        type="button"
                                        onClick={() => { setCustomerSearch(''); setSelectedCustomerId(''); setShowCustomerDropdown(true); customerSearchRef.current?.focus(); }}
                                        style={{
                                            position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                                            background: 'var(--surface2)', border: 'none', color: 'var(--text-muted)',
                                            width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            cursor: 'pointer', fontSize: '0.6rem', zIndex: 1
                                        }}
                                    >✕</button>
                                )}
                            </div>

                            {showCustomerDropdown && (
                                <div ref={dropdownRef} style={{
                                    position: 'absolute', top: 'calc(100% + 8px)', left: 0, right: 0,
                                    background: 'var(--surface2)', border: '1px solid var(--border)',
                                    borderRadius: 'var(--radius-sm)', zIndex: 999, maxHeight: 250, overflowY: 'auto',
                                    boxShadow: '0 12px 30px rgba(0,0,0,0.4)', padding: 6
                                }}>
                                    {filteredCustomers.length === 0 ? (
                                        <div style={{ padding: '20px', color: 'var(--text-dim)', fontSize: '0.9rem', textAlign: 'center' }}>
                                            {customerSearch ? `Tidak ada hasil untuk "${customerSearch}"` : 'Ketik untuk mencari pelanggan'}
                                        </div>
                                    ) : (
                                        filteredCustomers.map((c, idx) => (
                                            <div
                                                key={c.id}
                                                onMouseDown={() => selectCustomer(c)}
                                                onMouseEnter={() => setHighlightedIndex(idx)}
                                                style={{
                                                    padding: '10px 14px',
                                                    cursor: 'pointer',
                                                    borderRadius: 8,
                                                    background: idx === highlightedIndex ? 'var(--primary-glow)' : selectedCustomerId === c.id ? 'rgba(88, 153, 255, 0.15)' : 'transparent',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    marginBottom: 2
                                                }}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.92rem' }}>{c.nama}</div>
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{c.no_telepon}</div>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <span style={{
                                                        fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.15)',
                                                        color: 'var(--warning)', padding: '2px 8px', borderRadius: 20,
                                                        fontWeight: 700
                                                    }}>⭐ {c.poin_balance || 0}</span>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="form-group">
                                    <label>Nama Lengkap</label>
                                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Masukkan nama..." required />
                                </div>
                                <div className="form-group">
                                    <label>WhatsApp</label>
                                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="08..." required />
                                </div>
                            </div>
                            <div className="form-group">
                                <label>Alamat Lengkap</label>
                                <textarea
                                    value={address}
                                    onChange={e => setAddress(e.target.value)}
                                    placeholder="Masukkan alamat tinggal pelanggan..."
                                    style={{ minHeight: '60px', padding: '12px' }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Section: Layanan */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 16 }}>
                    <div style={{
                        background: 'var(--surface)',
                        padding: 20,
                        borderRadius: 'var(--radius)',
                        border: '1px solid var(--border)',
                        boxShadow: 'var(--shadow-sm)'
                    }}>
                        <h3 style={{ fontSize: '1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: '1.2rem' }}>🧺</span> Pilih Layanan
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div className="form-group">
                                <label>Jenis Layanan</label>
                                <select value={serviceId} onChange={e => setServiceId(e.target.value)}>
                                    <option value="">-- Pilih Layanan Tersedia --</option>
                                    {services.map(s => <option key={s.id} value={s.id}>{s.nama_layanan} (Rp {s.harga_default_idr.toLocaleString()}/{s.satuan})</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                                <div className="form-group">
                                    <label>Berat / Jumlah</label>
                                    <input type="number" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Contoh: 2.5" step="0.1" />
                                </div>
                                <div className="form-group">
                                    <label>Harga (Otomatis)</label>
                                    <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="Rp" />
                                </div>
                            </div>
                            <button type="button" className="btn btn-secondary" onClick={addToCart} style={{ marginTop: 8, padding: 12, fontWeight: 700, borderRadius: 'var(--radius-sm)' }}>
                                📥 Masukkan Keranjang
                            </button>
                        </div>
                    </div>

                    {/* Cart Preview */}
                    <div style={{
                        background: 'rgba(88, 153, 255, 0.05)',
                        padding: 20,
                        borderRadius: 'var(--radius)',
                        border: '1px dashed var(--primary)',
                        display: 'flex',
                        flexDirection: 'column'
                    }}>
                        <h3 style={{ fontSize: '0.9rem', marginBottom: 12, color: 'var(--primary)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Keranjang</h3>
                        <div style={{ flex: 1, overflowY: 'auto', maxHeight: '200px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {cart.length === 0 ? (
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8, opacity: 0.5 }}>
                                    <span style={{ fontSize: '1.5rem' }}>🛒</span>
                                    <span style={{ fontSize: '0.75rem', textAlign: 'center' }}>Belum ada item terpilih</span>
                                </div>
                            ) : (
                                cart.map(item => (
                                    <div key={item.id} style={{
                                        background: 'var(--surface2)',
                                        padding: '10px 12px',
                                        borderRadius: 10,
                                        fontSize: '0.85rem',
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        border: '1px solid var(--border)'
                                    }}>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.nama_item}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.jumlah} {item.satuan} @ Rp {(item.harga_satuan || 0).toLocaleString()}</div>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontWeight: 800, color: 'var(--primary)' }}>Rp {item.subtotal.toLocaleString()}</span>
                                            <button type="button" onClick={() => removeFromCart(item.id)} style={{ padding: 4, background: 'rgba(239, 68, 68, 0.1)', border: 'none', color: 'var(--error)', cursor: 'pointer', borderRadius: 4, fontSize: '0.6rem' }}>✕</button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                        {cart.length > 0 && (
                            <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--primary-glow)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--primary)' }}>Subtotal:</span>
                                <span style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text)' }}>Rp {cartTotal.toLocaleString()}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Section: Pembayaran */}
                <div style={{
                    background: 'var(--surface)',
                    padding: 20,
                    borderRadius: 'var(--radius)',
                    border: '1px solid var(--border)',
                    boxShadow: 'var(--shadow-sm)'
                }}>
                    <h3 style={{ fontSize: '1rem', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: '1.2rem' }}>💳</span> Pembayaran & Promo
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {vouchersEnabled && (
                                <div className="form-group">
                                    <label>Kode Voucher</label>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <input type="text" value={voucherCode} onChange={e => setVoucherCode(e.target.value)} placeholder="Masukkan kode..." style={{ textTransform: 'uppercase' }} />
                                        <button type="button" className="btn btn-secondary btn-sm" onClick={checkVoucher} style={{ padding: '0 16px' }}>Gunakan</button>
                                    </div>
                                </div>
                            )}
                            <div className="form-group">
                                <label>Catatan Pesanan</label>
                                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Contoh: Lipat, Jangan Wangi..." />
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 12 }}>
                                <div className="form-group">
                                    <label>Status Pembayaran</label>
                                    <select value={paymentStatus} onChange={e => setPaymentStatus(e.target.value)}>
                                        <option value="belum_lunas">❌ Belum Lunas</option>
                                        <option value="lunas">✅ Lunas</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label>Metode</label>
                                    <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
                                        <option value="tunai">Tunai</option>
                                        <option value="transfer">TF</option>
                                        <option value="qris">QRIS</option>
                                    </select>
                                </div>
                            </div>
                            {paymentStatus === 'belum_lunas' && (
                                <div className="form-group">
                                    <label>Uang Muka / DP (Rp)</label>
                                    <input type="number" value={dpAmount} onChange={e => setDpAmount(e.target.value)} placeholder="0" />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Final Pay Box */}
                    <div style={{
                        marginTop: 24,
                        background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                        padding: '24px',
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        boxShadow: '0 10px 25px var(--primary-glow)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        <div style={{ position: 'absolute', top: '-10px', right: '-10px', fontSize: '5rem', opacity: 0.1 }}>💰</div>
                        <div style={{ position: 'relative', zIndex: 1 }}>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'white', opacity: 0.9, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '1px' }}>Total Bayar</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'white' }}>Rp {finalDisplayPrice.toLocaleString('id-ID')}</div>
                            {discount > 0 && <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.8)', fontWeight: 600 }}>Tercatat potongan voucher Rp {discount.toLocaleString()}</div>}
                        </div>
                        <button type="submit" disabled={loading || cart.length === 0} className="btn-status-premium" style={{
                            width: 'auto',
                            padding: '16px 32px',
                            fontSize: '1rem',
                            background: 'white',
                            color: 'var(--primary)',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                            zIndex: 1
                        }}>
                            {loading ? 'Processing...' : '💳 Checkout'}
                        </button>
                    </div>
                </div>
            </form>

            <div style={{ marginTop: 20, textAlign: 'center', opacity: 0.5, fontSize: '0.75rem' }}>
                <p>Lisensi Anda bersifat <strong>{licenseStatus.toUpperCase()}</strong>. Pastikan sinkronisasi internet stabil.</p>
            </div>

            {receiptOrder && <ReceiptModal order={receiptOrder} onClose={() => setReceiptOrder(null)} />}
        </div>
    );
}
