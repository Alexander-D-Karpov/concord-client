import React, { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useVoiceStore } from '../hooks/useVoiceStore';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useDMStore } from '../hooks/useDMStore';
import ConnectionBars from './ConnectionBars';
import { MicIcon, MicOffIcon, SpeakerIcon, HangupIcon, PhoneIcon } from './icons';

const VoiceBar: React.FC = () => {
    const {
        connected,
        connecting,
        roomId,
        isDM,
        muted,
        deafened,
        setMuted,
        setDeafened,
        localQuality,
    } = useVoiceStore();

    const { rooms, setCurrentRoom } = useRoomsStore();
    const { channels, setCurrentChannel } = useDMStore();
    const navigate = useNavigate();

    const voiceState = useVoiceStore();

    const isVisible = connected || connecting;

    const roomName = useMemo(() => {
        if (!roomId) return 'Voice Chat';

        if (isDM) {
            return channels.find((channel) => channel.channel.id === roomId)?.otherUserDisplay || 'DM Call';
        }

        return rooms.find((room) => room.id === roomId)?.name || 'Voice Chat';
    }, [channels, rooms, roomId, isDM]);

    const statusLabel = connecting ? 'Connecting...' : isDM ? 'Direct call active' : 'Voice connected';

    const handleOpenCall = useCallback(() => {
        if (!roomId) return;

        if (isDM) {
            setCurrentRoom(null);
            setCurrentChannel(roomId);
        } else {
            setCurrentChannel(null);
            setCurrentRoom(roomId);
        }

        navigate('/');
    }, [roomId, isDM, setCurrentRoom, setCurrentChannel, navigate]);

    const handleDisconnect = useCallback(async () => {
        if (!roomId) return;

        try {
            await window.concord.leaveVoice(roomId);
        } catch (err) {
            console.error('Failed to leave voice:', err);
        }

        useVoiceStore.getState().reset();
    }, [roomId]);

    const handleToggleMute = useCallback(() => {
        const nextMuted = !muted;
        setMuted(nextMuted);

        window.concord
            .setVoiceMediaState?.(nextMuted, voiceState.videoEnabled, voiceState.screenSharing)
            .catch(() => {});

        if (roomId) {
            window.concord
                .setMediaPrefs?.(roomId, false, voiceState.videoEnabled, nextMuted, voiceState.screenSharing)
                .catch(() => {});
        }
    }, [muted, setMuted, roomId, voiceState.videoEnabled, voiceState.screenSharing]);

    const handleToggleDeafen = useCallback(() => {
        setDeafened(!deafened);
    }, [deafened, setDeafened]);

    if (!isVisible) return null;

    return (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white/80 px-3 py-2 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-800/90 z-[60]">
            <div className="flex items-center justify-between gap-2 sm:gap-3">
                <button
                    type="button"
                    onClick={handleOpenCall}
                    className="group flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition hover:bg-gray-100 dark:hover:bg-dark-700"
                    title={connecting ? 'Open voice call' : `Open ${roomName}`}
                >
                    <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-500">
                        {connecting ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                        ) : (
                            <PhoneIcon size="sm" />
                        )}
                    </div>

                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {roomName}
                            </span>
                            {connected && <ConnectionBars quality={localQuality} size="sm" />}
                        </div>
                        <div className="truncate text-xs text-gray-500 dark:text-dark-400">
                            {statusLabel}
                        </div>
                    </div>
                </button>

                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        onClick={handleToggleMute}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                            muted
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-dark-300 dark:hover:bg-dark-500'
                        }`}
                        title={muted ? 'Unmute' : 'Mute'}
                        aria-label={muted ? 'Unmute' : 'Mute'}
                    >
                        {muted ? <MicOffIcon size="sm" /> : <MicIcon size="sm" />}
                    </button>

                    <button
                        type="button"
                        onClick={handleToggleDeafen}
                        className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition ${
                            deafened
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-dark-600 dark:text-dark-300 dark:hover:bg-dark-500'
                        }`}
                        title={deafened ? 'Undeafen' : 'Deafen'}
                        aria-label={deafened ? 'Undeafen' : 'Deafen'}
                    >
                        <SpeakerIcon size="sm" />
                    </button>

                    <button
                        type="button"
                        onClick={handleDisconnect}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-600 text-white transition hover:bg-red-700"
                        title="Disconnect"
                        aria-label="Disconnect"
                    >
                        <HangupIcon size="sm" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VoiceBar;