import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const formatDate = (d) => d ? new Date(d).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';

export default function LogsPage({ tenantId }) {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadLogs = useCallback(async () => {
        setLoading(true);
        const { data } = await supabase
            .from('audit_logs')
            .select(`*, profiles ( nama )`)
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false })
            .limit(100);
        setLogs(data || []);
        setLoading(false);
    }, [tenantId]);

    useEffect(() => {
        if (tenantId) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            loadLogs();
        }
    }, [tenantId, loadLogs]);

    return (
        <div className="page">
            <div className="page-header">
                <h2>Log Aktivitas</h2>
                <button className="btn btn-icon" onClick={loadLogs}>🔄</button>
            </div>

            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                {loading ? <p style={{ padding: 20 }}>Memuat log...</p> : (
                    <div className="table-wrapper">
                        <table className="report-table">
                            <thead>
                                <tr><th>Waktu</th><th>User</th><th>Aksi</th><th>Detail</th></tr>
                            </thead>
                            <tbody>
                                {logs.map(log => (
                                    <tr key={log.id}>
                                        <td style={{ fontSize: '0.8rem' }}>{formatDate(log.created_at)}</td>
                                        <td>{log.profiles?.nama || 'System'}</td>
                                        <td><span className={`badge badge-info`}>{log.aksi}</span></td>
                                        <td style={{ fontSize: '0.8rem' }}>
                                            {log.entitas}
                                            {log.data_baru?.kode && <strong>: {log.data_baru.kode}</strong>}
                                            {log.data_lama?.kode && <strong>: {log.data_lama.kode}</strong>}
                                        </td>
                                    </tr>
                                ))}
                                {logs.length === 0 && <tr><td colSpan="4" style={{ textAlign: 'center', padding: 20 }}>Belum ada catatan aktivitas</td></tr>}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
