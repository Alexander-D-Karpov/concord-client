import React, { useState, useCallback, useEffect } from 'react';
import { useVoiceClient } from '../hooks/useVoiceClient';
import { useAudioPlayback } from '../hooks/useAudioPlayback';
import { useAudioCapture } from '../hooks/useAudioCapture';
import DeviceSelector from './DeviceSelector';
import VideoGrid from './VideoGrid';
import { useVoiceStore } from '../hooks/useVoiceStore';
import { MicIcon, MicOffIcon, SpeakerIcon, VideoIcon, ScreenShareIcon, SettingsIcon, HangupIcon } from './icons';

interface VoiceControlsProps {
    roomId: string;
    isDM?: boolean;
}

interface ControlButtonProps {
    active?: boolean;
    danger?: boolean;
    always?: boolean;
    color?: 'default' | 'green';
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}

const ControlButton: React.FC<ControlButtonProps> = ({ active, danger, always, color = 'default', onClick, title, children }) => {
    const className = always && danger
        ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20'
        : active && danger
            ? 'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/20'
            : active && color === 'green'
                ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20'
                : active
                    ? 'bg-primary-600 hover:bg-primary-700 text-white shadow-lg shadow-primary-600/20'
                    : 'bg-white dark:bg-dark-700 text-gray-600 dark:text-dark-300 border border-gray-200 dark:border-dark-600 hover:bg-gray-100 dark:hover:bg-dark-600';
    return (
        <button type="button" onClick={onClick} title={title} aria-label={title} className={`inline-flex h-10 w-10 items-center justify-center rounded-2xl transition-all duration-200 sm:h-11 sm:w-11 ${className}`}>
            {children}
        </button>
    );
};

const VoiceControls: React.FC<VoiceControlsProps> = ({ roomId, isDM = false }) => {
    const { state, connect, disconnect, setMuted, setDeafened, setVideoEnabled, setScreenSharing, getSsrcToUserIdMap, toggleSubscription } = useVoiceClient(roomId);
    const [showSettings, setShowSettings] = useState(false);
    useAudioPlayback(state.connected, state.deafened);
    const { isSpeaking, audioLevel, error: audioCaptureError } = useAudioCapture(state.connected && !state.muted);

    useEffect(() => {
        if (state.connected || state.connecting) return;
        const store = useVoiceStore.getState();
        if (store.connecting && store.roomId === roomId && !store.connected) {
            connect(false, isDM);
        }
    }, [roomId, isDM, state.connected, state.connecting, connect]);

    const handleDisconnect = useCallback(async () => { await disconnect(); }, [disconnect]);
    const handleConnect = useCallback(async () => { await connect(false, isDM); }, [connect, isDM]);

    if (state.connecting) {
        return <div className="flex h-full items-center justify-center p-6"><div className="flex items-center gap-2 text-sm text-gray-500 dark:text-dark-400"><div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" /><span>Connecting...</span></div></div>;
    }

    if (!state.connected) {
        return (
            <div className="flex h-full items-center justify-center p-4 sm:p-6">
                <div className="w-full max-w-sm rounded-3xl border border-gray-200 bg-white/80 p-5 text-center shadow-lg backdrop-blur-xl dark:border-dark-700 dark:bg-dark-800/80">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-600/10 text-primary-500"><VideoIcon /></div>
                    <div className="mb-1 text-base font-semibold text-gray-900 dark:text-white">{isDM ? 'Call disconnected' : 'Join voice for this room'}</div>
                    <div className="mb-4 text-sm text-gray-500 dark:text-dark-400">Connect to voice and video.</div>
                    {state.error && <div className="mb-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">{state.error}</div>}
                    <div className="flex items-center justify-center gap-2">
                        <button type="button" onClick={handleConnect} className="inline-flex items-center gap-2 rounded-2xl bg-primary-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-primary-700"><VideoIcon size="sm" />{isDM ? 'Rejoin Call' : 'Join Voice'}</button>
                        <button type="button" onClick={() => setShowSettings(true)} title="Settings" className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gray-100 text-gray-600 transition hover:bg-gray-200 dark:bg-dark-600 dark:text-dark-300 dark:hover:bg-dark-500"><SettingsIcon /></button>
                    </div>
                </div>
                {showSettings && <DeviceSelector onClose={() => setShowSettings(false)} />}
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col">
            {(state.error || audioCaptureError) && (
                <div className="mx-3 mt-3 rounded-2xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-500">
                    {audioCaptureError || state.error}
                </div>
            )}
            <div className="flex-1 min-h-0 overflow-hidden p-2 sm:p-3">
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
                    localQuality={state.localQuality}
                />
            </div>
            <div className="flex-shrink-0 border-t border-gray-200 bg-white/80 px-3 py-3 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-800/80 sm:px-4">
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="text-sm font-semibold text-gray-900 dark:text-white">Voice connected</div>
                            <div className="text-xs text-gray-500 dark:text-dark-400">{state.participants.size || 1} participant{(state.participants.size || 1) === 1 ? '' : 's'}</div>
                        </div>
                        <div className="hidden sm:flex items-center gap-2 text-xs text-gray-500 dark:text-dark-400">
                            {!state.muted && !state.deafened ? <><span className="inline-flex h-2 w-2 rounded-full bg-green-500" /><span>Mic live</span></> : state.muted ? <span>Muted</span> : <span>Deafened</span>}
                        </div>
                    </div>
                    {!state.muted && !state.deafened && (
                        <div className="overflow-hidden rounded-full bg-gray-200 dark:bg-dark-600">
                            <div className="h-1.5 bg-green-500 transition-all duration-75" style={{ width: `${audioLevel}%` }} />
                        </div>
                    )}
                    <div className="flex items-center justify-center gap-2 flex-wrap">
                        <ControlButton active={state.muted} danger onClick={() => setMuted(!state.muted)} title={state.muted ? 'Unmute' : 'Mute'}>{state.muted ? <MicOffIcon /> : <MicIcon />}</ControlButton>
                        <ControlButton active={state.deafened} danger onClick={() => setDeafened(!state.deafened)} title={state.deafened ? 'Undeafen' : 'Deafen'}><SpeakerIcon /></ControlButton>
                        <ControlButton active={state.videoEnabled} onClick={() => setVideoEnabled(!state.videoEnabled)} title={state.videoEnabled ? 'Camera off' : 'Camera on'}><VideoIcon /></ControlButton>
                        <ControlButton active={state.screenSharing} color="green" onClick={() => setScreenSharing(!state.screenSharing)} title={state.screenSharing ? 'Stop share' : 'Share screen'}><ScreenShareIcon /></ControlButton>
                        <ControlButton onClick={() => setShowSettings(true)} title="Settings"><SettingsIcon /></ControlButton>
                        <ControlButton danger always onClick={handleDisconnect} title="Disconnect"><HangupIcon /></ControlButton>
                    </div>
                </div>
            </div>
            {showSettings && <DeviceSelector onClose={() => setShowSettings(false)} />}
        </div>
    );
};

export default VoiceControls;
