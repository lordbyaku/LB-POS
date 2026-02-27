import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function LoginPage({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleLogin(e) {
        e.preventDefault();
        setLoading(true);
        setError('');

        const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) {
            setError(authError.message);
        } else {
            onLogin(data.session);
        }
        setLoading(false);
    }

    return (
        <div className="login-page">
            <div className="login-card">
                <div className="login-logo">
                    <span className="logo-icon">🧺</span>
                    <h1>Laundry Komersial</h1>
                    <p>Sistem Operasional Laundry Indonesia</p>
                </div>

                <form onSubmit={handleLogin} className="login-form">
                    {error && <div className="alert alert-error">{error}</div>}

                    <div className="form-group">
                        <label htmlFor="email">Email</label>
                        <input
                            id="email"
                            type="email"
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="email@laundry.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
                        {loading ? 'Masuk...' : 'Masuk'}
                    </button>
                </form>

                <p className="login-footer">
                    Laundry Komersial Indonesia &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
