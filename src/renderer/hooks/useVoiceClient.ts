import { useEffect, useRef, useCallback, useState } from 'react';

declare global {
    interface Window {
        concord: any;
    }
}

export interface ParticipantState {
    userId: string;
    audioSsrc: number;
    videoSsrc: number;
    muted: boolean;
    videoEnabled: boolean;
    speaking: boolean;
    displayName?: string;
    avatarUrl?: string;
}

export interface VoiceClientState {
    connected: boolean;
    connecting: boolean;
    muted: boolean;
    deafened: boolean;
    videoEnabled: boolean;
    screenSharing: boolean;
    error: string | null;
    participants: Map<string, ParticipantState>;
    localAudioSsrc?: number;
    localVideoSsrc?: number;
}

const initialState: VoiceClientState = {
    connected: false,
    connecting: false,
    muted: false,
    deafened: false,
    videoEnabled: false,
    screenSharing: false,
    error: null,
    participants: new Map(),
};

export function useVoiceClient(roomId: string) {
    const [state, setState] = useState<VoiceClientState>(initialState);

    const cleanupRef = useRef<(() => void)[]>([]);
    const roomIdRef = useRef(roomId);
    const mountedRef = useRef(true);
    const stateRef = useRef(state);
    const ssrcToUserIdRef = useRef<Map<number, string>>(new Map());
    const userInfoCacheRef = useRef<Map<string, { displayName: string; avatarUrl?: string }>>(new Map());

    useEffect(() => {
        stateRef.current = state;
    }, [state]);

    useEffect(() => {
        roomIdRef.current = roomId;
    }, [roomId]);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const safeSetState = useCallback((updater: (prev: VoiceClientState) => VoiceClientState) => {
        if (mountedRef.current) {
            setState(updater);
        }
    }, []);

    const fetchUserInfo = useCallback(async (userId: string): Promise<{ displayName: string; avatarUrl?: string }> => {
        const cached = userInfoCacheRef.current.get(userId);
        if (cached) return cached;
        if (!userId) return { displayName: 'Unknown' };

        try {
            const user = await window.concord.getUser(userId);
            const info = {
                displayName: user.display_name || user.handle || userId.split('-')[0],
                avatarUrl: user.avatar_url,
            };
            userInfoCacheRef.current.set(userId, info);
            return info;
        } catch (err) {
            console.warn('[useVoiceClient] Failed to fetch user info for:', userId, err);
            const fallback = { displayName: userId.split('-')[0] };
            userInfoCacheRef.current.set(userId, fallback);
            return fallback;
        }
    }, []);

    const setupEventListeners = useCallback(() => {
        console.log('[useVoiceClient] Setting up event listeners');

        const unsubSpeaking = window.concord.onVoiceSpeaking?.((data: any) => {
            if (!mountedRef.current) return;

            const ssrc = data.ssrc;
            const videoSsrc = data.video_ssrc || data.videoSsrc;
            const odUserId = data.user_id || data.userId || ssrcToUserIdRef.current.get(ssrc);

            if (!odUserId) {
                console.log('[useVoiceClient] Unknown SSRC speaking:', ssrc);
                return;
            }

            if (ssrc) ssrcToUserIdRef.current.set(ssrc, odUserId);
            if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, odUserId);

            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(odUserId);

                if (existing) {
                    participants.set(odUserId, {
                        ...existing,
                        speaking: data.speaking ?? existing.speaking,
                        muted: data.muted ?? existing.muted,
                        videoEnabled: data.video_enabled ?? data.videoEnabled ?? existing.videoEnabled,
                        audioSsrc: ssrc || existing.audioSsrc,
                        videoSsrc: videoSsrc || existing.videoSsrc,
                    });
                }
                return { ...prev, participants };
            });
        });

        const unsubParticipantJoined = window.concord.onVoiceParticipantJoined?.(async (data: any) => {
            if (!mountedRef.current) return;

            const odUserId = data.userId || data.user_id;
            if (!odUserId) return;

            const audioSsrc = data.ssrc || data.audioSsrc || data.audio_ssrc || 0;
            const videoSsrc = data.videoSsrc || data.video_ssrc || 0;

            console.log('[useVoiceClient] Participant joined:', odUserId, 'audio:', audioSsrc, 'video:', videoSsrc);

            if (audioSsrc) ssrcToUserIdRef.current.set(audioSsrc, odUserId);
            if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, odUserId);

            const userInfo = await fetchUserInfo(odUserId);

            safeSetState(prev => {
                const participants = new Map(prev.participants);
                participants.set(odUserId, {
                    userId: odUserId,
                    audioSsrc,
                    videoSsrc,
                    muted: data.muted ?? false,
                    videoEnabled: data.video_enabled ?? data.videoEnabled ?? (videoSsrc > 0),
                    speaking: false,
                    displayName: userInfo.displayName,
                    avatarUrl: userInfo.avatarUrl,
                });
                return { ...prev, participants };
            });
        });

        const unsubMediaState = window.concord.onVoiceMediaState?.((data: any) => {
            if (!mountedRef.current) return;

            const odUserId = data.user_id || data.userId;
            if (!odUserId) return;

            console.log('[useVoiceClient] Media state update:', data);

            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(odUserId);
                if (existing) {
                    participants.set(odUserId, {
                        ...existing,
                        muted: data.muted ?? existing.muted,
                        videoEnabled: data.video_enabled ?? data.videoEnabled ?? existing.videoEnabled,
                        videoSsrc: data.video_ssrc || data.videoSsrc || existing.videoSsrc,
                    });
                }
                return { ...prev, participants };
            });
        });

        const unsubError = window.concord.onVoiceError?.((error: string) => {
            if (!mountedRef.current) return;
            console.error('[useVoiceClient] Voice error:', error);
            safeSetState(prev => ({ ...prev, error }));
        });

        const unsubDisconnected = window.concord.onVoiceDisconnected?.(() => {
            if (!mountedRef.current) return;
            console.log('[useVoiceClient] Voice disconnected');
            ssrcToUserIdRef.current.clear();
            safeSetState(() => initialState);
        });

        const unsubReconnected = window.concord.onVoiceReconnected?.(() => {
            if (!mountedRef.current) return;
            console.log('[useVoiceClient] Voice reconnected');
            safeSetState(prev => ({ ...prev, connected: true, error: null }));
        });

        const handleVoiceStateChanged = (event: CustomEvent) => {
            if (!mountedRef.current) return;
            const data = event.detail;
            const odUserId = data.user_id;
            if (!odUserId) return;

            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(odUserId);
                if (existing) {
                    participants.set(odUserId, {
                        ...existing,
                        muted: data.muted ?? existing.muted,
                        videoEnabled: data.video_enabled ?? existing.videoEnabled,
                        speaking: data.speaking ?? existing.speaking,
                    });
                }
                return { ...prev, participants };
            });
        };

        const handleVoiceUserLeft = (event: CustomEvent) => {
            if (!mountedRef.current) return;
            const data = event.detail;
            const odUserId = data.user_id;
            if (!odUserId) return;

            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const participant = participants.get(odUserId);
                if (participant) {
                    if (participant.audioSsrc) ssrcToUserIdRef.current.delete(participant.audioSsrc);
                    if (participant.videoSsrc) ssrcToUserIdRef.current.delete(participant.videoSsrc);
                }
                participants.delete(odUserId);
                return { ...prev, participants };
            });
        };

        window.addEventListener('voice-state-changed', handleVoiceStateChanged as EventListener);
        window.addEventListener('voice-user-left', handleVoiceUserLeft as EventListener);

        if (unsubSpeaking) cleanupRef.current.push(unsubSpeaking);
        if (unsubParticipantJoined) cleanupRef.current.push(unsubParticipantJoined);
        if (unsubMediaState) cleanupRef.current.push(unsubMediaState);
        if (unsubError) cleanupRef.current.push(unsubError);
        if (unsubDisconnected) cleanupRef.current.push(unsubDisconnected);
        if (unsubReconnected) cleanupRef.current.push(unsubReconnected);

        cleanupRef.current.push(() => {
            window.removeEventListener('voice-state-changed', handleVoiceStateChanged as EventListener);
            window.removeEventListener('voice-user-left', handleVoiceUserLeft as EventListener);
        });
    }, [safeSetState, fetchUserInfo]);

    const connect = useCallback(async (audioOnly = false) => {
        if (!mountedRef.current) return;

        console.log('[useVoiceClient] Connect called, audioOnly:', audioOnly);

        cleanupRef.current.forEach(fn => {
            try { fn(); } catch (e) {}
        });
        cleanupRef.current = [];
        ssrcToUserIdRef.current.clear();

        setupEventListeners();

        safeSetState(prev => ({ ...prev, connecting: true, error: null }));

        try {
            console.log('[useVoiceClient] Calling joinVoice...');
            const result = await window.concord.joinVoice(roomId, audioOnly);
            console.log('[useVoiceClient] joinVoice returned:', result);

            if (!mountedRef.current) {
                console.log('[useVoiceClient] Component unmounted during connect');
                return;
            }

            const participants = new Map<string, ParticipantState>();

            if (result.participants && result.participants.length > 0) {
                const userInfoPromises = result.participants.map(async (p: any) => {
                    const odUserId = p.userId || p.user_id;
                    if (!odUserId || typeof odUserId !== 'string') {
                        console.warn('[useVoiceClient] participant missing userId', p);
                        return null;
                    }
                    const userInfo = await fetchUserInfo(odUserId);
                    return { ...p, odUserId, ...userInfo };
                });

                const enrichedParticipants = await Promise.all(userInfoPromises);

                for (const p of enrichedParticipants) {
                    const userId = p.odUserId;
                    const audioSsrc = p.ssrc || p.audioSsrc || p.audio_ssrc || 0;
                    const videoSsrc = p.video_ssrc || p.videoSsrc || 0;

                    if (audioSsrc) ssrcToUserIdRef.current.set(audioSsrc, userId);
                    if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, userId);

                    participants.set(userId, {
                        userId,
                        audioSsrc,
                        videoSsrc,
                        muted: p.muted || false,
                        videoEnabled: p.video_enabled || p.videoEnabled || (videoSsrc > 0),
                        speaking: false,
                        displayName: p.displayName,
                        avatarUrl: p.avatarUrl,
                    });
                }
            }

            console.log('[useVoiceClient] Connected with SSRCs - audio:', result.ssrc, 'video:', result.videoSsrc);

            safeSetState(prev => ({
                ...prev,
                connected: true,
                connecting: false,
                participants,
                localAudioSsrc: result.ssrc,
                localVideoSsrc: result.videoSsrc,
                videoEnabled: !audioOnly && result.videoSsrc > 0,
            }));

            // Fetch accurate participant state after a short delay
            setTimeout(async () => {
                if (!mountedRef.current) return;
                try {
                    const status = await window.concord.getVoiceStatus(roomId);
                    if (!status?.participants || !mountedRef.current) return;

                    safeSetState(prev => {
                        const updatedParticipants = new Map(prev.participants);

                        for (const p of status.participants) {
                            const odUserId = p.user_id;
                            const existing = updatedParticipants.get(odUserId);

                            if (existing) {
                                updatedParticipants.set(odUserId, {
                                    ...existing,
                                    muted: p.muted ?? existing.muted,
                                    videoEnabled: p.video_enabled ?? existing.videoEnabled,
                                });
                            }
                        }

                        return { ...prev, participants: updatedParticipants };
                    });
                } catch (err) {
                    console.error('[useVoiceClient] Failed to fetch initial voice status:', err);
                }
            }, 500);

        } catch (err: any) {
            console.error('[useVoiceClient] Connect error:', err);
            if (mountedRef.current) {
                safeSetState(prev => ({
                    ...prev,
                    connecting: false,
                    connected: false,
                    error: err?.message || 'Failed to connect',
                }));
            }
        }
    }, [roomId, setupEventListeners, safeSetState, fetchUserInfo]);

    const disconnect = useCallback(async () => {
        console.log('[useVoiceClient] Disconnecting...');

        cleanupRef.current.forEach(fn => {
            try { fn(); } catch (e) { console.error('Cleanup error:', e); }
        });
        cleanupRef.current = [];
        ssrcToUserIdRef.current.clear();

        try {
            await window.concord.leaveVoice(roomId);
        } catch (err) {
            console.error('Failed to leave voice:', err);
        }

        if (mountedRef.current) {
            setState(initialState);
        }
    }, [roomId]);

    const setMuted = useCallback((muted: boolean) => {
        safeSetState(prev => ({ ...prev, muted }));
        window.concord.setVoiceMediaState?.(muted, stateRef.current.videoEnabled).catch(() => {});
        window.concord.setMediaPrefs?.(roomId, false, stateRef.current.videoEnabled, muted).catch(() => {});
    }, [roomId, safeSetState]);

    const setDeafened = useCallback((deafened: boolean) => {
        safeSetState(prev => ({ ...prev, deafened, muted: deafened ? true : prev.muted }));
    }, [safeSetState]);

    const setVideoEnabled = useCallback((videoEnabled: boolean) => {
        safeSetState(prev => ({ ...prev, videoEnabled, screenSharing: videoEnabled ? false : prev.screenSharing }));
        window.concord.setVoiceMediaState?.(stateRef.current.muted, videoEnabled).catch(() => {});
        window.concord.setMediaPrefs?.(roomId, false, videoEnabled, stateRef.current.muted).catch(() => {});
    }, [roomId, safeSetState]);

    const setScreenSharing = useCallback((screenSharing: boolean) => {
        safeSetState(prev => ({ ...prev, screenSharing, videoEnabled: screenSharing ? false : prev.videoEnabled }));
        window.concord.setVoiceMediaState?.(stateRef.current.muted, screenSharing).catch(() => {});
        window.concord.setMediaPrefs?.(roomId, false, screenSharing, stateRef.current.muted).catch(() => {});
    }, [roomId, safeSetState]);

    const refreshParticipants = useCallback(async () => {
        try {
            const status = await window.concord.getVoiceStatus(roomId);
            if (!status?.participants || !mountedRef.current) return;

            const participants = new Map<string, ParticipantState>();

            const userInfoPromises = status.participants.map(async (p: any) => {
                const userInfo = await fetchUserInfo(p.user_id);
                return { ...p, ...userInfo };
            });

            const enrichedParticipants = await Promise.all(userInfoPromises);

            for (const p of enrichedParticipants) {
                const existing = stateRef.current.participants.get(p.user_id);

                participants.set(p.user_id, {
                    userId: p.user_id,
                    audioSsrc: existing?.audioSsrc || 0,
                    videoSsrc: existing?.videoSsrc || 0,
                    muted: !!p.muted,
                    videoEnabled: !!p.video_enabled,
                    speaking: existing?.speaking || false,
                    displayName: p.displayName,
                    avatarUrl: p.avatarUrl,
                });
            }

            safeSetState(prev => ({ ...prev, participants }));
        } catch (err) {
            console.error('[useVoiceClient] Failed to refresh participants:', err);
        }
    }, [roomId, safeSetState, fetchUserInfo]);

    const getSsrcToUserIdMap = useCallback((): Map<number, string> => {
        return new Map(ssrcToUserIdRef.current);
    }, []);

    useEffect(() => {
        return () => {
            cleanupRef.current.forEach(fn => {
                try { fn(); } catch (e) {}
            });
            cleanupRef.current = [];
        };
    }, []);

    return {
        state,
        connect,
        disconnect,
        setMuted,
        setDeafened,
        setVideoEnabled,
        setScreenSharing,
        refreshParticipants,
        getSsrcToUserIdMap,
    };
}