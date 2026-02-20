import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../hooks/useAuthStore';
import { useSettingsStore } from '../hooks/useSettingsStore';

const Login: React.FC = () => {
    const [isRegister, setIsRegister] = useState(false);
    const [handle, setHandle] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { setTokens, setUser } = useAuthStore();
    const { settings, updateSettings } = useSettingsStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            let response;

            if (isRegister) {
                response = await window.concord.register(
                    handle,
                    password,
                    displayName || handle,
                    settings.serverAddress
                );
            } else {
                response = await window.concord.login(
                    handle,
                    password,
                    settings.serverAddress
                );
            }

            setTokens(
                response.access_token,
                response.refresh_token,
                response.expires_in
            );

            try {
                const userInfo = await window.concord.getSelf();
                setUser({
                    id: userInfo.id,
                    handle: userInfo.handle,
                    displayName: userInfo.display_name,
                    avatarUrl: userInfo.avatar_url,
                });
            } catch (userErr) {
                console.error('Failed to fetch user info:', userErr);
            }

            navigate('/');
        } catch (err: any) {
            console.error('Auth error:', err);
            setError(err?.message || 'Authentication failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-dark-900 via-dark-800 to-dark-900 p-4">
            <div className="bg-dark-800 p-6 sm:p-8 rounded-lg shadow-2xl w-full max-w-md border border-dark-700">
                <div className="text-center mb-8">
                    <div className="text-5xl mb-4">💬</div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
                        {isRegister ? 'Create Account' : 'Welcome Back'}
                    </h1>
                    <p className="text-dark-400 text-sm sm:text-base">
                        {isRegister ? 'Join Concord today' : 'Sign in to continue'}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">
                            Server
                        </label>
                        <input
                            type="text"
                            value={settings.serverAddress}
                            onChange={(e) => updateSettings({ serverAddress: e.target.value })}
                            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition text-sm"
                            placeholder="https://concord.akarpov.ru"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">
                            Handle
                        </label>
                        <input
                            type="text"
                            value={handle}
                            onChange={(e) => setHandle(e.target.value)}
                            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                            placeholder="your_handle"
                            required
                        />
                    </div>

                    {isRegister && (
                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">
                                Display Name
                            </label>
                            <input
                                type="text"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                                placeholder="Your Name"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-dark-300 mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    {error && (
                        <div className="px-4 py-3 bg-red-500 bg-opacity-10 border border-red-500 text-red-500 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full px-4 py-3 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
                    >
                        {loading ? 'Please wait...' : isRegister ? 'Create Account' : 'Sign In'}
                    </button>
                </form>

                <div className="mt-6">
                    <button
                        onClick={() => {
                            setIsRegister(!isRegister);
                            setError('');
                        }}
                        className="block w-full text-center text-primary-400 hover:text-primary-300 text-sm transition"
                    >
                        {isRegister
                            ? 'Already have an account? Sign in'
                            : "Don't have an account? Sign up"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Login;