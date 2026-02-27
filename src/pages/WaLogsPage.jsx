import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
}) : '-';

export default function WaLogsPage({ tenantId }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all'); // all | success | failed
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 20;

    const loadLogs = useCallback(async () => {
        if (!tenantId) return;
        setLoading(true);
        let query = supabase
            .from('wa_message_logs')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        if (filter === 'success') query = query.eq('is_success', true);
        if (filter === 'failed') query = query.eq('is_success', false);

        const { data } = await query;
        setLogs(data || []);
        setLoading(false);
    }, [tenantId, filter, page]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadLogs();
    }, [loadLogs]);

    const filtered = search
        ? logs.filter(l =>
            (l.destination_phone || '').includes(search) ||
            (l.message_body || '').toLowerCase().includes(search.toLowerCase())
        )
        : logs;

    const successCount = logs.filter(l => l.is_success).length;
    const failCount = logs.filter(l => !l.is_success).length;

    return (
        <div className="page">
            <div className="page-header">
                <div>
                    <h2>📱 Log WA</h2>
                    <p className="text-muted">Riwayat pengiriman notifikasi WhatsApp</p>
                </div>
                <button className="btn btn-icon" onClick={loadLogs}>🔄</button>
            </div>

            {/* Summary Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.6rem' }}>✅</span>
                    <div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--success)' }}>{successCount}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Terkirim</div>
                    </div>
                </div>
                <div className="card" style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.6rem' }}>❌</span>
                    <div>
                        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--error)' }}>{failCount}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Gagal</div>
                    </div>
                </div>
            </div>

            {/* Search */}
            <div style={{ position: 'relative', marginBottom: 10 }}>
                <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }}>🔍</span>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari no. HP atau isi pesan..."
                    style={{ paddingLeft: 36 }}
                />
                {search && (
                    <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>✕</button>
                )}
            </div>

            {/* Filter Tabs */}
            <div className="filter-scroll" style={{ marginBottom: 12 }}>
                <div className="filter-tabs">
                    {[
                        { id: 'all', label: 'Semua' },
                        { id: 'success', label: '✅ Berhasil' },
                        { id: 'failed', label: '❌ Gagal' },
                    ].map(f => (
                        <button key={f.id} className={`tab-btn ${filter === f.id ? 'active' : ''}`} onClick={() => { setFilter(f.id); setPage(0); }}>
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="loading-state"><div className="spinner" /></div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filtered.length === 0 && (
                        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                            Belum ada log pesan WA
                        </div>
                    )}
                    {filtered.map(log => (
                        <div key={log.id} className="card wa-log-card" style={{
                            padding: '12px 14px',
                            borderLeft: `3px solid ${log.is_success ? 'var(--success)' : 'var(--error)'}`,
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                        <span style={{
                                            fontSize: '0.68rem', fontWeight: 700, padding: '2px 7px', borderRadius: 20,
                                            background: log.is_success ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                                            color: log.is_success ? 'var(--success)' : 'var(--error)',
                                            border: `1px solid ${log.is_success ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                                        }}>
                                            {log.is_success ? '✓ TERKIRIM' : '✗ GAGAL'}
                                        </span>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--primary)' }}>
                                            {log.destination_phone}
                                        </span>
                                    </div>
                                    <div style={{
                                        fontSize: '0.8rem', color: 'var(--text-muted)',
                                        overflow: 'hidden', textOverflow: 'ellipsis',
                                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                        lineHeight: 1.5
                                    }}>
                                        {log.message_body}
                                    </div>
                                    {!log.is_success && log.response_body && (
                                        <div style={{ fontSize: '0.72rem', color: 'var(--error)', marginTop: 4, fontFamily: 'monospace', opacity: 0.8 }}>
                                            Error: {log.response_body?.substring(0, 80)}...
                                        </div>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                    {formatDate(log.created_at)}
                                    {log.response_code && (
                                        <div style={{ marginTop: 2, fontFamily: 'monospace', fontSize: '0.68rem', color: log.is_success ? 'var(--success)' : 'var(--error)' }}>
                                            HTTP {log.response_code}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {/* Pagination */}
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >← Prev</button>
                        <span style={{ padding: '6px 12px', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Hal. {page + 1}</span>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={filtered.length < PAGE_SIZE}
                        >Next →</button>
                    </div>
                </div>
            )}
        </div>
    );
}
