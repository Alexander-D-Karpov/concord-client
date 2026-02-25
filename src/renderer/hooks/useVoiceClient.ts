import { useEffect, useRef, useCallback, useState } from 'react';
import { useVoiceStore } from './useVoiceStore';

declare global {
    interface Window {
        concord: any;
    }
}

export interface ParticipantState {
    userId: string;
    audioSsrc: number;
    videoSsrc: number;
    screenSsrc?: number;
    muted: boolean;
    videoEnabled: boolean;
    screenSharing: boolean;
    speaking: boolean;
    displayName?: string;
    avatarUrl?: string;
    qualityTier?: number;
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
    localScreenSsrc?: number;
    disabledSSRCs: Set<number>;
    qualityPrefs: Map<number, number>;
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
    disabledSSRCs: new Set(),
    qualityPrefs: new Map(),
};

export function useVoiceClient(roomId: string) {
    const [state, setState] = useState<VoiceClientState>(() => {
        const store = useVoiceStore.getState();
        if (store.connected && store.roomId === roomId) {
            return {
                connected: true,
                connecting: false,
                muted: store.muted,
                deafened: store.deafened,
                videoEnabled: store.videoEnabled,
                screenSharing: store.screenSharing,
                error: null,
                participants: new Map(store.participants),
                localAudioSsrc: store.localAudioSsrc,
                localVideoSsrc: store.localVideoSsrc,
                localScreenSsrc: store.localScreenSsrc,
                disabledSSRCs: new Set(store.disabledSSRCs),
                qualityPrefs: new Map(),
            };
        }
        return initialState;
    });

    const cleanupRef = useRef<(() => void)[]>([]);
    const roomIdRef = useRef(roomId);
    const mountedRef = useRef(true);
    const stateRef = useRef(state);
    const ssrcToUserIdRef = useRef<Map<number, string>>(new Map());
    const userInfoCacheRef = useRef<Map<string, { displayName: string; avatarUrl?: string }>>(new Map());
    const subscriptionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { roomIdRef.current = roomId; }, [roomId]);
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

    const safeSetState = useCallback((updater: (prev: VoiceClientState) => VoiceClientState) => {
        if (mountedRef.current) setState(updater);
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
        } catch {
            const fallback = { displayName: userId.split('-')[0] };
            userInfoCacheRef.current.set(userId, fallback);
            return fallback;
        }
    }, []);

    const toggleSubscription = useCallback((ssrc: number) => {
        safeSetState(prev => {
            const nextDisabled = new Set(prev.disabledSSRCs);
            if (nextDisabled.has(ssrc)) nextDisabled.delete(ssrc);
            else nextDisabled.add(ssrc);
            return { ...prev, disabledSSRCs: nextDisabled };
        });
    }, [safeSetState]);

    const setQualityForSSRC = useCallback((ssrc: number, tier: number) => {
        safeSetState(prev => {
            const qp = new Map(prev.qualityPrefs);
            qp.set(ssrc, tier);
            return { ...prev, qualityPrefs: qp };
        });
    }, [safeSetState]);

    const pushSubscriptions = useCallback(() => {
        const s = stateRef.current;
        if (!s.connected) return;

        const activeSSRCs: number[] = [];
        s.participants.forEach(p => {
            if (p.audioSsrc) activeSSRCs.push(p.audioSsrc);
            if (p.videoSsrc && !s.disabledSSRCs.has(p.videoSsrc)) activeSSRCs.push(p.videoSsrc);
            if (p.screenSsrc && !s.disabledSSRCs.has(p.screenSsrc)) activeSSRCs.push(p.screenSsrc);
        });

        window.concord.updateVoiceSubscriptions?.(activeSSRCs).catch(() => {});
    }, []);

    useEffect(() => {
        if (!state.connected) return;
        pushSubscriptions();
    }, [state.participants, state.disabledSSRCs, state.connected, pushSubscriptions]);

    useEffect(() => {
        if (!state.connected) {
            if (subscriptionTimerRef.current) {
                clearInterval(subscriptionTimerRef.current);
                subscriptionTimerRef.current = null;
            }
            return;
        }

        subscriptionTimerRef.current = setInterval(() => {
            pushSubscriptions();
        }, 5000);

        return () => {
            if (subscriptionTimerRef.current) {
                clearInterval(subscriptionTimerRef.current);
                subscriptionTimerRef.current = null;
            }
        };
    }, [state.connected, pushSubscriptions]);

    const setupEventListeners = useCallback(() => {
        const unsubSpeaking = window.concord.onVoiceSpeaking?.((data: any) => {
            if (!mountedRef.current) return;
            const ssrc = data.ssrc;
            const videoSsrc = data.video_ssrc || data.videoSsrc;
            const uid = data.user_id || data.userId || ssrcToUserIdRef.current.get(ssrc);
            if (!uid) return;
            if (ssrc) ssrcToUserIdRef.current.set(ssrc, uid);
            if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, uid);

            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(uid);
                if (existing) {
                    participants.set(uid, {
                        ...existing,
                        speaking: data.speaking ?? existing.speaking,
                        audioSsrc: ssrc || existing.audioSsrc,
                        videoSsrc: videoSsrc || existing.videoSsrc,
                    });
                }
                return { ...prev, participants };
            });
        });

        const unsubParticipantJoined = window.concord.onVoiceParticipantJoined?.(async (data: any) => {
            if (!mountedRef.current) return;
            const uid = data.userId || data.user_id;
            if (!uid) return;
            const audioSsrc = data.ssrc || data.audioSsrc || data.audio_ssrc || 0;
            const videoSsrc = data.videoSsrc || data.video_ssrc || 0;
            const screenSsrc = data.screenSsrc || data.screen_ssrc || 0;
            if (audioSsrc) ssrcToUserIdRef.current.set(audioSsrc, uid);
            if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, uid);
            if (screenSsrc) ssrcToUserIdRef.current.set(screenSsrc, uid);

            const userInfo = await fetchUserInfo(uid);
            safeSetState(prev => {
                const participants = new Map(prev.participants);
                participants.set(uid, {
                    userId: uid, audioSsrc, videoSsrc, screenSsrc,
                    muted: data.muted ?? false,
                    videoEnabled: data.video_enabled ?? data.videoEnabled ?? (videoSsrc > 0),
                    screenSharing: data.screenSharing ?? data.screen_sharing ?? (screenSsrc > 0),
                    speaking: false,
                    displayName: userInfo.displayName,
                    avatarUrl: userInfo.avatarUrl,
                });
                return { ...prev, participants };
            });

            setTimeout(pushSubscriptions, 200);
        });

        const unsubMediaState = window.concord.onVoiceMediaState?.((data: any) => {
            if (!mountedRef.current) return;
            const uid = data.user_id || data.userId;
            if (!uid) return;
            const ssrc = (data.ssrc ?? 0) >>> 0;
            const videoSsrc = (data.videoSsrc ?? data.video_ssrc ?? 0) >>> 0;
            const screenSsrc = (data.screenSsrc ?? data.screen_ssrc ?? 0) >>> 0;
            if (ssrc) ssrcToUserIdRef.current.set(ssrc, uid);
            if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, uid);
            if (screenSsrc) ssrcToUserIdRef.current.set(screenSsrc, uid);

            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(uid);
                const updated: ParticipantState = {
                    userId: uid,
                    audioSsrc: ssrc || existing?.audioSsrc || 0,
                    videoSsrc: videoSsrc || existing?.videoSsrc || 0,
                    screenSsrc: screenSsrc || existing?.screenSsrc || 0,
                    muted: data.muted ?? existing?.muted ?? false,
                    videoEnabled: data.video_enabled ?? data.videoEnabled ?? existing?.videoEnabled ?? false,
                    screenSharing: data.screenSharing ?? data.screen_sharing ?? existing?.screenSharing ?? false,
                    speaking: existing?.speaking ?? false,
                    displayName: existing?.displayName,
                    avatarUrl: existing?.avatarUrl,
                };
                participants.set(uid, updated);
                if (!existing) {
                    fetchUserInfo(uid).then(info => {
                        safeSetState(prev2 => {
                            const p2 = new Map(prev2.participants);
                            const cur = p2.get(uid);
                            if (cur) p2.set(uid, { ...cur, displayName: info.displayName, avatarUrl: info.avatarUrl });
                            return { ...prev2, participants: p2 };
                        });
                    });
                }
                return { ...prev, participants };
            });

            setTimeout(pushSubscriptions, 200);
        });

        const unsubError = window.concord.onVoiceError?.((error: string) => {
            if (!mountedRef.current) return;
            safeSetState(prev => ({ ...prev, error }));
        });

        const unsubDisconnected = window.concord.onVoiceDisconnected?.(() => {
            if (!mountedRef.current) return;
            ssrcToUserIdRef.current.clear();
            safeSetState(() => initialState);
        });

        const unsubReconnected = window.concord.onVoiceReconnected?.(() => {
            if (!mountedRef.current) return;
            safeSetState(prev => ({ ...prev, connected: true, error: null }));
            setTimeout(pushSubscriptions, 500);
        });

        const handleVoiceUserLeft = (event: CustomEvent) => {
            if (!mountedRef.current) return;
            const uid = event.detail?.user_id;
            if (!uid) return;
            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const participant = participants.get(uid);
                if (participant) {
                    if (participant.audioSsrc) ssrcToUserIdRef.current.delete(participant.audioSsrc);
                    if (participant.videoSsrc) ssrcToUserIdRef.current.delete(participant.videoSsrc);
                    if (participant.screenSsrc) ssrcToUserIdRef.current.delete(participant.screenSsrc);
                }
                participants.delete(uid);
                return { ...prev, participants };
            });
        };

        const handleVoiceStateChanged = (event: CustomEvent) => {
            if (!mountedRef.current) return;
            const data = event.detail;
            const uid = data.user_id;
            if (!uid) return;
            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(uid);
                if (existing) {
                    participants.set(uid, {
                        ...existing,
                        muted: data.muted ?? existing.muted,
                        videoEnabled: data.video_enabled ?? existing.videoEnabled,
                        speaking: data.speaking ?? existing.speaking,
                        screenSharing: data.screen_sharing ?? existing.screenSharing,
                    });
                }
                return { ...prev, participants };
            });
        };

        window.addEventListener('voice-state-changed', handleVoiceStateChanged as EventListener);
        window.addEventListener('voice-user-left', handleVoiceUserLeft as EventListener);

        const cleanups: (() => void)[] = [];
        if (unsubSpeaking) cleanups.push(unsubSpeaking);
        if (unsubParticipantJoined) cleanups.push(unsubParticipantJoined);
        if (unsubMediaState) cleanups.push(unsubMediaState);
        if (unsubError) cleanups.push(unsubError);
        if (unsubDisconnected) cleanups.push(unsubDisconnected);
        if (unsubReconnected) cleanups.push(unsubReconnected);
        cleanups.push(() => {
            window.removeEventListener('voice-state-changed', handleVoiceStateChanged as EventListener);
            window.removeEventListener('voice-user-left', handleVoiceUserLeft as EventListener);
        });

        cleanupRef.current = cleanups;
    }, [safeSetState, fetchUserInfo, pushSubscriptions]);

    const connect = useCallback(async (audioOnly = false, isDM = false) => {
        if (!mountedRef.current) return;

        cleanupRef.current.forEach(fn => { try { fn(); } catch {} });
        cleanupRef.current = [];
        ssrcToUserIdRef.current.clear();

        setupEventListeners();
        safeSetState(prev => ({ ...prev, connecting: true, error: null }));
        useVoiceStore.getState().setConnecting(true);

        try {
            const result = await window.concord.joinVoice(roomId, audioOnly, isDM);
            if (!mountedRef.current) return;

            const participants = new Map<string, ParticipantState>();

            if (result.participants?.length > 0) {
                const enriched = await Promise.all(
                    result.participants.map(async (p: any) => {
                        const uid = p.userId || p.user_id;
                        if (!uid) return null;
                        const userInfo = await fetchUserInfo(uid);
                        return { ...p, uid, ...userInfo };
                    })
                );

                for (const p of enriched) {
                    if (!p) continue;
                    const audioSsrc = p.ssrc || p.audioSsrc || p.audio_ssrc || 0;
                    const videoSsrc = p.video_ssrc || p.videoSsrc || 0;
                    const screenSsrc = p.screen_ssrc || p.screenSsrc || 0;
                    if (audioSsrc) ssrcToUserIdRef.current.set(audioSsrc, p.uid);
                    if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, p.uid);
                    if (screenSsrc) ssrcToUserIdRef.current.set(screenSsrc, p.uid);

                    participants.set(p.uid, {
                        userId: p.uid, audioSsrc, videoSsrc, screenSsrc,
                        muted: !!p.muted,
                        videoEnabled: !!(p.video_enabled || p.videoEnabled || videoSsrc > 0),
                        screenSharing: !!(p.screen_sharing || p.screenSharing || screenSsrc > 0),
                        speaking: false,
                        displayName: p.displayName,
                        avatarUrl: p.avatarUrl,
                    });
                }
            }

            safeSetState(prev => ({
                ...prev,
                connected: true,
                connecting: false,
                participants,
                localAudioSsrc: result.ssrc,
                localVideoSsrc: result.videoSsrc,
                localScreenSsrc: result.screenSsrc,
                videoEnabled: !audioOnly && result.videoSsrc > 0,
            }));

            const voiceStore = useVoiceStore.getState();
            voiceStore.setRoom(roomId, isDM);
            voiceStore.setConnected(true);
            voiceStore.setConnecting(false);
            voiceStore.setLocalSSRCs(result.ssrc, result.videoSsrc, result.screenSsrc);
            voiceStore.setParticipants(participants);

            setTimeout(pushSubscriptions, 300);

            setTimeout(async () => {
                if (!mountedRef.current) return;
                try {
                    const status = await window.concord.getVoiceStatus(roomId);
                    if (!status?.participants || !mountedRef.current) return;
                    safeSetState(prev => {
                        const up = new Map(prev.participants);
                        for (const p of status.participants) {
                            const uid = p.user_id;
                            const existing = up.get(uid);
                            if (existing) {
                                up.set(uid, {
                                    ...existing,
                                    muted: p.muted ?? existing.muted,
                                    videoEnabled: p.video_enabled ?? existing.videoEnabled,
                                    screenSharing: p.screen_sharing ?? existing.screenSharing,
                                });
                            }
                        }
                        return { ...prev, participants: up };
                    });
                } catch {}
            }, 500);

        } catch (err: any) {
            useVoiceStore.getState().reset();
            if (mountedRef.current) {
                safeSetState(prev => ({
                    ...prev, connecting: false, connected: false,
                    error: err?.message || 'Failed to connect',
                }));
            }
        }
    }, [roomId, setupEventListeners, safeSetState, fetchUserInfo, pushSubscriptions]);

    useEffect(() => {
        const store = useVoiceStore.getState();
        if (store.connected && store.roomId === roomId) {
            safeSetState(prev => ({
                ...prev,
                connected: true, connecting: false,
                muted: store.muted, deafened: store.deafened,
                videoEnabled: store.videoEnabled, screenSharing: store.screenSharing,
                participants: new Map(store.participants),
                localAudioSsrc: store.localAudioSsrc,
                localVideoSsrc: store.localVideoSsrc,
                localScreenSsrc: store.localScreenSsrc,
                disabledSSRCs: new Set(store.disabledSSRCs),
                error: null,
            }));
            if (cleanupRef.current.length === 0) setupEventListeners();
        } else if (!store.connected || store.roomId !== roomId) {
            safeSetState(() => initialState);
        }
    }, [roomId, safeSetState, setupEventListeners]);

    const disconnect = useCallback(async () => {
        cleanupRef.current.forEach(fn => { try { fn(); } catch {} });
        cleanupRef.current = [];
        ssrcToUserIdRef.current.clear();
        useVoiceStore.getState().reset();
        try { await window.concord.leaveVoice(roomId); } catch {}
        try { await window.concord.endDMCall(roomId); } catch {}
        if (mountedRef.current) setState(initialState);
    }, [roomId]);

    const setMuted = useCallback((muted: boolean) => {
        safeSetState(prev => ({ ...prev, muted }));
        useVoiceStore.getState().setMuted(muted);
        window.concord.setVoiceMediaState?.(muted, stateRef.current.videoEnabled, stateRef.current.screenSharing).catch(() => {});
        window.concord.setMediaPrefs?.(roomId, false, stateRef.current.videoEnabled, muted, stateRef.current.screenSharing).catch(() => {});
    }, [roomId, safeSetState]);

    const setDeafened = useCallback((deafened: boolean) => {
        safeSetState(prev => ({ ...prev, deafened, muted: deafened ? true : prev.muted }));
        useVoiceStore.getState().setDeafened(deafened);
    }, [safeSetState]);

    const setVideoEnabled = useCallback((videoEnabled: boolean) => {
        safeSetState(prev => ({ ...prev, videoEnabled }));
        useVoiceStore.getState().setVideoEnabled(videoEnabled);
        window.concord.setVoiceMediaState?.(stateRef.current.muted, videoEnabled, stateRef.current.screenSharing).catch(() => {});
        window.concord.setMediaPrefs?.(roomId, false, videoEnabled, stateRef.current.muted, stateRef.current.screenSharing).catch(() => {});
    }, [roomId, safeSetState]);

    const setScreenSharing = useCallback((screenSharing: boolean) => {
        safeSetState(prev => ({ ...prev, screenSharing }));
        useVoiceStore.getState().setScreenSharing(screenSharing);
        window.concord.setVoiceMediaState?.(stateRef.current.muted, stateRef.current.videoEnabled, screenSharing).catch(() => {});
        window.concord.setMediaPrefs?.(roomId, false, stateRef.current.videoEnabled, stateRef.current.muted, screenSharing).catch(() => {});
    }, [roomId, safeSetState]);

    const getSsrcToUserIdMap = useCallback((): Map<number, string> => {
        return new Map(ssrcToUserIdRef.current);
    }, []);

    const refreshParticipants = useCallback(async () => {
        try {
            const status = await window.concord.getVoiceStatus(roomId);
            if (!status?.participants || !mountedRef.current) return;
            const participants = new Map<string, ParticipantState>();
            const enriched = await Promise.all(
                status.participants.map(async (p: any) => {
                    const userInfo = await fetchUserInfo(p.user_id);
                    return { ...p, ...userInfo };
                })
            );
            for (const p of enriched) {
                const existing = stateRef.current.participants.get(p.user_id);
                participants.set(p.user_id, {
                    userId: p.user_id,
                    audioSsrc: existing?.audioSsrc || 0,
                    videoSsrc: existing?.videoSsrc || 0,
                    screenSsrc: existing?.screenSsrc || 0,
                    muted: !!p.muted,
                    videoEnabled: !!p.video_enabled,
                    screenSharing: !!p.screen_sharing,
                    speaking: existing?.speaking || false,
                    displayName: p.displayName,
                    avatarUrl: p.avatarUrl,
                });
            }
            safeSetState(prev => ({ ...prev, participants }));
            setTimeout(pushSubscriptions, 100);
        } catch {}
    }, [roomId, safeSetState, fetchUserInfo, pushSubscriptions]);

    useEffect(() => {
        return () => {
            cleanupRef.current.forEach(fn => { try { fn(); } catch {} });
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
        toggleSubscription,
        setQualityForSSRC,
        refreshParticipants,
        getSsrcToUserIdMap,
    };
}