import React, { useState, useCallback } from 'react';
import { UserPlusIcon, SettingsIcon } from '../icons';
import { useVoiceStore } from '../../hooks/useVoiceStore';
import RoomSettingsModal from '../RoomSettingsModal';
import type { Room } from '../../utils/types';

interface ChatHeaderProps {
    room?: Room;
    onInvite: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ room, onInvite }) => {
    const voiceConnected = useVoiceStore((s) => s.connected);
    const voiceConnecting = useVoiceStore((s) => s.connecting);
    const voiceRoomId = useVoiceStore((s) => s.roomId);
    const [showSettings, setShowSettings] = useState(false);

    const isInThisRoom = !!room?.id && voiceConnected && voiceRoomId === room.id;
    const isConnectingThisRoom = !!room?.id && voiceConnecting && voiceRoomId === room.id;

    const handleJoinVoice = useCallback(() => {
        if (!room?.id || isInThisRoom || isConnectingThisRoom) return;

        const store = useVoiceStore.getState();
        if (store.connected && store.roomId && store.roomId !== room.id) {
            window.concord.leaveVoice(store.roomId).catch(() => {});
            store.reset();
        }

        store.setRoom(room.id, false);
        store.setConnecting(true);
    }, [room?.id, isInThisRoom, isConnectingThisRoom]);

    return (
        <>
            <div className="h-14 flex-shrink-0 border-b border-gray-200 bg-white/80 px-4 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-900/80">
                <div className="flex h-full items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                            <h2 className="truncate text-base font-semibold text-gray-900 dark:text-white">
                                # {room?.name || 'Unknown room'}
                            </h2>
                            {room?.description && (
                                <span className="hidden truncate text-sm text-gray-500 dark:text-dark-400 sm:block">
                                    — {room.description}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                        {isConnectingThisRoom ? (
                            <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-primary-500/20 bg-primary-500/10 px-3">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                                <span className="text-xs font-semibold text-primary-500">Connecting...</span>
                            </div>
                        ) : isInThisRoom ? (
                            <div className="inline-flex h-9 items-center gap-2 rounded-xl border border-green-500/20 bg-green-500/10 px-3">
                                <span className="text-xs font-semibold text-green-600 dark:text-green-400">In Voice</span>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={handleJoinVoice}
                                disabled={!room?.id}
                                title="Join voice"
                                className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-50 dark:text-dark-300 dark:hover:bg-dark-700 dark:hover:text-white"
                            >
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                                <span className="hidden sm:inline">Join Voice</span>
                            </button>
                        )}
                        <button type="button" onClick={onInvite} title="Invite people" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-700 dark:hover:text-white">
                            <UserPlusIcon className="text-current" />
                        </button>
                        {room && (
                            <button type="button" onClick={() => setShowSettings(true)} title="Room settings" className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-700 dark:hover:text-white">
                                <SettingsIcon size="sm" className="text-current" />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            {showSettings && room && <RoomSettingsModal room={room} onClose={() => setShowSettings(false)} />}
        </>
    );
};

export default ChatHeader;