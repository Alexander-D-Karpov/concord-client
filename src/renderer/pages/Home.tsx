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
    const { tokens, user, setUser, startTokenRefresh } = useAuthStore();
    const { settings } = useSettingsStore();
    const { connected, reconnecting } = useEventStream();
    const [showSidebar, setShowSidebar] = useState(false);

    useEffect(() => {
        const loadUserAndRooms = async () => {
            if (!tokens?.accessToken) return;

            try {
                await window.concord.initializeClient(tokens.accessToken, settings.serverAddress);

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
            }
        };

        loadUserAndRooms();
    }, [tokens?.accessToken, user, setRooms, setUser, settings.serverAddress, startTokenRefresh]);

    return (
        <div className="flex h-screen overflow-hidden relative bg-dark-900">
            {/* Mobile menu button */}
            <button
                onClick={() => setShowSidebar(!showSidebar)}
                className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-dark-800 rounded-lg border border-dark-700 text-white"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
            </button>

            {/* Sidebar overlay for mobile */}
            {showSidebar && (
                <div
                    className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
                    onClick={() => setShowSidebar(false)}
                />
            )}

            {/* Sidebar */}
            <div
                className={`fixed lg:relative inset-y-0 left-0 z-40 transform transition-transform duration-300 ${
                    showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}
            >
                <Sidebar />
            </div>

            {/* Main chat area */}
            <Chat />

            {/* Member list - hidden on mobile */}
            {settings.showMemberList && (
                <div className="hidden lg:block">
                    <MemberList />
                </div>
            )}

            {/* Status indicators */}
            {reconnecting && (
                <div className="absolute top-4 right-4 bg-yellow-500 bg-opacity-10 border border-yellow-500 text-yellow-500 px-3 py-2 rounded-lg text-xs sm:text-sm flex items-center space-x-2 z-30">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></div>
                    <span>Reconnecting...</span>
                </div>
            )}

            {!connected && !reconnecting && (
                <div className="absolute top-4 right-4 bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-3 py-2 rounded-lg text-xs sm:text-sm flex items-center space-x-2 z-30">
                    <div className="w-2 h-2 bg-red-500 rounded-full"></div>
                    <span>Disconnected</span>
                </div>
            )}
        </div>
    );
};

export default Home;