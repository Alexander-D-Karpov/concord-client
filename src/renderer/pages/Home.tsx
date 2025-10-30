import React, { useEffect, useState } from 'react';
import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';
import MemberList from '../components/MemberList';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { useEventStream } from '../hooks/useEventStream';

const Home: React.FC = () => {
    const { setRooms } = useRoomsStore();
    const { tokens, user, setUser, startTokenRefresh, isRefreshing, isInitializing } = useAuthStore();
    const { settings } = useSettingsStore();
    const { connected, reconnecting } = useEventStream();
    const [showSidebar, setShowSidebar] = useState(false);
    const [showMemberList, setShowMemberList] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadUserAndRooms = async () => {
            if (!tokens?.accessToken || isInitializing) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);

                if (!user) {
                    const userInfo = await window.concord.getSelf();
                    setUser({
                        id: userInfo.id,
                        handle: userInfo.handle,
                        displayName: userInfo.display_name,
                        avatarUrl: userInfo.avatar_url,
                    });
                }

                const res = await window.concord.getRooms();
                const rooms = (res?.rooms ?? []).map((r: any) => ({
                    id: r.id,
                    name: r.name,
                    createdBy: r.created_by,
                    voiceServerId: r.voice_server_id,
                    region: r.region,
                    createdAt: new Date(Number(r.created_at?.seconds || 0) * 1000).toISOString(),
                }));
                setRooms(rooms);

                startTokenRefresh();
            } catch (err) {
                console.error('Failed to load data:', err);
            } finally {
                setLoading(false);
            }
        };

        if (!isInitializing) {
            loadUserAndRooms();
        }
    }, [tokens?.accessToken, user, setRooms, setUser, settings.serverAddress, startTokenRefresh, isInitializing]);

    useEffect(() => {
        const handleKeyPress = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (showSidebar) {
                    setShowSidebar(false);
                } else if (showMemberList) {
                    setShowMemberList(false);
                }
            }

            if (e.ctrlKey || e.metaKey) {
                switch (e.key) {
                    case 'b':
                        e.preventDefault();
                        setShowSidebar(prev => !prev);
                        break;
                    case 'u':
                        e.preventDefault();
                        setShowMemberList(prev => !prev);
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyPress);
        return () => window.removeEventListener('keydown', handleKeyPress);
    }, [showSidebar, showMemberList]);

    if (loading || isInitializing || isRefreshing) {
        return (
            <div className="flex h-screen items-center justify-center bg-dark-900">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white text-lg">
                        {isInitializing ? 'Initializing...' : isRefreshing ? 'Refreshing session...' : 'Loading...'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen overflow-hidden relative bg-dark-900">
            <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="lg:hidden fixed top-4 left-4 z-30 p-2 bg-dark-800 rounded-lg border border-dark-700 text-white shadow-lg"
                title="Toggle Sidebar (Ctrl+B)"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            <button
                onClick={() => setShowMemberList(!showMemberList)}
                className="lg:hidden fixed top-4 right-4 z-30 p-2 bg-dark-800 rounded-lg border border-dark-700 text-white shadow-lg"
                title="Toggle Members (Ctrl+U)"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
            </button>

            {showSidebar && (
                <div
                    className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
                    onClick={() => setShowSidebar(false)}
                />
            )}

            <div
                className={`fixed lg:relative inset-y-0 left-0 z-50 transform transition-transform duration-300 ${
                    showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}
            >
                <Sidebar />
            </div>

            <Chat />

            {settings.showMemberList && (
                <>
                    {showMemberList && (
                        <div
                            className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
                            onClick={() => setShowMemberList(false)}
                        />
                    )}
                    <div
                        className={`fixed lg:relative inset-y-0 right-0 z-50 transform transition-transform duration-300 lg:block ${
                            showMemberList ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
                        }`}
                    >
                        <MemberList />
                    </div>
                </>
            )}

            {reconnecting && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-yellow-500 bg-opacity-10 border border-yellow-500 text-yellow-500 px-3 py-2 rounded-lg text-xs sm:text-sm flex items-center space-x-2 z-20">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span>Reconnecting...</span>
                </div>
            )}

            {!connected && !reconnecting && (
                <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-3 py-2 rounded-lg text-xs sm:text-sm flex items-center space-x-2 z-20">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>Disconnected</span>
                </div>
            )}

            <div className="hidden lg:block fixed bottom-4 right-4 bg-dark-800 border border-dark-700 rounded-lg p-3 text-xs text-dark-400 z-10">
                <div className="font-semibold mb-2">Keyboard Shortcuts:</div>
                <div className="space-y-1">
                    <div><kbd className="px-1.5 py-0.5 bg-dark-700 rounded">Ctrl+B</kbd> Toggle Sidebar</div>
                    <div><kbd className="px-1.5 py-0.5 bg-dark-700 rounded">Ctrl+U</kbd> Toggle Members</div>
                    <div><kbd className="px-1.5 py-0.5 bg-dark-700 rounded">ESC</kbd> Close Panels</div>
                </div>
            </div>
        </div>
    );
};

export default Home;