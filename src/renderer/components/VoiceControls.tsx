import React, { useState, useCallback, useEffect } from 'react';
import { useVoiceClient } from '../hooks/useVoiceClient';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useAudioCapture } from '../hooks/useAudioCapture';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useDMStore } from '../hooks/useDMStore';
import DeviceSelector from './DeviceSelector';
import VideoGrid from './VideoGrid';

interface VoiceControlsProps {
    roomId: string;
    isDM?: boolean;
}

const VoiceControls: React.FC<VoiceControlsProps> = ({ roomId, isDM = false }) => {
    const {
        state,
        connect,
        disconnect,
        setMuted,
        setDeafened,
        setVideoEnabled,
        setScreenSharing,
        getSsrcToUserIdMap,
        toggleSubscription
    } = useVoiceClient(roomId);

    const { rooms } = useRoomsStore();
    const { channels } = useDMStore();
    const [showSettings, setShowSettings] = useState(false);
    const [isFullscreenCall, setIsFullscreenCall] = useState(false);
    // Track intentional disconnect to prevent auto-rejoin
    const [userIntentionallyDisconnected, setUserIntentionallyDisconnected] = useState(false);

    useAudioPlayback(state.connected, state.deafened);
    const { isSpeaking, audioLevel } = useAudioCapture(state.connected && !state.muted);

    const roomName = isDM
        ? channels.find(c => c.channel.id === roomId)?.otherUserDisplay || 'DM Call'
        : rooms.find(r => r.id === roomId)?.name || 'Unknown Room';

    // Auto-connect for DM calls, but respect intentional disconnects
    useEffect(() => {
        if (isDM && !state.connected && !state.connecting && !userIntentionallyDisconnected) {
            console.log('[VoiceControls] Auto-connecting to DM call');
            connect(false, true);
        }
    }, [isDM, roomId, state.connected, state.connecting, connect, userIntentionallyDisconnected]);

    const handleDisconnect = useCallback(async () => {
        setUserIntentionallyDisconnected(true);
        setIsFullscreenCall(false);
        await disconnect();
    }, [disconnect]);

    const toggleCall = useCallback(async () => {
        if (state.connected) {
            await handleDisconnect();
        } else {
            setUserIntentionallyDisconnected(false);
            await connect(false, isDM);
        }
    }, [state.connected, handleDisconnect, connect, isDM]);

    const toggleFullscreen = useCallback(() => {
        setIsFullscreenCall(prev => !prev);
    }, []);

    if (state.connecting) {
        return (
            <div className="p-4 border-t border-dark-700 flex-shrink-0 bg-dark-800">
                <div className="text-center py-3 text-dark-400">
                    <div className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                        <span>Connecting to voice...</span>
                    </div>
                </div>
            </div>
        );
    }

    // If intentionally disconnected in a DM, show a rejoin button instead of controls
    if (!state.connected && isDM && userIntentionallyDisconnected) {
        return (
            <div className="p-4 border-t border-dark-700 flex-shrink-0">
                <button
                    onClick={() => {
                        setUserIntentionallyDisconnected(false);
                        connect(false, true);
                    }}
                    className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition"
                >
                    Rejoin Call
                </button>
            </div>
        );
    }

    if (!state.connected && !isDM) {
        return (
            <div className="p-4 border-t border-dark-700 flex-shrink-0">
                {state.error && (
                    <div className="mb-3 px-3 py-2 bg-red-500/10 border border-red-500 text-red-500 text-sm rounded">
                        {state.error}
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
                        onClick={() => setShowSettings(true)}
                        className="px-3 py-3 bg-dark-600 hover:bg-dark-500 text-white rounded-lg transition"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>
                {showSettings && <DeviceSelector onClose={() => setShowSettings(false)} />}
            </div>
        );
    }

    return (
        <div className={`flex-shrink-0 flex flex-col ${isFullscreenCall ? 'fixed inset-0 z-50 bg-dark-900' : ''}`}>
            <VideoGrid
                roomId={roomId}
                participants={state.participants}
                localVideoEnabled={state.videoEnabled}
                localScreenSharing={state.screenSharing}
                localMuted={state.muted}
                localSpeaking={isSpeaking}
                ssrcToUserId={getSsrcToUserIdMap()}
                disabledSSRCs={state.disabledSSRCs}
                toggleSubscription={toggleSubscription}
                isFullscreenCall={isFullscreenCall}
                onToggleFullscreen={toggleFullscreen}
            />

            <div className={`p-4 border-t border-dark-700 bg-dark-800 ${isFullscreenCall ? 'absolute bottom-0 left-0 right-0' : ''}`}>
                <div className="bg-dark-700 rounded-lg p-3 mb-3">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                            <div className="text-sm font-medium text-white">Voice Connected</div>
                            <span className="text-xs text-dark-400">· {roomName}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full ${isSpeaking ? 'bg-green-500 animate-pulse' : 'bg-dark-500'}`} />
                            <span className="text-xs text-dark-400">{isSpeaking ? 'Speaking' : 'Silent'}</span>
                            <button onClick={() => setShowSettings(true)} className="p-1 hover:bg-dark-600 rounded transition">
                                <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    <div className="text-xs text-dark-400 mb-2">{state.participants.size} participant(s)</div>
                    {!state.muted && (
                        <div className="h-1 bg-dark-600 rounded-full overflow-hidden">
                            <div className="h-full bg-green-500 transition-all duration-75" style={{ width: `${audioLevel}%` }} />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-6 gap-2">
                    <button
                        onClick={() => setMuted(!state.muted)}
                        className={`p-3 rounded-lg transition ${state.muted ? 'bg-red-600 hover:bg-red-700' : 'bg-dark-600 hover:bg-dark-500'} text-white`}
                        title={state.muted ? 'Unmute' : 'Mute'}
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {state.muted ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            )}
                        </svg>
                    </button>

                    <button
                        onClick={() => setDeafened(!state.deafened)}
                        className={`p-3 rounded-lg transition ${state.deafened ? 'bg-red-600 hover:bg-red-700' : 'bg-dark-600 hover:bg-dark-500'} text-white`}
                        title={state.deafened ? 'Undeafen' : 'Deafen'}
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        </svg>
                    </button>

                    <button
                        onClick={() => setVideoEnabled(!state.videoEnabled)}
                        className={`p-3 rounded-lg transition ${state.videoEnabled ? 'bg-primary-600 hover:bg-primary-700' : 'bg-dark-600 hover:bg-dark-500'} text-white`}
                        title={state.videoEnabled ? 'Disable Video' : 'Enable Video'}
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>

                    <button
                        onClick={() => setScreenSharing(!state.screenSharing)}
                        className={`p-3 rounded-lg transition ${state.screenSharing ? 'bg-green-600 hover:bg-green-700' : 'bg-dark-600 hover:bg-dark-500'} text-white`}
                        title={state.screenSharing ? 'Stop Sharing' : 'Share Screen'}
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                    </button>

                    <button
                        onClick={toggleFullscreen}
                        className={`p-3 rounded-lg transition ${isFullscreenCall ? 'bg-primary-600 hover:bg-primary-700' : 'bg-dark-600 hover:bg-dark-500'} text-white`}
                        title={isFullscreenCall ? 'Exit Fullscreen' : 'Fullscreen'}
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {isFullscreenCall ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            )}
                        </svg>
                    </button>

                    <button
                        onClick={handleDisconnect}
                        className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                        title="Disconnect"
                    >
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                        </svg>
                    </button>
                </div>
            </div>
            {showSettings && <DeviceSelector onClose={() => setShowSettings(false)} />}
        </div>
    );
};

export default VoiceControls;