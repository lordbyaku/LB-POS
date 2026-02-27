import { useState } from 'react';

export default function Navbar({ activePage, onNavigate, isGlobalAdmin, profile }) {
    const [showMore, setShowMore] = useState(false);

    const role = profile?.role || 'operator';
    const isOwner = role === 'owner' || isGlobalAdmin;

    const allItems = [
        { id: 'dashboard', icon: '🏠', label: 'Dashboard', show: true },
        { id: 'new-order', icon: '🛒', label: 'Kasir', show: isOwner || role === 'kasir' },
        { id: 'reports', icon: '📊', label: 'Laporan', show: isOwner || role === 'kasir' },
        { id: 'customers', icon: '👥', label: 'Pelanggan', show: isOwner || role === 'kasir' },
        { id: 'calendar', icon: '📅', label: 'Kalender', show: isOwner || role === 'kasir' },
        { id: 'services', icon: '🧺', label: 'Layanan', show: isOwner },
        { id: 'vouchers', icon: '🎟️', label: 'Voucher', show: isOwner },
        { id: 'inventory', icon: '📦', label: 'Stok', show: isOwner || role === 'kasir' },
        { id: 'expenses', icon: '💸', label: 'Biaya', show: isOwner },
        { id: 'license', icon: '🔑', label: 'Lisensi', show: isOwner },
        { id: 'settings', icon: '👤', label: 'Profil', show: true },
        { id: 'logs', icon: '📜', label: 'Log', show: isOwner },
        { id: 'wa-logs', icon: '📱', label: 'WA Log', show: isOwner },
        { id: 'admin', icon: '🛡️', label: 'Admin', show: isGlobalAdmin },
    ].filter(i => i.show);

    // Limit visible items to 4 + More button
    const visibleItems = allItems.slice(0, 4);
    const moreItems = allItems.slice(4);

    const handleNavigate = (id) => {
        onNavigate(id);
        setShowMore(false);
    };

    return (
        <nav className="bottom-nav">
            <div className="nav-container" style={{ display: 'flex', width: '100%', height: '100%' }}>
                {visibleItems.map(item => (
                    <button
                        key={item.id}
                        className={`nav-item ${activePage === item.id ? 'active' : ''}`}
                        onClick={() => handleNavigate(item.id)}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                    </button>
                ))}

                {/* More Button */}
                <button
                    className={`nav-item ${moreItems.some(i => i.id === activePage) ? 'active' : ''}`}
                    onClick={() => setShowMore(!showMore)}
                >
                    <span className="nav-icon">⋯</span>
                    <span className="nav-label">Lainnya</span>
                </button>
            </div>

            {showMore && (
                <>
                    <div className="status-menu-overlay" onClick={() => setShowMore(false)} />
                    <div className="status-menu" style={{
                        bottom: 'calc(var(--nav-h) + 10px)',
                        right: '10px',
                        left: 'auto',
                        width: '160px',
                        padding: '4px'
                    }}>
                        {moreItems.map(item => (
                            <button
                                key={item.id}
                                className="status-menu-item"
                                onClick={() => handleNavigate(item.id)}
                                style={{
                                    background: activePage === item.id ? 'var(--primary-glow)' : 'transparent',
                                    color: activePage === item.id ? 'var(--primary)' : 'var(--text)',
                                    display: 'flex',
                                    gap: '10px',
                                    alignItems: 'center',
                                    padding: '12px'
                                }}
                            >
                                <span>{item.icon}</span>
                                <span>{item.label}</span>
                            </button>
                        ))}
                    </div>
                </>
            )}
        </nav>
    );
}
