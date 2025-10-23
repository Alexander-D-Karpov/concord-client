import React, { useState } from 'react';
import { useAuthStore } from '@/hooks/useAuthStore';

const tsToIso = (ts: any): string => {
    if (!ts) return '';
    const ms = Number(ts.seconds ?? 0) * 1000 + Math.floor(Number(ts.nanos ?? 0) / 1e6);
    return new Date(ms).toISOString();
};

const Login: React.FC = () => {
    const [handle, setHandle] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { setUser, setTokens } = useAuthStore();

    const tsToIso = (ts: any): string => {
        if (!ts) return '';
        const seconds = Number(ts.seconds ?? 0);
        const nanos = Number(ts.nanos ?? 0);
        return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
    };

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const token = await window.concord.login(handle, password);
            setTokens({
                accessToken: token.access_token,
                refreshToken: token.refresh_token,
                expiresIn: token.expires_in,
            });

            const me = await window.concord.getSelf();

            setUser({
                id: me.id,
                handle: me.handle,
                displayName: me.display_name || me.handle,
                avatarUrl: me.avatar_url || undefined,
                createdAt: tsToIso(me.created_at),
            });
        } catch (err: any) {
            setError(err?.message || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-4">
            <div className="w-full max-w-md">
                <div className="bg-dark-800 rounded-2xl shadow-2xl p-8 border border-dark-700">
                    <div className="text-center mb-8">
                        <h1 className="text-4xl font-bold text-white mb-2">Concord</h1>
                        <p className="text-dark-400">Sign in to your account</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">
                                Handle
                            </label>
                            <input
                                type="text"
                                value={handle}
                                onChange={(e) => setHandle(e.target.value)}
                                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                placeholder="Enter your handle"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition"
                                placeholder="Enter your password"
                                required
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 px-4 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Signing in...' : 'Sign In'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default Login;