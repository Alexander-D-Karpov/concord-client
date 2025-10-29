import React, { useState, useEffect } from 'react';
import { useVoiceClient } from '../hooks/useVoiceClient';
import { useRoomsStore } from '../hooks/useRoomsStore';
import VideoGrid from './VideoGrid';
import DeviceSelector from './DeviceSelector';

interface VoiceControlsProps {
    roomId: string;
}

const VoiceControls: React.FC<VoiceControlsProps> = ({ roomId }) => {
    const { state, connect, disconnect, setMuted, setDeafened, setVideoEnabled } = useVoiceClient(roomId);
    const { rooms } = useRoomsStore();
    const [showDeviceSelector, setShowDeviceSelector] = useState(false);
    const [speaking, setSpeaking] = useState(false);

    const currentRoom = rooms.find(r => r.id === roomId);

    useEffect(() => {
        let timeout: NodeJS.Timeout;
        if (state.speaking) {
            setSpeaking(true);
            timeout = setTimeout(() => setSpeaking(false), 300);
        }
        return () => clearTimeout(timeout);
    }, [state.speaking]);

    const toggleCall = async () => {
        if (state.connected) {
            await disconnect();
        } else {
            await connect(false);
        }
    };

    const toggleMute = () => setMuted(!state.muted);
    const toggleDeafen = () => setDeafened(!state.deafened);
    const toggleVideo = () => setVideoEnabled(!state.videoEnabled);

    if (state.connecting) {
        return (
            <div className="p-4 border-t border-dark-700 flex-shrink-0">
                <div className="text-center py-3 text-dark-400">
                    <div className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                        <span>Connecting to voice...</span>
                    </div>
                </div>
            </div>
        );
    }

    if (!state.connected) {
        return (
            <div className="p-4 border-t border-dark-700 flex-shrink-0">
                {state.error && (
                    <div className="mb-3 px-3 py-2 bg-red-500 bg-opacity-10 border border-red-500 text-red-500 text-sm rounded overflow-hidden">
                        <div className="font-semibold mb-1">Voice Connection Error</div>
                        <div className="text-xs break-words">{state.error}</div>
                    </div>
                )}
                <div className="flex space-x-2">
                    <button
                        onClick={toggleCall}
                        className="flex-1 px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition flex items-center justify-center space-x-2"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Join Voice</span>
                    </button>
                    <button
                        onClick={() => setShowDeviceSelector(true)}
                        className="px-4 py-3 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition"
                        title="Device Settings"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>

                {showDeviceSelector && (
                    <DeviceSelector onClose={() => setShowDeviceSelector(false)} />
                )}
            </div>
        );
    }

    const participantCount = state.participants.size;
    const activeSpeakers = Array.from(state.participants.values()).filter(p => p.speaking);

    return (
        <>
            {(state.videoEnabled || participantCount > 0) && (
                <VideoGrid
                    participants={Array.from(state.participants.values())}
                    localVideoEnabled={state.videoEnabled}
                />
            )}

            <div className="p-4 border-t border-dark-700 bg-dark-800 flex-shrink-0">
                <div className="bg-dark-700 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium text-white">Voice Connected</div>
                            {currentRoom && (
                                <span className="text-xs text-dark-400">
                                    · # {currentRoom.name}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center space-x-1">
                            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            <span className="text-xs text-dark-400">Live</span>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-dark-400">
                        <div className="flex items-center space-x-3">
                            <div className="flex items-center space-x-1">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                <span>{participantCount} participant{participantCount !== 1 && 's'}</span>
                            </div>

                            {activeSpeakers.length > 0 && (
                                <div className="flex items-center space-x-1">
                                    <div className={`w-3 h-3 rounded-full ${speaking ? 'bg-green-500' : 'bg-green-500/50'} transition-colors`}></div>
                                    <span>{activeSpeakers.length} speaking</span>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setShowDeviceSelector(true)}
                            className="hover:text-white transition"
                            title="Device Settings"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-5 gap-2">
                    <button
                        onClick={toggleMute}
                        className={`relative p-3 rounded-lg transition ${
                            state.muted
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-dark-600 hover:bg-dark-500 text-white'
                        }`}
                        title={state.muted ? 'Unmute' : 'Mute'}
                    >
                        {speaking && !state.muted && (
                            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        )}
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {state.muted ? (
                                <>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                </>
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            )}
                        </svg>
                    </button>

                    <button
                        onClick={toggleDeafen}
                        className={`p-3 rounded-lg transition ${
                            state.deafened
                                ? 'bg-red-600 hover:bg-red-700 text-white'
                                : 'bg-dark-600 hover:bg-dark-500 text-white'
                        }`}
                        title={state.deafened ? 'Undeafen' : 'Deafen'}
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                    </button>

                    <button
                        onClick={toggleVideo}
                        className={`p-3 rounded-lg transition ${
                            state.videoEnabled
                                ? 'bg-primary-600 hover:bg-primary-700 text-white'
                                : 'bg-dark-600 hover:bg-dark-500 text-white'
                        }`}
                        title={state.videoEnabled ? 'Disable Video' : 'Enable Video'}
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {state.videoEnabled ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            ) : (
                                <>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                                </>
                            )}
                        </svg>
                    </button>

                    <button
                        onClick={() => setShowDeviceSelector(true)}
                        className="p-3 bg-dark-600 hover:bg-dark-500 text-white rounded-lg transition"
                        title="Settings"
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>

                    <button
                        onClick={toggleCall}
                        className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                        title="Disconnect"
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                        </svg>
                    </button>
                </div>

                {showDeviceSelector && (
                    <DeviceSelector onClose={() => setShowDeviceSelector(false)} />
                )}
            </div>
        </>
    );
};

export default VoiceControls;