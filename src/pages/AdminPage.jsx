import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const ROLE_LABELS = {
    admin: '🛡️ Admin',
    owner: '👑 Owner',
    kasir: '💰 Kasir',
    operator: '🔧 Operator',
};

const PAYMENT_STATUS_LABEL = {
    menunggu_verifikasi: '⏳ Menunggu',
    lunas: '✅ Lunas',
    ditolak: '❌ Ditolak',
};

export default function AdminPage({ profile }) {
    const [tab, setTab] = useState('tenants');
    const [tenants, setTenants] = useState([]);
    const [users, setUsers] = useState([]);
    const [pendingPayments, setPendingPayments] = useState([]);
    const [tenantSettings, setTenantSettings] = useState({}); // {tenantId: {vouchersEnabled: true}}
    const [loading, setLoading] = useState(false);
    const [toast, setToast] = useState('');
    const [error, setError] = useState('');

    const [showTenantForm, setShowTenantForm] = useState(false);
    const [newTenant, setNewTenant] = useState({ kode: '', nama: '', alamat: '', no_telepon: '' });
    const [showUserForm, setShowUserForm] = useState(false);
    const [newUser, setNewUser] = useState({ nama: '', no_telepon: '', email: '', password: '', tenant_id: '', role: 'kasir' });
    const [saving, setSaving] = useState(false);
    const [searchTenant, setSearchTenant] = useState('');

    const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

    const loadTenants = useCallback(async () => {
        const { data, error: e } = await supabase
            .from('tenants')
            .select(`*, licenses(status, end_at, is_active, package)`)
            .order('created_at', { ascending: false });

        if (e) setError(e.message);
        else {
            let tenantsData = data || [];

            try {
                // Fetch last active order for each tenant
                tenantsData = await Promise.all(tenantsData.map(async (t) => {
                    const { data: ord } = await supabase.from('orders').select('updated_at').eq('tenant_id', t.id).order('updated_at', { ascending: false }).limit(1);
                    return { ...t, lastActive: ord?.[0]?.updated_at };
                }));
            } catch (err) {
                console.warn('Gagal load last active:', err);
            }

            setTenants(tenantsData);
            // Load feature status for all tenants
            const { data: sets } = await supabase.from('tenant_settings').select('*').in('key', ['feature_voucher', 'feature_wa', 'feature_poin']);
            const settingsMap = {};
            sets?.forEach(s => {
                if (!settingsMap[s.tenant_id]) settingsMap[s.tenant_id] = {};
                if (s.key === 'feature_voucher') settingsMap[s.tenant_id].voucher = s.value === true;
                if (s.key === 'feature_wa') settingsMap[s.tenant_id].wa = s.value === true;
                if (s.key === 'feature_poin') settingsMap[s.tenant_id].poin = s.value === true;
            });
            setTenantSettings(settingsMap);
        }
    }, []);

    const loadUsers = useCallback(async () => {
        const { data, error: e } = await supabase
            .from('profiles')
            .select(`*, user_tenants(id, role, is_active, tenant_id, tenants(nama))`)
            .order('created_at', { ascending: false });
        if (e) setError(e.message);
        else setUsers(data || []);
    }, []);

    const loadPendingPayments = useCallback(async () => {
        const { data, error: e } = await supabase
            .from('payments')
            .select(`*, tenants(nama, kode)`)
            .order('created_at', { ascending: false });
        if (e) setError(e.message);
        else setPendingPayments(data || []);
    }, []);

    const loadTab = useCallback(async () => {
        setLoading(true);
        setError('');
        if (tab === 'tenants') await loadTenants();
        if (tab === 'users') await loadUsers();
        if (tab === 'payments') await loadPendingPayments();
        setLoading(false);
    }, [tab, loadTenants, loadUsers, loadPendingPayments]);

    useEffect(() => { loadTab(); }, [loadTab]);

    async function toggleFeature(tenantId, featureKey, currentValue) {
        setSaving(true);
        const newValue = !currentValue;
        const { error: e } = await supabase.from('tenant_settings').upsert({
            tenant_id: tenantId,
            key: featureKey,
            value: newValue
        }, { onConflict: 'tenant_id,key' });

        if (e) showToast('❌ Gagal: ' + e.message);
        else {
            showToast(`✅ Fitur ${featureKey.replace('feature_', '')} ${newValue ? 'Aktif' : 'Nonaktif'}`);
            setTenantSettings(prev => ({
                ...prev,
                [tenantId]: { ...prev[tenantId], [featureKey.replace('feature_', '')]: newValue }
            }));
        }
        setSaving(false);
    }


    async function handleApprovePayment(payment) {
        setSaving(true);
        try {
            // 1. Update Payment Status
            const { error: payErr } = await supabase
                .from('payments')
                .update({ status: 'lunas', paid_at: new Date().toISOString() })
                .eq('id', payment.id);

            if (payErr) throw payErr;

            // 2. Identify Duration (Default to bulanan if not specified)
            const isTahunan = payment.notes?.toLowerCase().includes('tahunan');
            const durationDays = isTahunan ? 365 : 30;
            const packageType = isTahunan ? 'tahunan' : 'bulanan';

            // 3. Check for the LATEST active license to extend its end_at
            const { data: currentLics } = await supabase
                .from('licenses')
                .select('*')
                .eq('tenant_id', payment.tenant_id)
                .eq('is_active', true)
                .order('end_at', { ascending: false })
                .limit(1);

            let startAt = new Date();
            const existingLic = currentLics?.[0];

            // If an active license exists (even if it's already in grace period or expired by date but still is_active=true)
            // stack the new duration on top of it.
            if (existingLic) {
                const currentEnd = new Date(existingLic.end_at);
                // If it's still valid in the future, start from its end.
                // If it's already past its end, start from now (to prevent empty gap) or its end? 
                // Usually "stacking" means adding to the end date even if it was yesterday.
                startAt = currentEnd > startAt ? currentEnd : startAt;
            }

            const endAt = new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

            // 4. Deactivate ALL previous licenses to ensure only ONE stays is_active: true
            await supabase.from('licenses')
                .update({ is_active: false })
                .eq('tenant_id', payment.tenant_id);

            // 5. Create the New Master License
            const { error: licErr } = await supabase.from('licenses').insert({
                tenant_id: payment.tenant_id,
                package: packageType,
                start_at: startAt.toISOString(),
                end_at: endAt.toISOString(),
                grace_days: 3,
                status: 'aktif',
                is_active: true,
            });

            if (licErr) throw licErr;

            showToast(`✅ Verifikasi berhasil! Lisensi diperpanjang s/d ${formatDate(endAt)}`);
            loadPendingPayments();
            // Trigger refresh in parent App component if provided
            if (window.refreshLicenseStatus) {
                window.refreshLicenseStatus();
            }
        } catch (e) {
            showToast('❌ Gagal: ' + e.message);
        }
        setSaving(false);
    }

    async function handleRejectPayment(payment) {
        const { error: e } = await supabase.from('payments').update({ status: 'ditolak' }).eq('id', payment.id);
        if (e) showToast('❌ ' + e.message);
        else { showToast('✅ Pembayaran ditolak.'); loadPendingPayments(); }
    }

    async function handleCreateTenant(e) {
        e.preventDefault();
        setSaving(true);
        const { error: e2 } = await supabase.from('tenants').insert({
            kode: newTenant.kode.toUpperCase().trim(),
            nama: newTenant.nama.trim(),
            alamat: newTenant.alamat.trim() || null,
            no_telepon: newTenant.no_telepon.trim() || null,
        });
        if (e2) { setError('Gagal buat tenant: ' + e2.message); }
        else {
            showToast('✅ Tenant berhasil dibuat!');
            setShowTenantForm(false);
            setNewTenant({ kode: '', nama: '', alamat: '', no_telepon: '' });
            loadTenants();
        }
        setSaving(false);
    }

    async function handleDeleteTenant(tenant) {
        const confirm1 = window.confirm(`Apakah Anda yakin ingin menghapus tenant "${tenant.nama}" (${tenant.kode})?\n\nPERINGATAN: Semua data pesanan, pelanggan, pengeluaran, dan pengaturan terkait tenant ini akan DIHAPUS PERMANEN!`);
        if (!confirm1) return;

        const confirm2 = window.prompt(`Ketik kode tenant "${tenant.kode}" untuk mengonfirmasi penghapusan:`);
        if (confirm2 !== tenant.kode) {
            alert('Konfirmasi kode salah. Penghapusan dibatalkan.');
            return;
        }

        setSaving(true);
        const { error: e } = await supabase.from('tenants').delete().eq('id', tenant.id);
        if (e) {
            showToast('❌ Gagal hapus: ' + e.message);
        } else {
            showToast(`🗑️ Tenant ${tenant.nama} telah dihapus.`);
            loadTenants();
        }
        setSaving(false);
    }

    async function handleCreateUser(e) {
        e.preventDefault();

        // IMPORTANT WARNING: supabase.auth.signUp on client replaces current session
        const msg = "PERINGATAN: Membuat user baru dengan Password akan membuat Anda (Admin) LOG OUT otomatis karena sistem keamanan Supabase Auth.\n\nAnda harus login kembali sebagai Admin setelah ini. Lanjutkan?";
        if (!confirm(msg)) return;

        setSaving(true);
        try {
            if (!newUser.tenant_id) throw new Error('Pilih Tenant');
            if (!newUser.email || !newUser.password) throw new Error('Email dan Password wajib diisi');

            // 1. Create Auth User in Supabase
            // Note: In client-side, this will sign-up the user. 
            // If email confirmation is ON, user needs to click link. If OFF, user is created immediately.
            const { data: authData, error: authErr } = await supabase.auth.signUp({
                email: newUser.email.trim(),
                password: newUser.password.trim(),
                options: {
                    data: {
                        nama: newUser.nama.trim(),
                        no_telepon: newUser.no_telepon.trim(),
                    }
                }
            });

            if (authErr) throw authErr;
            if (!authData.user) throw new Error('Gagal membuat akun auth');

            // 2. Create Profile (Manually if trigger not exist, though usually handled by trigger/hook)
            // We'll upsert to be safe
            const { error: pErr } = await supabase
                .from('profiles')
                .upsert({
                    id: authData.user.id,
                    nama: newUser.nama.trim(),
                    no_telepon: newUser.no_telepon.trim(),
                    global_role: 'kasir'
                });

            if (pErr) throw pErr;

            // 3. Link to Tenant
            const { error: utErr } = await supabase
                .from('user_tenants')
                .insert({
                    user_id: authData.user.id,
                    tenant_id: newUser.tenant_id,
                    role: newUser.role,
                    is_active: true
                });

            if (utErr) throw utErr;

            showToast('✅ User berhasil didaftarkan ke Supabase Auth!');
            setShowUserForm(false);
            setNewUser({ nama: '', no_telepon: '', email: '', password: '', tenant_id: '', role: 'kasir' });
            loadUsers();
        } catch (err) {
            showToast('❌ ' + err.message);
        }
        setSaving(false);
    }

    async function handleUpdateGlobalRole(userId, newRole) {
        const { error: e } = await supabase.from('profiles').update({ global_role: newRole }).eq('id', userId);
        if (e) showToast('❌ ' + e.message);
        else { showToast('✅ Role diperbarui.'); loadUsers(); }
    }

    async function handleToggleUserTenant(utId, currentActive) {
        const { error: e } = await supabase.from('user_tenants').update({ is_active: !currentActive }).eq('id', utId);
        if (e) showToast('❌ ' + e.message);
        else { showToast('✅ Akses tenant diperbarui.'); loadUsers(); }
    }

    async function handleDeleteUser(user) {
        const msg = `Apakah Anda yakin ingin MENGHAPUS profil dan akses user "${user.nama}"?\n\n(Peringatan: Meskipun data login di Auth server tetap ada, data profil web akan terhapus sepenuhnya dan user tidak bisa login ke aplikasi)`;
        if (!window.confirm(msg)) return;
        setSaving(true);
        await supabase.from('user_tenants').delete().eq('user_id', user.id);
        const { error: e } = await supabase.from('profiles').delete().eq('id', user.id);
        if (e) showToast('❌ Gagal hapus profil: ' + e.message);
        else { showToast('🗑️ User ' + user.nama + ' berhasil dihapus dari sistem.'); loadUsers(); }
        setSaving(false);
    }

    async function handleResetPassword() {
        const email = window.prompt("Masukkan ALAMAT EMAIL pengguna ini untuk mengirimkan instruksi Reset Password:\n(Sistem akan mengirimkan email link reset password secara otomatis)");
        if (!email) return;
        setSaving(true);
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
        if (error) showToast('❌ Gagal: ' + error.message);
        else showToast(`✅ Email instruksi reset password telah dikirim ke: ${email}`);
        setSaving(false);
    }

    const pendingCount = pendingPayments.filter(p => p.status === 'menunggu_verifikasi').length;

    return (
        <div className="page" style={{ paddingBottom: 80 }}>
            <div className="page-header">
                <div>
                    <h2>🛡️ Admin Panel</h2>
                    <p className="text-muted">Halo, {profile?.nama || 'Admin'}</p>
                </div>
            </div>

            <div className="admin-stats">
                <div className="admin-stat"><span className="stat-num">{tenants.length}</span><span>Tenant</span></div>
                <div className="admin-stat"><span className="stat-num">{users.length}</span><span>User</span></div>
                <div className="admin-stat pending"><span className="stat-num">{pendingCount}</span><span>Pending</span></div>
            </div>

            <div className="filter-tabs admin-tabs">
                <button className={`tab-btn ${tab === 'tenants' ? 'active' : ''}`} onClick={() => setTab('tenants')}>🏢 Tenant</button>
                <button className={`tab-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>👥 User</button>
                <button className={`tab-btn ${tab === 'payments' ? 'active' : ''}`} onClick={() => setTab('payments')}>
                    💳 Bayar {pendingCount > 0 && <span className="badge-count">{pendingCount}</span>}
                </button>
            </div>

            {error && <div className="alert alert-error">{error}</div>}

            {loading ? <div className="loading-state"><div className="spinner" /></div> : (
                <>
                    {tab === 'tenants' && (
                        <>
                            <div className="section-action" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <input
                                    type="text"
                                    value={searchTenant}
                                    onChange={e => setSearchTenant(e.target.value)}
                                    placeholder="🔍 Cari Kode atau Nama Laundry..."
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)' }}
                                />
                                <button className="btn btn-primary btn-sm" onClick={() => setShowTenantForm(v => !v)}>
                                    {showTenantForm ? '✕ Close' : '+ Tenant Baru'}
                                </button>
                            </div>

                            {showTenantForm && (
                                <form className="form-card" onSubmit={handleCreateTenant}>
                                    <h3>Tambah Tenant</h3>
                                    <div className="form-row">
                                        <input type="text" value={newTenant.kode} onChange={e => setNewTenant(p => ({ ...p, kode: e.target.value }))} placeholder="KODE (Contoh: LND01)" required />
                                        <input type="text" value={newTenant.nama} onChange={e => setNewTenant(p => ({ ...p, nama: e.target.value }))} placeholder="Nama Laundry" required />
                                    </div>
                                    <input type="text" value={newTenant.alamat} onChange={e => setNewTenant(p => ({ ...p, alamat: e.target.value }))} placeholder="Alamat" style={{ marginTop: 10, width: '100%', padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'white' }} />
                                    <button type="submit" className="btn btn-primary btn-full" disabled={saving} style={{ marginTop: 10 }}>💾 Simpan Tenant</button>
                                </form>
                            )}

                            <div className="admin-list">
                                {tenants.filter(t => t.nama.toLowerCase().includes(searchTenant.toLowerCase()) || t.kode.toLowerCase().includes(searchTenant.toLowerCase())).map(t => {
                                    const activeLic = t.licenses?.find(l => l.is_active);
                                    const vEnabled = tenantSettings[t.id]?.voucher !== false; // default true
                                    const waEnabled = tenantSettings[t.id]?.wa !== false; // default true
                                    const pEnabled = tenantSettings[t.id]?.poin !== false; // default true
                                    return (
                                        <div className="admin-card" key={t.id}>
                                            <div className="admin-card-header">
                                                <div style={{ flex: 1 }}>
                                                    <div className="admin-card-title"><code style={{ cursor: 'pointer' }} onClick={() => { navigator.clipboard.writeText(t.kode); showToast('✅ Kode Disalin: ' + t.kode); }} title="Klik untuk menyalin">[{t.kode}]</code> {t.nama}</div>
                                                    <div className="admin-card-sub">{t.alamat}</div>
                                                    {t.lastActive ? (
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: 4 }}>🕒 Order Terakhir: {new Date(t.lastActive).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: 4 }}>🕒 Belum ada pesanan masuk</div>
                                                    )}
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    {activeLic ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                            <span className={`badge badge-lic-${activeLic.status}`}>{activeLic.package}</span>
                                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>s/d {formatDate(activeLic.end_at)}</span>
                                                        </div>
                                                    ) : <span className="badge badge-lic-kedaluwarsa">No License</span>}
                                                </div>
                                            </div>

                                            <div style={{ marginTop: 10, display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                                                    <strong>Fitur:</strong>
                                                    <button
                                                        className={`btn-tiny ${vEnabled ? 'active' : 'inactive'}`}
                                                        onClick={() => toggleFeature(t.id, 'feature_voucher', vEnabled)}
                                                        disabled={saving}
                                                    >
                                                        {vEnabled ? '🎟️ Voucher On' : '🎟️ Voucher Off'}
                                                    </button>
                                                    <button
                                                        className={`btn-tiny ${pEnabled ? 'active' : 'inactive'}`}
                                                        onClick={() => toggleFeature(t.id, 'feature_poin', pEnabled)}
                                                        disabled={saving}
                                                    >
                                                        {pEnabled ? '🎁 Poin On' : '🎁 Poin Off'}
                                                    </button>
                                                    <button
                                                        className={`btn-tiny ${waEnabled ? 'active' : 'inactive'}`}
                                                        onClick={() => toggleFeature(t.id, 'feature_wa', waEnabled)}
                                                        disabled={saving}
                                                    >
                                                        {waEnabled ? '💬 WA On' : '💬 WA Off'}
                                                    </button>
                                                </div>
                                                <button
                                                    className="btn-tiny"
                                                    style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--error)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                                    onClick={() => handleDeleteTenant(t)}
                                                    disabled={saving}
                                                >
                                                    🗑️ Hapus Tenant
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    {tab === 'users' && (
                        <>
                            <div className="section-action">
                                <button className="btn btn-primary btn-sm" onClick={() => setShowUserForm(v => !v)}>
                                    {showUserForm ? '✕ Close' : '+ User Baru'}
                                </button>
                            </div>

                            {showUserForm && (
                                <form className="form-card" onSubmit={handleCreateUser}>
                                    <h3>Tambah User & Akun Login</h3>
                                    <div className="form-column" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div className="form-row">
                                            <input type="text" value={newUser.nama} onChange={e => setNewUser(p => ({ ...p, nama: e.target.value }))} placeholder="Nama Lengkap" required />
                                            <input type="tel" value={newUser.no_telepon} onChange={e => setNewUser(p => ({ ...p, no_telepon: e.target.value }))} placeholder="No Telepon" required />
                                        </div>
                                        <div className="form-row">
                                            <input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="Email (untuk login)" required />
                                            <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="Password sementara" required />
                                        </div>
                                        <div className="form-row">
                                            <select value={newUser.tenant_id} onChange={e => setNewUser(p => ({ ...p, tenant_id: e.target.value }))} required>
                                                <option value="">-- Pilih Tenant --</option>
                                                {tenants.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                                            </select>
                                            <select value={newUser.role} onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}>
                                                <option value="owner">Owner</option>
                                                <option value="kasir">Kasir</option>
                                                <option value="operator">Operator</option>
                                            </select>
                                        </div>
                                        <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Note: Akun akan langsung dibuat di Supabase Auth. Berikan email & password ini ke user.</p>
                                        <button type="submit" className="btn btn-primary btn-full" disabled={saving}>💾 Buat & Daftarkan User</button>
                                    </div>
                                </form>
                            )}

                            <div className="admin-list">
                                {users.map(u => {
                                    const isOrphan = !u.user_tenants || u.user_tenants.length === 0 || !u.user_tenants.some(ut => ut.is_active);
                                    return (
                                        <div className="admin-card" key={u.id} style={isOrphan ? { borderLeft: '4px solid var(--error)' } : {}}>
                                            <div className="admin-card-header">
                                                <div style={{ flex: 1 }}>
                                                    <div className="admin-card-title">
                                                        {u.nama}
                                                        {isOrphan && <span style={{ background: 'var(--error)', color: 'white', fontSize: '0.65rem', padding: '2px 6px', borderRadius: 4, marginLeft: 6, fontWeight: 'bold' }}>⚠️ Yatim (Orphan)</span>}
                                                    </div>
                                                    <div className="admin-card-sub">{u.no_telepon}</div>
                                                    <div style={{ fontSize: '0.7rem', color: 'var(--primary)', marginTop: 2 }}>Role: {u.global_role}</div>
                                                </div>
                                                <div style={{ textAlign: 'right' }}>
                                                    <select value={u.global_role} onChange={e => handleUpdateGlobalRole(u.id, e.target.value)} className="btn-tiny" style={{ marginBottom: 6 }}>
                                                        {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                                    </select>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                                                        <button className="btn-tiny" onClick={() => handleResetPassword()} disabled={saving}>🔑 Reset Password</button>
                                                        <button className="btn-tiny" style={{ color: 'var(--error)', borderColor: 'rgba(239, 68, 68, 0.3)' }} onClick={() => handleDeleteUser(u)} disabled={saving}>🗑️ Hapus Profil</button>
                                                    </div>
                                                </div>
                                            </div>
                                            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                                                <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--text-muted)', marginBottom: 5 }}>Tenant Access:</p>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                                                    {u.user_tenants?.map(ut => (
                                                        <div key={ut.id} className="badge badge-outline" style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: '0.7rem' }}>
                                                            <span>{ut.tenants?.nama} ({ut.role})</span>
                                                            <button onClick={() => handleToggleUserTenant(ut.id, ut.is_active)} style={{ background: 'none', border: 'none', color: ut.is_active ? 'var(--success)' : 'var(--error)', cursor: 'pointer' }}>
                                                                {ut.is_active ? '● Active' : '○ Off'}
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {isOrphan && <span style={{ fontSize: '0.7rem', color: 'var(--error)' }}>Tidak punya akses tenant yang aktif</span>}
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        </>
                    )}

                    {tab === 'payments' && (
                        <div className="admin-list">
                            {pendingPayments.map(p => (
                                <div className="admin-card" key={p.id}>
                                    <div className="admin-card-header">
                                        <div style={{ flex: 1 }}>
                                            <div className="admin-card-title">{p.tenants?.nama}</div>
                                            <div className="admin-card-sub">Rp {p.amount_idr?.toLocaleString()} - {p.metode}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: 4 }}>{p.notes}</div>
                                        </div>
                                        <span className={`badge badge-pay-${p.status}`}>{p.status.replace(/_/g, ' ')}</span>
                                    </div>
                                    {p.status === 'menunggu_verifikasi' && (
                                        <div className="form-actions" style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                                            <button className="btn btn-primary btn-sm" onClick={() => handleApprovePayment(p)} disabled={saving}>Verifikasi & Aktifkan</button>
                                            <button className="btn btn-secondary btn-sm" onClick={() => handleRejectPayment(p)} disabled={saving}>Tolak</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
            {toast && <div className="toast">{toast}</div>}
        </div>
    );
}
