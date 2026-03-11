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
    const [isPrintingBt, setIsPrintingBt] = useState(false);

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

    function handleShareWhatsApp() {
        const phone = customer.no_telepon || '';
        if (!phone) {
            alert('Nomor telepon pelanggan tidak tersedia.');
            return;
        }

        // Format nomor ke internasional (62xxx)
        let formatted = phone.replace(/[^\d]/g, '');
        if (formatted.startsWith('0')) {
            formatted = '62' + formatted.slice(1);
        } else if (!formatted.startsWith('62')) {
            formatted = '62' + formatted;
        }

        const statusText = STATUS_LABEL[order.status] || order.status || 'Pesanan Masuk';
        const sisa = order.total_idr - (order.dibayar_idr || 0);
        const bayarInfo = order.status_pembayaran === 'lunas'
            ? 'LUNAS \u2705'
            : (order.uang_muka_idr > 0
                ? `DP: ${formatRp(order.uang_muka_idr)} | Sisa: ${formatRp(sisa)}`
                : 'BELUM LUNAS');

        // Buat baris detail item
        let itemLines = [];
        const items = order.order_items;
        if (items && items.length > 0) {
            // Multi-item (dari keranjang)
            itemLines = items.map(it => {
                const qty = `${it.jumlah} ${it.satuan || ''}`.trim();
                return `  \u2022 ${it.nama_item} (${qty}) \u2192 *${formatRp(it.subtotal)}*`;
            });
        } else if (service.nama_layanan) {
            // Fallback: layanan tunggal
            const berat = order.berat_kg ? ` ${order.berat_kg} kg` : '';
            itemLines = [`  \u2022 ${service.nama_layanan}${berat} \u2192 *${formatRp(order.total_idr)}*`];
        }

        // Gunakan Unicode escapes agar emoji tidak corrupt di Windows
        const ikon = {
            laundry: '\u{1F9FA}',   // 🧺 washer/laundry
            kode: '\u{1F4CB}',   // 📋 clipboard
            tanggal: '\u{1F4C5}',   // 📅 calendar
            orang: '\u{1F464}',   // 👤 person
            catatan: '\u{1F4DD}',   // 📝 memo
            keranjang: '\u{1F6D2}',  // 🛒 cart
            uang: '\u{1F4B0}',   // 💰 money
            bayar: '\u{1F4B3}',   // 💳 card
            paket: '\u{1F4E6}',   // 📦 package
            terima: '\u{1F64F}',   // 🙏 pray
        };

        const lines = [
            `${ikon.laundry} *STRUK LAUNDRY*`,
            `${tenant?.nama || 'LB POS INDONESIA'}`,
            ``,
            `${ikon.kode} Kode: *${order.kode}*`,
            `${ikon.tanggal} Tgl: ${formatDate(order.created_at)}`,
            ``,
            `${ikon.orang} Pelanggan: ${customer.nama || '-'}`,
            order.catatan ? `${ikon.catatan} Catatan: _${order.catatan}_` : null,
            ``,
            `${ikon.keranjang} *Detail Pesanan:*`,
            ...itemLines,
            ``,
            `${ikon.uang} Total: *${formatRp(order.total_idr)}*`,
            `${ikon.bayar} Bayar: ${bayarInfo}`,
            `${ikon.paket} Status: ${statusText}`,
            ``,
            tenant?.footer_struk ? tenant.footer_struk : `Terima kasih atas kepercayaan Anda! ${ikon.terima}`,
        ].filter(l => l !== null && l !== undefined);

        const message = encodeURIComponent(lines.join('\n'));
        window.open(`https://wa.me/${formatted}?text=${message}`, '_blank');
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

    async function handleBluetoothPrint() {
        if (!navigator.bluetooth) {
            alert('Browser Anda tidak mendukung Bluetooth Pribadi (Web Bluetooth API)');
            return;
        }
        setIsPrintingBt(true);
        try {
            const device = await navigator.bluetooth.requestDevice({
                acceptAllDevices: true,
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455']
            });

            const server = await device.gatt.connect();

            // Try to find a printing service
            const services = await server.getPrimaryServices();
            let printCharacteristic = null;

            for (const srv of services) {
                const characteristics = await srv.getCharacteristics();
                for (const char of characteristics) {
                    if (char.properties.write || char.properties.writeWithoutResponse) {
                        printCharacteristic = char;
                        break;
                    }
                }
                if (printCharacteristic) break;
            }

            if (!printCharacteristic) {
                throw new Error('Tidak ditemukan layanan print pada device ini');
            }

            const encoder = new TextEncoder();
            let receipt = `\x1B\x40`; // Initialize
            receipt += `\x1B\x61\x01`; // Align center
            receipt += `${tenant?.nama || 'LB POS INDONESIA'}\n`;
            receipt += `\x1B\x61\x00`; // Align left
            receipt += `--------------------------------\n`;
            receipt += `Kode: ${order.kode}\n`;
            receipt += `Tgl : ${formatDate(order.created_at)}\n`;
            receipt += `Plg : ${customer.nama || '-'}\n`;
            receipt += `--------------------------------\n`;

            const items = order.order_items || [];
            if (items.length > 0) {
                for (const it of items) {
                    receipt += `${it.nama_item}\n`;
                    receipt += `${it.jumlah} ${it.satuan} x Rp ${it.harga_satuan}\n`;
                    receipt += `  Subtotal: ${formatRp(it.subtotal)}\n`;
                }
            } else if (service.nama_layanan) {
                receipt += `${service.nama_layanan}\n`;
                if (order.berat_kg) receipt += `${order.berat_kg} kg x Harga\n`;
            }
            receipt += `--------------------------------\n`;
            receipt += `TOTAL : ${formatRp(order.total_idr)}\n`;

            const bayarInfo = order.status_pembayaran === 'lunas' ? 'LUNAS' : 'BELUM LUNAS';
            receipt += `BAYAR : ${bayarInfo}\n`;
            if (order.uang_muka_idr > 0) {
                receipt += `DP    : ${formatRp(order.uang_muka_idr)}\n`;
                receipt += `SISA  : ${formatRp(order.total_idr - order.dibayar_idr)}\n`;
            }
            receipt += `--------------------------------\n`;
            receipt += `\x1B\x61\x01`; // Center
            receipt += `${tenant?.footer_struk || 'Terima kasih!'}\n\n\n`;

            const dataBytes = encoder.encode(receipt);
            const chunkSize = 20;
            for (let i = 0; i < dataBytes.length; i += chunkSize) {
                await printCharacteristic.writeValue(dataBytes.slice(i, i + chunkSize));
            }
            alert('Sukses mencetak via Bluetooth!');
        } catch (err) {
            console.error(err);
            alert('Gagal Bluetooth: ' + err.message);
        } finally {
            setIsPrintingBt(false);
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

                <div className="modal-actions" style={{ flexWrap: 'wrap', gap: '8px' }}>
                    <button className="btn btn-secondary" onClick={onClose} style={{ flex: '1 1 100%' }}>Tutup</button>
                    <button className="btn btn-secondary" onClick={handleSavePdf} disabled={isGeneratingPdf} style={{ flex: 1, background: 'var(--bg2)', minWidth: '90px', fontSize: '0.8rem' }}>
                        {isGeneratingPdf ? '⏳...' : '📄 PDF'}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleBluetoothPrint}
                        disabled={isPrintingBt}
                        style={{ flex: 1, minWidth: '90px', background: '#3b82f6', borderColor: '#3b82f6', fontSize: '0.8rem' }}
                        title="Print langsung ke Printer Thermal Bluetooth"
                    >
                        {isPrintingBt ? '⏳...' : '🖨️ BT Print'}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handlePrint}
                        style={{ flex: 1, minWidth: '90px', fontSize: '0.8rem' }}
                        title="Print konvensional via browser"
                    >
                        🖨️ Web Print
                    </button>
                    <button
                        className="btn btn-wa"
                        onClick={handleShareWhatsApp}
                        disabled={!customer.no_telepon}
                        title={!customer.no_telepon ? 'Nomor pelanggan tidak tersedia' : `Kirim ke ${customer.no_telepon}`}
                        style={{ flex: 1, minWidth: '90px', fontSize: '0.8rem' }}
                    >
                        <span>📲</span> WA
                    </button>
                </div>
            </div>
        </div>
    );
}
