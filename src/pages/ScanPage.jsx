import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { supabase } from '../lib/supabase';
import { sendWaNotification } from '../lib/waNotify';

const STATUS_FLOW = {
    pesanan_masuk: 'sedang_dicuci',
    sedang_dicuci: 'selesai_dicuci',
    selesai_dicuci: 'sudah_diambil',
};

const STATUS_LABEL = {
    pesanan_masuk: 'Pesanan Masuk',
    sedang_dicuci: 'Sedang Dicuci',
    selesai_dicuci: 'Selesai Dicuci',
    sudah_diambil: 'Sudah Diambil',
};

// Audio beep helper
function playBeep(success = true) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';

        if (success) {
            // Two short ascending beeps = success
            osc.frequency.setValueAtTime(880, ctx.currentTime);
            osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.25);
        } else {
            // Low descending beep = error
            osc.frequency.setValueAtTime(400, ctx.currentTime);
            osc.frequency.setValueAtTime(220, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.35);
        }
        // eslint-disable-next-line no-unused-vars
    } catch (_) {
        // Ignore if audio not supported
    }
}

export default function ScanPage({ tenantId, licenseStatus }) {
    const videoRef = useRef(null);
    const readerRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [manualCode, setManualCode] = useState('');
    const [result, setResult] = useState(null);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const canWrite = licenseStatus !== 'kedaluwarsa';

    const stopScanner = useCallback(() => {
        if (readerRef.current) {
            try { readerRef.current.reset(); } catch (err) { console.warn('Scanner reset failed:', err); }
            readerRef.current = null;
        }
        setScanning(false);
    }, []);

    useEffect(() => { return () => stopScanner(); }, [stopScanner]);

    async function startScanner() {
        setError('');
        setScanning(true);
        try {
            readerRef.current = new BrowserMultiFormatReader();
            await readerRef.current.decodeFromVideoDevice(undefined, videoRef.current, (res, err) => {
                if (res) {
                    stopScanner();
                    handleCode(res.getText());
                }
                if (err && err.name !== 'NotFoundException') {
                    // silent
                }
            });
        } catch (err) {
            setError('Tidak bisa akses kamera: ' + err.message);
            setScanning(false);
        }
    }

    async function handleCode(code) {
        const trimmed = code.trim();
        if (!trimmed) return;
        setLoading(true);
        setMessage('');
        setError('');
        setResult(null);

        const { data: orders, error: fetchErr } = await supabase
            .from('orders')
            .select(`*, customers ( nama, no_telepon, alamat )`)
            .eq('tenant_id', tenantId)
            .or(`kode.eq.${trimmed},barcode_value.eq.${trimmed}`)
            .limit(1);

        if (fetchErr || !orders || orders.length === 0) {
            setError(`Kode pesanan "${trimmed}" tidak ditemukan.`);
            playBeep(false);
            setLoading(false);
            return;
        }

        const order = orders[0];
        setResult(order);

        if (!canWrite) {
            setError('Mode baca saja — tidak bisa update status.');
            setLoading(false);
            return;
        }

        const nextStatus = STATUS_FLOW[order.status];
        if (!nextStatus) {
            setMessage(`✅ Pesanan ${order.kode} sudah selesai sepenuhnya.`);
            playBeep(true);
            setLoading(false);
            return;
        }

        const { error: updateErr } = await supabase.rpc('update_order_status', {
            p_order_id: order.id,
            p_new_status: nextStatus,
        });

        if (updateErr) {
            setError('Gagal update status: ' + updateErr.message);
            playBeep(false);
        } else {
            setMessage(`✅ Status diperbarui: ${STATUS_LABEL[nextStatus]}`);
            setResult({ ...order, status: nextStatus });
            playBeep(true);

            await sendWaNotification({
                kode: order.kode,
                customerName: order.customers?.nama,
                customerPhone: order.customers?.no_telepon,
                status: nextStatus,
                tenantId,
                statusBayar: order.status_pembayaran,
                totalIdr: order.total_idr,
            });
        }
        setLoading(false);
    }

    function handleManualSubmit(e) {
        e.preventDefault();
        handleCode(manualCode);
        setManualCode('');
    }

    const order = result;
    const PAY_STATUS_LABEL = { lunas: '✅ Lunas', belum_lunas: '⏳ Belum Lunas', dp: '💸 DP' };

    return (
        <div className="page">
            <div className="page-header">
                <h2>Scan Barcode</h2>
            </div>

            {!canWrite && (
                <div className="alert alert-warning">⚠️ Lisensi habis — mode baca saja.</div>
            )}

            <div className="scan-card">
                <div className="video-wrapper">
                    <video ref={videoRef} className={`scan-video ${scanning ? 'active' : ''}`} muted playsInline />
                    {!scanning && (
                        <div className="scan-placeholder">
                            <span>📷</span>
                            <p>Klik tombol di bawah untuk scan</p>
                        </div>
                    )}
                </div>

                <div className="scan-actions">
                    {!scanning ? (
                        <button className="btn btn-primary" onClick={startScanner}>📷 Mulai Scan Kamera</button>
                    ) : (
                        <button className="btn btn-secondary" onClick={stopScanner}>⏹ Stop Scan</button>
                    )}
                </div>

                <div className="scan-divider"><span>atau input manual</span></div>

                <form onSubmit={handleManualSubmit} className="manual-input">
                    <input
                        type="text"
                        value={manualCode}
                        onChange={e => setManualCode(e.target.value)}
                        placeholder="Ketik kode pesanan (contoh: LND-1234567890)"
                    />
                    <button type="submit" className="btn btn-primary" disabled={loading || !manualCode.trim()}>
                        Cari
                    </button>
                </form>
            </div>

            {loading && (
                <div className="loading-state"><div className="spinner" /><p>Memproses...</p></div>
            )}

            {error && <div className="alert alert-error">{error}</div>}
            {message && <div className="alert alert-success">{message}</div>}

            {order && (
                <div className="result-card">
                    <h3>Pesanan Ditemukan</h3>
                    <div className="result-row"><span>Kode</span><strong>{order.kode}</strong></div>
                    <div className="result-row"><span>Pelanggan</span><strong>{order.customers?.nama}</strong></div>
                    <div className="result-row"><span>No. HP</span><strong>{order.customers?.no_telepon}</strong></div>
                    <div className="result-row">
                        <span>Total</span>
                        <strong>Rp {(order.total_idr || 0).toLocaleString('id-ID')}</strong>
                    </div>
                    <div className="result-row">
                        <span>Pembayaran</span>
                        <span style={{
                            fontWeight: 600,
                            color: order.status_pembayaran === 'lunas' ? '#10b981' : '#f59e0b'
                        }}>
                            {PAY_STATUS_LABEL[order.status_pembayaran] || order.status_pembayaran || '-'}
                        </span>
                    </div>
                    <div className="result-row">
                        <span>Status</span>
                        <span className={`badge badge-${order.status}`}>{STATUS_LABEL[order.status]}</span>
                    </div>
                </div>
            )}
        </div>
    );
}
