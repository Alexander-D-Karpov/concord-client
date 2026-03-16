import React, { useEffect, useState, useRef, useCallback } from 'react';
import Sidebar from '../components/Sidebar';
import Chat from '../components/Chat';
import DMChat from '../components/DMChat';
import MemberList from '../components/MemberList';
import CallPanel from '../components/CallPanel';
import SearchModal from '../components/SearchModal';
import ErrorBoundary from '../components/ErrorBoundary';
import { useNotificationStore } from '../hooks/useNotificationStore';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useDMStore } from '../hooks/useDMStore';
import useAuthStore from '../hooks/useAuthStore';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { useVoiceStore } from '../hooks/useVoiceStore';
import { useEventStream } from '../hooks/useEventStream';
import { useUsersStore } from '../hooks/useUsersStore';
import { mapRoom } from '../utils/mappers';

type MobileCallTab = 'chat' | 'call';

interface SearchNavigateResult {
    roomId?: string;
    channelId?: string;
    messageId?: string;
}

const Home: React.FC = () => {
    const { setRooms, currentRoomId, setCurrentRoom } = useRoomsStore();
    const { currentChannelId, setCurrentChannel, loadChannels } = useDMStore();
    const { tokens, setUser, isRefreshing, isInitializing } = useAuthStore();
    const { settings } = useSettingsStore();
    const setCachedUser = useUsersStore((s) => s.setUser);

    const voiceConnected = useVoiceStore((s) => s.connected);
    const voiceRoomId = useVoiceStore((s) => s.roomId);
    const voiceIsDM = useVoiceStore((s) => s.isDM);

    useEventStream();

    const isDesktopViewport = () => window.innerWidth >= 1024;

    const [isDesktop, setIsDesktop] = useState(isDesktopViewport);
    const [showSidebar, setShowSidebar] = useState(() => !isDesktopViewport());
    const [showMemberList, setShowMemberList] = useState(false);
    const [callPanelCollapsed, setCallPanelCollapsed] = useState(false);
    const [mobileTab, setMobileTab] = useState<MobileCallTab>('chat');
    const [showSearch, setShowSearch] = useState(false);
    const [loading, setLoading] = useState(true);

    const initializedRef = useRef(false);

    const voiceConnecting = useVoiceStore((s) => s.connecting);
    const isInCall = (voiceConnected || voiceConnecting) && !!voiceRoomId;
    const showCallPanel = isInCall && !callPanelCollapsed;
    const showDM = !!currentChannelId && !currentRoomId;

    const loadInitialData = useCallback(async () => {
        if (!tokens?.accessToken || isInitializing || isRefreshing || initializedRef.current) {
            if (!tokens?.accessToken) {
                setLoading(false);
            }
            return;
        }

        initializedRef.current = true;
        setLoading(true);

        try {
            const self = await window.concord.getSelf();

            setUser({
                id: self.id,
                handle: self.handle,
                displayName: self.display_name,
                avatarUrl: self.avatar_url,
                avatarThumbnailUrl: self.avatar_thumbnail_url,
                status: self.status,
                statusPreference: self.status_preference ?? self.status,
            });

            setCachedUser({
                id: self.id,
                handle: self.handle,
                displayName: self.display_name,
                avatarUrl: self.avatar_url,
                avatarThumbnailUrl: self.avatar_thumbnail_url,
                status: self.status,
                statusPreference: self.status_preference ?? self.status,
            });

            const roomsResponse = await window.concord.getRooms();
            setRooms((roomsResponse?.rooms ?? []).map(mapRoom));

            await loadChannels();

            try {
                await useNotificationStore.getState().syncUnreadFromApi();
            } catch (err) {
                console.error('[Home] Failed to sync unread counts:', err);
            }
        } catch (err) {
            console.error('[Home] Failed to initialize home view:', err);
            initializedRef.current = false;
        } finally {
            setLoading(false);
        }
    }, [
        tokens?.accessToken,
        isInitializing,
        isRefreshing,
        setUser,
        setCachedUser,
        setRooms,
        loadChannels,
    ]);

    useEffect(() => {
        const handleResize = () => {
            setIsDesktop(window.innerWidth >= 1024);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        if (isDesktop) {
            return;
        }

        // On narrow screens, if nothing is selected, keep the sidebar open
        if (!currentRoomId && !currentChannelId) {
            setShowSidebar(true);
        }
    }, [isDesktop, currentRoomId, currentChannelId]);

    useEffect(() => {
        if (isDesktop) {
            return;
        }

        // After selecting a room or DM on narrow screens, close the sidebar
        if (currentRoomId || currentChannelId) {
            setShowSidebar(false);
        }
    }, [isDesktop, currentRoomId, currentChannelId]);

    useEffect(() => {
        if (!isDesktop && showDM) {
            setShowMemberList(false);
        }
    }, [isDesktop, showDM]);

    useEffect(() => {
        if (!isInitializing && !isRefreshing) {
            loadInitialData();
        }
    }, [isInitializing, isRefreshing, loadInitialData]);

    useEffect(() => {
        if (!tokens?.accessToken) {
            initializedRef.current = false;
            setLoading(false);
        }
    }, [tokens?.accessToken]);

    useEffect(() => {
        if (isInCall) {
            setCallPanelCollapsed(false);
            setMobileTab('call');
        }
    }, [isInCall]);

    const handleSearchNavigate = useCallback(
        (result: SearchNavigateResult) => {
            if (result.roomId) {
                setCurrentChannel(null);
                setCurrentRoom(result.roomId);
                return;
            }

            if (result.channelId) {
                setCurrentRoom(null);
                setCurrentChannel(result.channelId);
            }
        },
        [setCurrentRoom, setCurrentChannel]
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            const isTypingTarget =
                !!target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable);

            if (isTypingTarget) {
                if (e.key === 'Escape') {
                    target.blur();
                }
                return;
            }

            if (e.key === 'Escape') {
                if (showSearch) {
                    setShowSearch(false);
                    return;
                }
                if (showSidebar) {
                    setShowSidebar(false);
                    return;
                }
                if (showMemberList) {
                    setShowMemberList(false);
                }
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setShowSearch(true);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
                e.preventDefault();
                setShowSidebar((prev) => !prev);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'u') {
                e.preventDefault();
                setShowMemberList((prev) => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [showSidebar, showMemberList, showSearch]);

    if (loading || isInitializing || isRefreshing) {
        return (
            <div className="flex h-screen items-center justify-center bg-white dark:bg-dark-900">
                <div className="rounded-2xl border border-gray-200 bg-white/80 px-6 py-5 text-center shadow-lg backdrop-blur-xl dark:border-dark-700 dark:bg-dark-800/80">
                    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
                    <p className="text-sm font-medium text-gray-600 dark:text-dark-300">
                        Loading your workspace...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative flex h-full overflow-hidden bg-white dark:bg-dark-900">
            {!isDesktop && !showSidebar && (
                <button
                    type="button"
                    onClick={() => setShowSidebar(true)}
                    className={`fixed left-3 z-30 rounded-xl border border-gray-200 bg-white/90 p-2 shadow-lg backdrop-blur-xl transition hover:bg-white dark:border-dark-700 dark:bg-dark-800/90 dark:hover:bg-dark-800 ${
                        isInCall ? 'top-14' : 'top-3'
                    }`}
                    title="Open sidebar"
                    aria-label="Open sidebar"
                >
                    <svg
                        className="h-5 w-5 text-gray-700 dark:text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 6h16M4 12h16M4 18h16"
                        />
                    </svg>
                </button>
            )}

            {!isDesktop && !showDM && settings.showMemberList && !showMemberList && currentRoomId && (
                <button
                    type="button"
                    onClick={() => setShowMemberList(true)}
                    className={`fixed right-3 z-30 rounded-xl border border-gray-200 bg-white/90 p-2 shadow-lg backdrop-blur-xl transition hover:bg-white dark:border-dark-700 dark:bg-dark-800/90 dark:hover:bg-dark-800 ${
                        isInCall ? 'top-14' : 'top-3'
                    }`}
                    title="Open members"
                    aria-label="Open members"
                >
                    <svg
                        className="h-5 w-5 text-gray-700 dark:text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5V9H2v11h5m10 0v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5m10 0H7m10 0h1m-11 0H6m6-14a4 4 0 110 8 4 4 0 010-8z"
                        />
                    </svg>
                </button>
            )}

            {showSidebar && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                    onClick={() => setShowSidebar(false)}
                />
            )}

            <div
                className={`fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 lg:relative lg:w-auto ${
                    showSidebar ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
                }`}
            >
                <ErrorBoundary name="Sidebar">
                    <Sidebar />
                </ErrorBoundary>
            </div>

            <div className="flex min-h-0 min-w-0 flex-1">
                {isInCall && (
                    <div className="absolute left-0 right-0 top-0 z-30 flex border-b border-gray-200 bg-white/90 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-800/90 md:hidden">
                         <button
                            type="button"
                            onClick={() => setMobileTab('chat')}
                            className={`flex-1 py-3 text-sm font-medium transition ${
                                mobileTab === 'chat'
                                    ? 'border-b-2 border-primary-500 text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-dark-400'
                            }`}
                        >
                            Chat
                        </button>

                        <button
                            type="button"
                            onClick={() => setMobileTab('call')}
                            className={`flex-1 py-3 text-sm font-medium transition ${
                                mobileTab === 'call'
                                    ? 'border-b-2 border-primary-500 text-gray-900 dark:text-white'
                                    : 'text-gray-500 dark:text-dark-400'
                            }`}
                        >
                            <span className="flex items-center justify-center gap-1.5">
                                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                                <span>Call</span>
                            </span>
                        </button>
                    </div>
                )}

                <div
                    className={`flex min-w-0 flex-1 flex-col ${
                        isInCall && mobileTab !== 'chat' ? 'hidden md:flex' : ''
                    } ${isInCall ? 'pt-12 md:pt-0' : ''}`}
                >
                    <ErrorBoundary name="Chat">
                        {showDM ? <DMChat /> : <Chat />}
                    </ErrorBoundary>
                </div>

                {showCallPanel && voiceRoomId && (
                    <div
                        className={`flex-shrink-0 ${
                            mobileTab !== 'call' ? 'hidden md:flex' : 'flex w-full'
                        } ${isInCall ? 'pt-12 md:pt-0' : ''} md:w-[420px] lg:w-[480px] xl:w-[540px]`}
                    >
                        <ErrorBoundary name="CallPanel">
                            <CallPanel
                                roomId={voiceRoomId}
                                isDM={voiceIsDM}
                                onCollapse={() => setCallPanelCollapsed(true)}
                            />
                        </ErrorBoundary>
                    </div>
                )}

                {isInCall && callPanelCollapsed && (
                    <button
                        type="button"
                        onClick={() => setCallPanelCollapsed(false)}
                        className="hidden w-10 flex-shrink-0 flex-col items-center justify-center border-l border-green-600/30 bg-green-600/10 transition hover:bg-green-600/20 md:flex"
                        title="Expand call panel"
                        aria-label="Expand call panel"
                    >
                        <div className="mb-2 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                        <svg
                            className="h-4 w-4 text-green-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 19l-7-7 7-7"
                            />
                        </svg>
                    </button>
                )}
            </div>

            {!showDM && settings.showMemberList && (
                <>
                    {showMemberList && (
                        <div
                            className="fixed inset-0 z-40 bg-black/50 lg:hidden"
                            onClick={() => setShowMemberList(false)}
                        />
                    )}

                    <div
                        className={`fixed inset-y-0 right-0 z-50 transform transition-transform duration-300 lg:relative lg:block ${
                            showMemberList ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
                        }`}
                    >
                        <ErrorBoundary name="MemberList">
                            <MemberList />
                        </ErrorBoundary>
                    </div>
                </>
            )}

            {showSearch && (
                <SearchModal
                    onClose={() => setShowSearch(false)}
                    onNavigate={handleSearchNavigate}
                />
            )}
        </div>
    );
};

export default Home;