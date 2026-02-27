import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getLicenseInfo, licenseStatusLabel } from '../lib/license';

const formatDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';
const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');

const PACKAGE_LABELS = { bulanan: 'Bulanan (30 hari)', tahunan: 'Tahunan (365 hari)' };
const PACKAGE_PRICE = { bulanan: 50000, tahunan: 500000 };

export default function LicensePage({ tenantId, licenseStatus, onRefreshLicense }) {
    const [license, setLicense] = useState(null);
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [selectedPackage, setSelectedPackage] = useState('bulanan');
    const [successMsg, setSuccessMsg] = useState('');
    const [error, setError] = useState('');

    const loadLicenseData = useCallback(async () => {
        setLoading(true);
        const info = await getLicenseInfo(tenantId);
        setLicense(info);

        const { data: pays } = await supabase
            .from('payments')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(10);
        setPayments(pays || []);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        if (!tenantId) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadLicenseData();
    }, [tenantId, loadLicenseData]);

    async function handleRequestLicense() {
        setSubmitting(true);
        setError('');
        setSuccessMsg('');

        const { error: err } = await supabase.from('payments').insert({
            tenant_id: tenantId,
            amount_idr: PACKAGE_PRICE[selectedPackage],
            metode: 'manual_transfer',
            status: 'menunggu_verifikasi',
            notes: `Permintaan lisensi ${PACKAGE_LABELS[selectedPackage]}`,
        });

        if (err) {
            setError('Gagal mengajukan permohonan: ' + err.message);
        } else {
            setSuccessMsg('✅ Permohonan lisensi berhasil dikirim. Admin akan memverifikasi pembayaran manual transfer Anda.');
            loadLicenseData();
            if (onRefreshLicense) onRefreshLicense();
        }
        setSubmitting(false);
    }

    const statusColorClass = {
        aktif: 'success',
        masa_tenggang: 'warning',
        kedaluwarsa: 'error',
    }[licenseStatus] || 'error';

    return (
        <div className="page">
            <div className="page-header">
                <h2>Lisensi</h2>
            </div>

            {loading ? (
                <div className="loading-state"><div className="spinner" /></div>
            ) : (
                <>
                    {/* Current license */}
                    <div className={`license-card license-${statusColorClass}`}>
                        <div className="license-icon">{licenseStatus === 'aktif' ? '✅' : licenseStatus === 'masa_tenggang' ? '⚠️' : '❌'}</div>
                        <div className="license-info">
                            <div className="license-status-label">{licenseStatusLabel(licenseStatus)}</div>
                            {license ? (
                                <>
                                    <div>Paket: <strong>{PACKAGE_LABELS[license.package] || license.package}</strong></div>
                                    <div>Aktif s/d: <strong>{formatDate(license.end_at)}</strong></div>
                                    {licenseStatus === 'masa_tenggang' && (
                                        <div className="grace-note">
                                            Masa tenggang 3 hari aktif. Mode <strong>baca saja</strong> — tidak bisa tambah/edit pesanan.
                                        </div>
                                    )}
                                </>
                            ) : (
                                <div>Belum ada lisensi aktif.</div>
                            )}
                        </div>
                    </div>

                    {/* Request new license */}
                    <div className="form-card">
                        <h3>Ajukan Lisensi Baru</h3>
                        <p className="text-muted">Transfer manual ke rekening owner. Admin akan mengaktifkan lisensi setelah verifikasi.</p>

                        <div className="package-options">
                            {Object.entries(PACKAGE_LABELS).map(([key, label]) => (
                                <button
                                    key={key}
                                    type="button"
                                    className={`package-btn ${selectedPackage === key ? 'active' : ''}`}
                                    onClick={() => setSelectedPackage(key)}
                                >
                                    <span className="package-name">{label}</span>
                                    <span className="package-price">{formatRp(PACKAGE_PRICE[key])}</span>
                                </button>
                            ))}
                        </div>

                        {error && <div className="alert alert-error">{error}</div>}
                        {successMsg && <div className="alert alert-success">{successMsg}</div>}

                        <button className="btn btn-primary btn-full" onClick={handleRequestLicense} disabled={submitting}>
                            {submitting ? 'Mengirim...' : '📋 Ajukan Permohonan Lisensi'}
                        </button>
                    </div>

                    {/* Payment history */}
                    {payments.length > 0 && (
                        <div className="form-card">
                            <h3>Riwayat Pembayaran</h3>
                            <div className="table-wrapper">
                                <table className="report-table">
                                    <thead>
                                        <tr><th>Tanggal</th><th>Jumlah</th><th>Status</th></tr>
                                    </thead>
                                    <tbody>
                                        {payments.map(p => (
                                            <tr key={p.id}>
                                                <td>{formatDate(p.created_at)}</td>
                                                <td>{formatRp(p.amount_idr)}</td>
                                                <td>
                                                    <span className={`badge badge-pay-${p.status}`}>
                                                        {p.status.replace(/_/g, ' ')}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
