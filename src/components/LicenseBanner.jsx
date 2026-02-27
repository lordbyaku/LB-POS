export default function LicenseBanner({ status }) {
    if (!status || status === 'aktif') return null;

    const config = {
        masa_tenggang: {
            cls: 'banner-warning',
            text: '⚠️ Masa Tenggang — mode baca saja. Aktifkan lisensi untuk operasional penuh.',
        },
        kedaluwarsa: {
            cls: 'banner-error',
            text: '❌ Lisensi Kedaluwarsa — mode baca saja. Hubungi admin untuk perpanjangan.',
        },
    }[status];

    if (!config) return null;

    return (
        <div className={`license-banner ${config.cls}`} style={{ padding: '12px', textAlign: 'center', fontSize: '0.9rem', fontWeight: 'bold', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            {config.text}
        </div>
    );
}
