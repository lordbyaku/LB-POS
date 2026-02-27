import { useRef, useEffect, useState } from 'react';
import JsBarcode from 'jsbarcode';
import html2pdf from 'html2pdf.js';
import { supabase } from '../lib/supabase';

const formatRp = (n) => 'Rp ' + (n || 0).toLocaleString('id-ID');
const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

const STATUS_LABEL = {
    pesanan_masuk: 'Pesanan Masuk',
    sedang_dicuci: 'Sedang Dicuci',
    selesai_dicuci: 'Selesai Dicuci',
    sudah_diambil: 'Sudah Diambil',
};

export default function ReceiptModal({ order, onClose, isPrint = false }) {
    const barcodeRef = useRef(null);
    const customer = order.customers || {};
    const service = order.services || {};
    const [tenant, setTenant] = useState(null);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    useEffect(() => {
        if (!order.tenant_id) return;
        supabase.from('tenants').select('*').eq('id', order.tenant_id).maybeSingle()
            .then(({ data }) => setTenant(data));
    }, [order.tenant_id]);

    useEffect(() => {
        if (barcodeRef.current && order.kode) {
            try {
                JsBarcode(barcodeRef.current, order.kode, {
                    format: 'CODE128',
                    width: 1.5,
                    height: 50,
                    displayValue: true,
                    fontSize: 14,
                    margin: 2,
                });
            } catch (err) {
                console.warn('Barcode generation failed:', err);
            }
        }
    }, [order.kode]);

    function handlePrint() {
        window.print();
    }

    async function handleSavePdf() {
        const element = document.querySelector('.print-area');
        if (!element) return;

        setIsGeneratingPdf(true);

        const originalBg = element.style.background;
        const originalColor = element.style.color;
        element.style.background = 'white';
        element.style.color = 'black';

        // Menghitung tinggi elemen aktual
        const heightInPx = element.offsetHeight;
        // Konversi pixels ke milimeter (~0.264583 mm per pixel)
        const heightInMm = heightInPx * 0.264583;

        const opt = {
            margin: 0,
            filename: `Struk_${order.kode}.pdf`,
            image: { type: 'jpeg', quality: 1 },
            html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff' },
            // Lebar 58mm, tinggi diatur dinamis menyesuaikan isi struk + margin sedikit
            jsPDF: { unit: 'mm', format: [58, Math.max(heightInMm, 100)], orientation: 'portrait' }
        };

        try {
            await html2pdf().set(opt).from(element).save();
        } catch (e) {
            console.error('Failed to generate PDF:', e);
            alert('Gagal membuat PDF.');
        } finally {
            element.style.background = originalBg;
            element.style.color = originalColor;
            setIsGeneratingPdf(false);
        }
    }

    const statusText = STATUS_LABEL[order.status] || order.status || 'Pesanan Masuk';
    const modalTitle = isPrint ? 'Re-Print Struk' : 'Pesanan Berhasil Dibuat';

    const divider = '┄'.repeat(30);

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3>{modalTitle}</h3>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="receipt print-area">
                    <div className="receipt-header">
                        <div className="receipt-shop">{tenant?.nama || 'LB POS INDONESIA'}</div>
                        <div className="receipt-address">{tenant?.alamat}</div>
                        <div className="receipt-phone">HP: {tenant?.no_telepon}</div>
                        <div className="receipt-divider">{divider}</div>
                        <div className="receipt-title">STRUK PESANAN</div>
                        {isPrint && <div className="receipt-reprint-label">*** RE-PRINT ***</div>}
                    </div>

                    <div className="receipt-divider">{divider}</div>

                    <div className="receipt-barcode">
                        <svg ref={barcodeRef} />
                    </div>

                    <div className="receipt-divider">{divider}</div>

                    <div className="receipt-body">
                        <div className="receipt-row">
                            <span>Kode:</span><span>{order.kode}</span>
                        </div>
                        <div className="receipt-row">
                            <span>Tgl:</span><span>{formatDate(order.created_at)}</span>
                        </div>
                        <div className="receipt-divider">{divider}</div>
                        <div className="receipt-row">
                            <span>Plg:</span><span>{customer.nama || '-'}</span>
                        </div>
                        <div className="receipt-row">
                            <span>HP:</span><span>{customer.no_telepon || '-'}</span>
                        </div>
                        <div className="receipt-row">
                            <span>Almt:</span><span>{customer.alamat || '-'}</span>
                        </div>
                        <div className="receipt-divider">{divider}</div>
                        {service.nama_layanan && (
                            <div className="receipt-row">
                                <span>Layanan:</span><span>{service.nama_layanan}</span>
                            </div>
                        )}
                        {order.berat_kg && (
                            <div className="receipt-row">
                                <span>Berat:</span><span>{order.berat_kg} kg</span>
                            </div>
                        )}
                        {order.catatan && (
                            <div className="receipt-row">
                                <span style={{ display: 'block' }}>Catatan:</span>
                                <span style={{ display: 'block', textAlign: 'left', fontStyle: 'italic' }}>{order.catatan}</span>
                            </div>
                        )}
                        <div className="receipt-divider">{divider}</div>
                        <div className="receipt-row receipt-total">
                            <span>TOTAL:</span><span>{formatRp(order.total_idr)}</span>
                        </div>
                        {order.uang_muka_idr > 0 && order.status_pembayaran === 'belum_lunas' && (
                            <>
                                <div className="receipt-row">
                                    <span>DP:</span><span>{formatRp(order.uang_muka_idr)}</span>
                                </div>
                                <div className="receipt-row" style={{ fontWeight: 'bold' }}>
                                    <span>SISA:</span><span>{formatRp(order.total_idr - (order.dibayar_idr || 0))}</span>
                                </div>
                            </>
                        )}
                        <div className="receipt-row">
                            <span>Bayar:</span><span style={{ fontWeight: 'bold' }}>{order.status_pembayaran === 'lunas' ? 'LUNAS ✅' : 'BELUM LUNAS'}</span>
                        </div>
                        <div className="receipt-row">
                            <span>Status:</span><span>{statusText}</span>
                        </div>
                    </div>

                    <div className="receipt-divider">{divider}</div>
                    <div className="receipt-footer">
                        {tenant?.footer_struk || 'Terima kasih atas kepercayaan Anda!'}
                    </div>
                </div>

                <div className="modal-actions" style={{ flexWrap: 'wrap' }}>
                    <button className="btn btn-secondary" onClick={onClose} style={{ flex: '1 1 100%' }}>Tutup</button>
                    <button className="btn btn-secondary" onClick={handleSavePdf} disabled={isGeneratingPdf} style={{ flex: 1, background: 'var(--bg2)' }}>
                        {isGeneratingPdf ? '⏳ Menyimpan...' : '📄 Save PDF'}
                    </button>
                    <button className="btn btn-primary" onClick={handlePrint} style={{ flex: 1 }}>🖨️ Print Struk</button>
                </div>
            </div>
        </div>
    );
}
