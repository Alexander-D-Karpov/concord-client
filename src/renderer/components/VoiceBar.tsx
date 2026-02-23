import React from 'react';
import { useVoiceStore } from '../hooks/useVoiceStore';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useDMStore } from '../hooks/useDMStore';
import { useNavigate } from 'react-router-dom';

const VoiceBar: React.FC = () => {
    const { connected, connecting, roomId, isDM, muted, deafened, setMuted, setDeafened } = useVoiceStore();
    const { rooms, setCurrentRoom } = useRoomsStore();
    const { channels, setCurrentChannel } = useDMStore();
    const navigate = useNavigate();

    if (!connected && !connecting) return null;

    const roomName = isDM
        ? channels.find(c => c.channel.id === roomId)?.otherUserDisplay || 'DM Call'
        : rooms.find(r => r.id === roomId)?.name || 'Voice Chat';

    const handleClick = () => {
        if (!roomId) return;
        if (isDM) {
            setCurrentRoom(null);
            setCurrentChannel(roomId);
        } else {
            setCurrentChannel(null);
            setCurrentRoom(roomId);
        }
        navigate('/');
    };

    const handleDisconnect = async () => {
        if (!roomId) return;
        try {
            await window.concord.leaveVoice(roomId);
        } catch {}
        useVoiceStore.getState().reset();
    };

    const toggleMute = () => {
        const next = !muted;
        setMuted(next);
        const state = useVoiceStore.getState();
        window.concord.setVoiceMediaState?.(next, state.videoEnabled, state.screenSharing).catch(() => {});
        if (roomId) {
            window.concord.setMediaPrefs?.(roomId, false, state.videoEnabled, next, state.screenSharing).catch(() => {});
        }
    };

    const toggleDeafen = () => {
        setDeafened(!deafened);
    };

    return (
        <div className="bg-dark-800 border-t border-dark-700 px-4 py-2 flex items-center justify-between shadow-lg flex-shrink-0 z-[60]">
            <button onClick={handleClick} className="flex items-center space-x-2 min-w-0 hover:bg-dark-700 rounded px-2 py-1 transition">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${connecting ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
                <span className="text-white text-sm font-medium truncate">{connecting ? 'Connecting...' : roomName}</span>
            </button>

            <div className="flex items-center space-x-1">
                <button
                    onClick={toggleMute}
                    className={`p-2 rounded-lg transition ${muted ? 'bg-red-600 text-white' : 'bg-dark-600 text-dark-300 hover:bg-dark-500'}`}
                    title={muted ? 'Unmute' : 'Mute'}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {muted ? (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        ) : (
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        )}
                    </svg>
                </button>

                <button
                    onClick={toggleDeafen}
                    className={`p-2 rounded-lg transition ${deafened ? 'bg-red-600 text-white' : 'bg-dark-600 text-dark-300 hover:bg-dark-500'}`}
                    title={deafened ? 'Undeafen' : 'Deafen'}
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                </button>

                <button
                    onClick={handleDisconnect}
                    className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                    title="Disconnect"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default VoiceBar;