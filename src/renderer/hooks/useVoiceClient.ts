import { useState, useEffect, useCallback, useRef } from 'react';

export interface VoiceState {
    connected: boolean;
    connecting: boolean;
    muted: boolean;
    deafened: boolean;
    videoEnabled: boolean;
    speaking: boolean;
    error: string | null;
    participants: Map<number, ParticipantState>;
}

export interface ParticipantState {
    userId: string;
    ssrc: number;
    speaking: boolean;
    muted: boolean;
    videoEnabled: boolean;
}

export const useVoiceClient = (roomId?: string) => {
    const [state, setState] = useState<VoiceState>({
        connected: false,
        connecting: false,
        muted: false,
        deafened: false,
        videoEnabled: false,
        speaking: false,
        error: null,
        participants: new Map(),
    });

    const stateRef = useRef(state);
    stateRef.current = state;

    const roomIdRef = useRef(roomId);
    roomIdRef.current = roomId;

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    const startAudioMonitoring = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;

            const audioContext = new AudioContext();
            const analyser = audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.8;

            const source = audioContext.createMediaStreamSource(stream);
            source.connect(analyser);

            audioContextRef.current = audioContext;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            let lastSpeakingState = false;

            const checkVolume = () => {
                if (!analyserRef.current) return;

                const currentState = stateRef.current;

                if (currentState.muted || currentState.deafened) {
                    if (lastSpeakingState) {
                        setState(prev => ({ ...prev, speaking: false }));
                        lastSpeakingState = false;
                    }
                    animationFrameRef.current = requestAnimationFrame(checkVolume);
                    return;
                }

                analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;

                const threshold = 25;
                const isSpeaking = average > threshold;

                if (isSpeaking !== lastSpeakingState) {
                    setState(prev => ({ ...prev, speaking: isSpeaking }));
                    lastSpeakingState = isSpeaking;
                }

                animationFrameRef.current = requestAnimationFrame(checkVolume);
            };

            checkVolume();
        } catch (err) {
            console.error('Failed to start audio monitoring:', err);
        }
    }, []);

    const stopAudioMonitoring = useCallback(() => {
        if (animationFrameRef.current !== null) {
            cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        }

        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop());
            micStreamRef.current = null;
        }

        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }

        analyserRef.current = null;
    }, []);

    useEffect(() => {
        const handleSpeaking = (data: any) => {
            setState(prev => {
                const participants = new Map(prev.participants);
                const participant = participants.get(data.ssrc);

                if (participant) {
                    participant.speaking = data.speaking;
                    participants.set(data.ssrc, participant);
                }

                return { ...prev, participants };
            });
        };

        const handleError = (error: string) => {
            setState(prev => ({
                ...prev,
                error,
                connected: false,
                connecting: false,
            }));
        };

        const handleReconnected = () => {
            setState(prev => ({
                ...prev,
                connected: true,
                error: null,
            }));
        };

        window.concord.onVoiceSpeaking?.(handleSpeaking);
        window.concord.onVoiceError?.(handleError);
        window.concord.onVoiceReconnected?.(handleReconnected);

        return () => {
            stopAudioMonitoring();
        };
    }, [stopAudioMonitoring]);

    const connect = useCallback(async (audioOnly: boolean = false) => {
        const currentRoomId = roomIdRef.current;
        if (!currentRoomId || stateRef.current.connected) return;

        setState(prev => ({ ...prev, connecting: true, error: null }));

        try {
            let hasAudio = true;
            let hasVideo = !audioOnly;

            try {
                await navigator.mediaDevices.getUserMedia({ audio: true });
            } catch {
                hasAudio = false;
            }

            if (!audioOnly) {
                try {
                    await navigator.mediaDevices.getUserMedia({ video: true });
                } catch {
                    hasVideo = false;
                }
            }

            if (!hasAudio) {
                setState(prev => ({
                    ...prev,
                    connecting: false,
                    error: 'Microphone not available. You can still listen.',
                    muted: true,
                }));
            }

            const result = await window.concord.joinVoice(currentRoomId, !hasVideo);

            const participants = new Map<number, ParticipantState>();

            if (result.participants && Array.isArray(result.participants)) {
                result.participants.forEach((p: any) => {
                    participants.set(p.ssrc, {
                        userId: p.user_id,
                        ssrc: p.ssrc,
                        speaking: false,
                        muted: p.muted,
                        videoEnabled: p.video_enabled,
                    });
                });
            }

            setState(prev => ({
                ...prev,
                connected: true,
                connecting: false,
                videoEnabled: hasVideo,
                muted: !hasAudio,
                participants,
            }));

            if (hasAudio) {
                await startAudioMonitoring();
            }
        } catch (err: any) {
            setState(prev => ({
                ...prev,
                connecting: false,
                error: err?.message || 'Failed to join voice',
            }));
        }
    }, [startAudioMonitoring]);

    const disconnect = useCallback(async () => {
        const currentRoomId = roomIdRef.current;
        if (!stateRef.current.connected || !currentRoomId) return;

        try {
            await window.concord.leaveVoice(currentRoomId);

            stopAudioMonitoring();

            setState({
                connected: false,
                connecting: false,
                muted: false,
                deafened: false,
                videoEnabled: false,
                speaking: false,
                error: null,
                participants: new Map(),
            });
        } catch (err: any) {
            console.error('Failed to leave voice:', err);
        }
    }, [stopAudioMonitoring]);

    const setMuted = useCallback(async (muted: boolean) => {
        const currentRoomId = roomIdRef.current;
        if (!currentRoomId) return;

        try {
            const currentState = stateRef.current;
            await window.concord.setMediaPrefs(
                currentRoomId,
                !currentState.videoEnabled,
                currentState.videoEnabled,
                muted
            );
            setState(prev => ({ ...prev, muted, speaking: muted ? false : prev.speaking }));
        } catch (err: any) {
            console.error('Failed to set muted:', err);
        }
    }, []);

    const setDeafened = useCallback((deafened: boolean) => {
        setState(prev => ({ ...prev, deafened, speaking: false }));

        if (deafened) {
            setMuted(true);
        }
    }, [setMuted]);

    const setVideoEnabled = useCallback(async (enabled: boolean) => {
        const currentRoomId = roomIdRef.current;
        if (!currentRoomId) return;

        try {
            const currentState = stateRef.current;
            await window.concord.setMediaPrefs(
                currentRoomId,
                !enabled,
                enabled,
                currentState.muted
            );
            setState(prev => ({ ...prev, videoEnabled: enabled }));
        } catch (err: any) {
            console.error('Failed to set video enabled:', err);
        }
    }, []);

    return {
        state,
        connect,
        disconnect,
        setMuted,
        setDeafened,
        setVideoEnabled,
    };
};