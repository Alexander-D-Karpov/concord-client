import { useEffect, useRef, useCallback, useState } from 'react';
import { useVoiceStore } from './useVoiceStore';

declare global { interface Window { concord: any; } }

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
    connectionQuality?: number;
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
    localQuality: number;
    localRtt: number;
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
    localQuality: 0,
    localRtt: 0,
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
                localQuality: store.localQuality,
                localRtt: 0,
            };
        }
        return initialState;
    });

    const cleanupRef = useRef<(() => void)[]>([]);
    const mountedRef = useRef(true);
    const stateRef = useRef(state);
    const ssrcToUserIdRef = useRef<Map<number, string>>(new Map());
    const userInfoCacheRef = useRef<Map<string, { displayName: string; avatarUrl?: string }>>(new Map());
    const subscriptionTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => { stateRef.current = state; }, [state]);
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

    const safeSetState = useCallback((updater: (prev: VoiceClientState) => VoiceClientState) => {
        if (mountedRef.current) setState(updater);
    }, []);

    const fetchUserInfo = useCallback(async (userId: string): Promise<{ displayName: string; avatarUrl?: string }> => {
        const cached = userInfoCacheRef.current.get(userId);
        if (cached) return cached;
        try {
            const user = await window.concord.getUser(userId);
            const info = { displayName: user.display_name || user.handle || userId.split('-')[0], avatarUrl: user.avatar_url };
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
            if (nextDisabled.has(ssrc)) nextDisabled.delete(ssrc); else nextDisabled.add(ssrc);
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
        if (!s.connected || s.deafened) {
            window.concord.updateVoiceSubscriptions?.([]).catch(() => {});
            return;
        }
        const activeSSRCs: number[] = [];
        s.participants.forEach(p => {
            if (p.audioSsrc) activeSSRCs.push(p.audioSsrc);
            if (p.videoSsrc && !s.disabledSSRCs.has(p.videoSsrc)) activeSSRCs.push(p.videoSsrc);
            if (p.screenSsrc && !s.disabledSSRCs.has(p.screenSsrc)) activeSSRCs.push(p.screenSsrc);
        });
        window.concord.updateVoiceSubscriptions?.(activeSSRCs).catch(() => {});
    }, []);

    useEffect(() => { if (state.connected) pushSubscriptions(); }, [state.participants, state.disabledSSRCs, state.connected, state.deafened, pushSubscriptions]);

    useEffect(() => {
        if (!state.connected) {
            if (subscriptionTimerRef.current) clearInterval(subscriptionTimerRef.current);
            subscriptionTimerRef.current = null;
            return;
        }
        subscriptionTimerRef.current = setInterval(pushSubscriptions, 5000);
        return () => { if (subscriptionTimerRef.current) clearInterval(subscriptionTimerRef.current); subscriptionTimerRef.current = null; };
    }, [state.connected, pushSubscriptions]);

    const mergeParticipant = useCallback(async (incoming: any) => {
        const uid = incoming.userId || incoming.user_id;
        if (!uid) return;
        const audioSsrc = incoming.audioSsrc || incoming.ssrc || incoming.audio_ssrc || 0;
        const videoSsrc = incoming.videoSsrc || incoming.video_ssrc || 0;
        const screenSsrc = incoming.screenSsrc || incoming.screen_ssrc || 0;
        if (audioSsrc) ssrcToUserIdRef.current.set(audioSsrc, uid);
        if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, uid);
        if (screenSsrc) ssrcToUserIdRef.current.set(screenSsrc, uid);
        const existing = stateRef.current.participants.get(uid);
        const userInfo = existing?.displayName ? { displayName: existing.displayName, avatarUrl: existing.avatarUrl } : await fetchUserInfo(uid);
        safeSetState(prev => {
            const participants = new Map(prev.participants);
            participants.set(uid, {
                userId: uid,
                audioSsrc: audioSsrc || existing?.audioSsrc || 0,
                videoSsrc: videoSsrc || existing?.videoSsrc || 0,
                screenSsrc: screenSsrc || existing?.screenSsrc || 0,
                muted: incoming.muted ?? existing?.muted ?? false,
                videoEnabled: incoming.videoEnabled ?? incoming.video_enabled ?? existing?.videoEnabled ?? (videoSsrc > 0),
                screenSharing: incoming.screenSharing ?? incoming.screen_sharing ?? existing?.screenSharing ?? (screenSsrc > 0),
                speaking: incoming.speaking ?? existing?.speaking ?? false,
                displayName: userInfo.displayName,
                avatarUrl: userInfo.avatarUrl,
                connectionQuality: incoming.quality ?? existing?.connectionQuality,
            });
            return { ...prev, participants };
        });
    }, [fetchUserInfo, safeSetState]);

    const setupEventListeners = useCallback(() => {
        const unsubSpeaking = window.concord.onVoiceSpeaking?.((data: any) => {
            const uid = data.userId || data.user_id || ssrcToUserIdRef.current.get(data.ssrc);
            if (!uid) return;
            if (data.ssrc) ssrcToUserIdRef.current.set(data.ssrc, uid);
            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(uid);
                if (existing) participants.set(uid, { ...existing, speaking: !!data.speaking });
                return { ...prev, participants };
            });
        });

        const unsubParticipantJoined = window.concord.onVoiceParticipantJoined?.((data: any) => { void mergeParticipant(data); setTimeout(pushSubscriptions, 150); });
        const unsubParticipantUpdated = window.concord.onVoiceParticipantUpdated?.((data: any) => { void mergeParticipant(data); setTimeout(pushSubscriptions, 150); });
        const unsubMediaState = window.concord.onVoiceMediaState?.((data: any) => { void mergeParticipant(data); setTimeout(pushSubscriptions, 150); });

        const unsubParticipantLeft = window.concord.onVoiceParticipantLeft?.((data: any) => {
            const uid = data.userId || data.user_id;
            if (!uid) return;
            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(uid);
                if (existing?.audioSsrc) ssrcToUserIdRef.current.delete(existing.audioSsrc);
                if (existing?.videoSsrc) ssrcToUserIdRef.current.delete(existing.videoSsrc);
                if (existing?.screenSsrc) ssrcToUserIdRef.current.delete(existing.screenSsrc);
                participants.delete(uid);
                return { ...prev, participants };
            });
        });

        const unsubQuality = window.concord.onVoiceQuality?.((data: any) => {
            safeSetState(prev => ({ ...prev, localQuality: data.local ?? prev.localQuality, localRtt: data.rttMs ?? prev.localRtt }));
            useVoiceStore.getState().setLocalQuality(data.local ?? 0);
        });

        const unsubPeerQuality = window.concord.onVoicePeerQuality?.((data: any) => {
            const uid = data.userId;
            if (!uid) return;
            safeSetState(prev => {
                const participants = new Map(prev.participants);
                const existing = participants.get(uid);
                if (existing) participants.set(uid, { ...existing, connectionQuality: data.quality });
                return { ...prev, participants };
            });
        });

        const unsubError = window.concord.onVoiceError?.((error: string) => safeSetState(prev => ({ ...prev, error })));
        const unsubDisconnected = window.concord.onVoiceDisconnected?.(() => { ssrcToUserIdRef.current.clear(); safeSetState(() => initialState); useVoiceStore.getState().reset(); });
        const unsubReconnected = window.concord.onVoiceReconnected?.(() => { safeSetState(prev => ({ ...prev, connected: true, error: null })); setTimeout(pushSubscriptions, 500); });

        cleanupRef.current = [unsubSpeaking, unsubParticipantJoined, unsubParticipantUpdated, unsubMediaState, unsubParticipantLeft, unsubQuality, unsubPeerQuality, unsubError, unsubDisconnected, unsubReconnected].filter(Boolean);
    }, [mergeParticipant, pushSubscriptions, safeSetState]);

    const connect = useCallback(async (audioOnly = false, isDM = false) => {
        cleanupRef.current.forEach(fn => { try { fn(); } catch {} });
        cleanupRef.current = [];
        ssrcToUserIdRef.current.clear();
        setupEventListeners();
        safeSetState(prev => ({ ...prev, connecting: true, error: null }));
        useVoiceStore.getState().setConnecting(true);
        try {
            const result = await window.concord.joinVoice(roomId, audioOnly, isDM);
            const participants = new Map<string, ParticipantState>();
            if (result.participants?.length > 0) {
                const enriched = await Promise.all(result.participants.map(async (p: any) => {
                    const uid = p.userId || p.user_id;
                    if (!uid) return null;
                    const userInfo = await fetchUserInfo(uid);
                    return { ...p, uid, ...userInfo };
                }));
                for (const p of enriched) {
                    if (!p) continue;
                    const audioSsrc = (p.audioSsrc || p.audio_ssrc || p.ssrc || 0) >>> 0;
                    const videoSsrc = (p.videoSsrc || p.video_ssrc || 0) >>> 0;
                    const screenSsrc = (p.screenSsrc || p.screen_ssrc || 0) >>> 0;
                    if (audioSsrc) ssrcToUserIdRef.current.set(audioSsrc, p.uid);
                    if (videoSsrc) ssrcToUserIdRef.current.set(videoSsrc, p.uid);
                    if (screenSsrc) ssrcToUserIdRef.current.set(screenSsrc, p.uid);
                    participants.set(p.uid, {
                        userId: p.uid,
                        audioSsrc,
                        videoSsrc,
                        screenSsrc,
                        muted: !!(p.muted),
                        videoEnabled: !!(p.video_enabled ?? p.videoEnabled ?? (videoSsrc > 0)),
                        screenSharing: !!(p.screen_sharing ?? p.screenSharing ?? (screenSsrc > 0)),
                        speaking: !!(p.speaking),
                        displayName: p.displayName,
                        avatarUrl: p.avatarUrl,
                        connectionQuality: p.quality,
                    });
                }
            }
            safeSetState(prev => ({ ...prev, connected: true, connecting: false, participants, localAudioSsrc: result.ssrc, localVideoSsrc: result.videoSsrc, localScreenSsrc: result.screenSsrc, videoEnabled: !audioOnly && result.videoSsrc > 0 }));
            const voiceStore = useVoiceStore.getState();
            voiceStore.setRoom(roomId, isDM);
            voiceStore.setConnected(true);
            voiceStore.setConnecting(false);
            voiceStore.setLocalSSRCs(result.ssrc, result.videoSsrc, result.screenSsrc);
            voiceStore.setParticipants(participants);
            setTimeout(pushSubscriptions, 300);
        } catch (err: any) {
            useVoiceStore.getState().reset();
            safeSetState(prev => ({ ...prev, connecting: false, connected: false, error: err?.message || 'Failed to connect' }));
        }
    }, [roomId, setupEventListeners, safeSetState, fetchUserInfo, pushSubscriptions]);

    useEffect(() => {
        const store = useVoiceStore.getState();
        if (store.connected && store.roomId === roomId) {
            safeSetState(prev => ({ ...prev, connected: true, connecting: false, muted: store.muted, deafened: store.deafened, videoEnabled: store.videoEnabled, screenSharing: store.screenSharing, participants: new Map(store.participants), localAudioSsrc: store.localAudioSsrc, localVideoSsrc: store.localVideoSsrc, localScreenSsrc: store.localScreenSsrc, disabledSSRCs: new Set(store.disabledSSRCs), localQuality: store.localQuality, error: null }));
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
        if (deafened) window.concord.updateVoiceSubscriptions?.([]).catch(() => {}); else setTimeout(pushSubscriptions, 0);
    }, [safeSetState, pushSubscriptions]);

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

    useEffect(() => () => { cleanupRef.current.forEach(fn => { try { fn(); } catch {} }); cleanupRef.current = []; }, []);

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
        refreshParticipants: async () => { try { const status = await window.concord.getVoiceStatus(roomId); for (const p of status?.participants || []) void mergeParticipant(p); } catch {} },
        getSsrcToUserIdMap: () => new Map(ssrcToUserIdRef.current),
    };
}
