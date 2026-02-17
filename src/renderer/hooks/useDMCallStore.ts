import { create } from 'zustand';

const RING_TIMEOUT_MS = 45_000;

interface DMCallState {
    active: boolean;
    connecting: boolean;
    voiceReady: boolean;
    channelId: string | null;
    participants: any[];
    error: string | null;
    incomingCall: { channelId: string; callerName: string; callerId: string } | null;
    outgoingCall: boolean;

    setIncomingCall: (call: { channelId: string; callerName: string; callerId: string } | null) => void;
    startCall: (channelId: string, audioOnly?: boolean) => Promise<void>;
    joinCall: (channelId: string, audioOnly?: boolean) => Promise<void>;
    leaveCall: () => Promise<void>;
    declineCall: () => void;
    reset: () => void;
    setVoiceConnected: (connected: boolean) => void;
    cancelOutgoing: () => void;
    promoteToActive: () => void;
    updateParticipants: (participants: any[]) => void;
}

let ringTimeout: ReturnType<typeof setTimeout> | null = null;

const clearRingTimeout = () => {
    if (ringTimeout) {
        clearTimeout(ringTimeout);
        ringTimeout = null;
    }
};

export const useDMCallStore = create<DMCallState>((set, get) => ({
    active: false,
    connecting: false,
    voiceReady: false,
    channelId: null,
    participants: [],
    error: null,
    incomingCall: null,
    outgoingCall: false,

    setIncomingCall: (call) => set({ incomingCall: call }),

    startCall: async (channelId, audioOnly = false) => {
        set({ connecting: true, error: null, outgoingCall: true, channelId, active: false, voiceReady: false });

        clearRingTimeout();
        ringTimeout = setTimeout(() => {
            const state = get();
            if (state.outgoingCall && state.channelId === channelId && !state.active) {
                get().cancelOutgoing();
            }
        }, RING_TIMEOUT_MS);

        try {
            const result = await window.concord.startDMCall(channelId, audioOnly);

            if (get().channelId !== channelId) return;

            set({
                connecting: false,
                voiceReady: true,
                participants: result.participants || [],
                error: null,
                incomingCall: null,
                active: true,
                outgoingCall: false,
            });

            clearRingTimeout();
        } catch (err: any) {
            const msg = err?.message || '';
            if (msg.includes('already active') || msg.includes('ALREADY_EXISTS')) {
                console.log('Call already active, switching to join...');
                return get().joinCall(channelId, audioOnly);
            }

            clearRingTimeout();
            set({
                connecting: false,
                outgoingCall: false,
                voiceReady: false,
                channelId: null,
                error: msg || 'Failed to start call',
            });
            throw err;
        }
    },

    joinCall: async (channelId, audioOnly = false) => {
        set({ connecting: true, error: null, incomingCall: null, channelId, active: false, voiceReady: false });
        try {
            const result = await window.concord.joinDMCall(channelId, audioOnly);

            if (get().channelId !== channelId) return;

            clearRingTimeout();
            set({
                active: true,
                connecting: false,
                voiceReady: true,
                channelId,
                participants: result.participants || [],
                error: null,
                incomingCall: null,
                outgoingCall: false,
            });
        } catch (err: any) {
            set({
                connecting: false,
                voiceReady: false,
                channelId: null,
                error: err?.message || 'Failed to join call',
            });
            throw err;
        }
    },

    leaveCall: async () => {
        const { channelId } = get();
        if (!channelId) return;

        clearRingTimeout();
        set({
            active: false,
            connecting: false,
            voiceReady: false,
            channelId: null,
            outgoingCall: false,
            participants: [],
            error: null,
            incomingCall: null,
        });

        try { await window.concord.leaveDMCall(channelId); } catch {}
        try { await window.concord.leaveVoice(channelId); } catch {}
    },

    declineCall: () => {
        const { incomingCall } = get();
        set({ incomingCall: null });
        if (incomingCall) {
            window.concord.leaveDMCall(incomingCall.channelId).catch(() => {});
        }
    },

    cancelOutgoing: () => {
        const { channelId } = get();
        clearRingTimeout();
        set({
            active: false,
            connecting: false,
            voiceReady: false,
            channelId: null,
            outgoingCall: false,
            participants: [],
            error: null,
        });
        if (channelId) {
            window.concord.endDMCall(channelId).catch(() => {});
            window.concord.leaveVoice(channelId).catch(() => {});
        }
    },

    promoteToActive: () => {
        const state = get();
        if (state.outgoingCall && state.voiceReady) {
            clearRingTimeout();
            set({ outgoingCall: false, active: true });
        }
    },

    reset: () => {
        clearRingTimeout();
        set({
            active: false,
            connecting: false,
            voiceReady: false,
            channelId: null,
            participants: [],
            error: null,
            incomingCall: null,
            outgoingCall: false,
        });
    },

    setVoiceConnected: (connected) => {
        if (!connected && (get().active || get().voiceReady)) {
            clearRingTimeout();
            set({ active: false, connecting: false, voiceReady: false, outgoingCall: false });
        }
    },

    updateParticipants: (participants) => {
        set({ participants });
    },
}));