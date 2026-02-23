import { create } from 'zustand';

export interface VoiceStoreParticipant {
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
}

interface VoiceStoreState {
    connected: boolean;
    connecting: boolean;
    roomId: string | null;
    isDM: boolean;
    muted: boolean;
    deafened: boolean;
    videoEnabled: boolean;
    screenSharing: boolean;
    error: string | null;
    participants: Map<string, VoiceStoreParticipant>;
    localAudioSsrc?: number;
    localVideoSsrc?: number;
    localScreenSsrc?: number;
    disabledSSRCs: Set<number>;

    setConnected: (connected: boolean) => void;
    setConnecting: (connecting: boolean) => void;
    setRoom: (roomId: string | null, isDM: boolean) => void;
    setMuted: (muted: boolean) => void;
    setDeafened: (deafened: boolean) => void;
    setVideoEnabled: (enabled: boolean) => void;
    setScreenSharing: (sharing: boolean) => void;
    setError: (error: string | null) => void;
    setParticipants: (participants: Map<string, VoiceStoreParticipant>) => void;
    updateParticipant: (userId: string, update: Partial<VoiceStoreParticipant>) => void;
    removeParticipant: (userId: string) => void;
    setLocalSSRCs: (audio?: number, video?: number, screen?: number) => void;
    toggleSubscription: (ssrc: number) => void;
    reset: () => void;
}

const initialState = {
    connected: false,
    connecting: false,
    roomId: null as string | null,
    isDM: false,
    muted: false,
    deafened: false,
    videoEnabled: false,
    screenSharing: false,
    error: null as string | null,
    participants: new Map<string, VoiceStoreParticipant>(),
    localAudioSsrc: undefined as number | undefined,
    localVideoSsrc: undefined as number | undefined,
    localScreenSsrc: undefined as number | undefined,
    disabledSSRCs: new Set<number>(),
};

export const useVoiceStore = create<VoiceStoreState>((set, get) => ({
    ...initialState,

    setConnected: (connected) => set({ connected }),
    setConnecting: (connecting) => set({ connecting }),
    setRoom: (roomId, isDM) => set({ roomId, isDM }),
    setMuted: (muted) => set({ muted }),
    setDeafened: (deafened) => set({ deafened, muted: deafened ? true : get().muted }),
    setVideoEnabled: (videoEnabled) => set({ videoEnabled }),
    setScreenSharing: (screenSharing) => set({ screenSharing }),
    setError: (error) => set({ error }),

    setParticipants: (participants) => set({ participants: new Map(participants) }),

    updateParticipant: (userId, update) => set(state => {
        const participants = new Map(state.participants);
        const existing = participants.get(userId);
        if (existing) {
            participants.set(userId, { ...existing, ...update });
        } else {
            participants.set(userId, {
                userId,
                audioSsrc: 0,
                videoSsrc: 0,
                muted: false,
                videoEnabled: false,
                screenSharing: false,
                speaking: false,
                ...update,
            } as VoiceStoreParticipant);
        }
        return { participants };
    }),

    removeParticipant: (userId) => set(state => {
        const participants = new Map(state.participants);
        participants.delete(userId);
        return { participants };
    }),

    setLocalSSRCs: (audio, video, screen) => set({
        localAudioSsrc: audio,
        localVideoSsrc: video,
        localScreenSsrc: screen,
    }),

    toggleSubscription: (ssrc) => set(state => {
        const next = new Set(state.disabledSSRCs);
        if (next.has(ssrc)) next.delete(ssrc);
        else next.add(ssrc);
        return { disabledSSRCs: next };
    }),

    reset: () => set({ ...initialState, participants: new Map(), disabledSSRCs: new Set() }),
}));