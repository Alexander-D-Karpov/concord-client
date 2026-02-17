import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';

export interface DMChannel {
    id: string;
    user1Id: string;
    user2Id: string;
    createdAt: string;
    updatedAt: string;
}

export interface DMChannelWithUser {
    channel: DMChannel;
    otherUserId: string;
    otherUserHandle: string;
    otherUserDisplay: string;
    otherUserAvatar: string;
    otherUserStatus: string;
}

export interface DMMessage {
    id: string;
    channelId: string;
    authorId: string;
    content: string;
    createdAt: string;
    editedAt?: string;
    deleted: boolean;
    attachments: any[];
}

interface DMState {
    channels: DMChannelWithUser[];
    currentChannelId: string | null;
    messages: Record<string, DMMessage[]>;
    loading: boolean;
    error: string | null;

    setChannels: (channels: DMChannelWithUser[]) => void;
    setCurrentChannel: (channelId: string | null) => void;
    setMessages: (channelId: string, messages: DMMessage[]) => void;
    addMessage: (channelId: string, message: DMMessage) => void;
    loadChannels: () => Promise<void>;
    loadMessages: (channelId: string) => Promise<void>;
    getOrCreateDM: (userId: string) => Promise<DMChannel | null>;
}

const tsToIso = (ts: any): string => {
    if (!ts) return new Date().toISOString();
    const seconds = Number(ts.seconds ?? 0);
    const nanos = Number(ts.nanos ?? 0);
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
};

export const useDMStore = create<DMState>((set, get) => ({
    channels: [],
    currentChannelId: null,
    messages: {},
    loading: false,
    error: null,

    setChannels: (channels) => set({ channels }),
    setCurrentChannel: (channelId) => set({ currentChannelId: channelId }),
    setMessages: (channelId, messages) => set((state) => ({
        messages: { ...state.messages, [channelId]: messages }
    })),
    addMessage: (channelId, message) => set((state) => {
        const existing = state.messages[channelId] || [];
        const idx = existing.findIndex(m => m.id === message.id);
        if (idx !== -1) {
            const updated = [...existing];
            updated[idx] = message;
            return { messages: { ...state.messages, [channelId]: updated } };
        }
        return { messages: { ...state.messages, [channelId]: [...existing, message] } };
    }),

    loadChannels: async () => {
        set({ loading: true, error: null });
        try {
            // Ensure we have current user ID. If not in store, fetch from API.
            let currentUserId = useAuthStore.getState().user?.id;
            if (!currentUserId) {
                const self = await window.concord.getSelf();
                currentUserId = self.id;
            }

            const response = await window.concord.listDMs();

            const channels: DMChannelWithUser[] = (response?.channels || []).map((ch: any) => {
                const participants = ch.participants || [];

                // Find the other user
                const otherUser = participants.find((p: any) => {
                    const id = p.user_id || p.userId;
                    return id !== currentUserId;
                }) || {};

                const otherUserId = otherUser.user_id || otherUser.userId || 'unknown';
                const otherUserHandle = otherUser.handle || 'unknown';
                const otherUserDisplay = otherUser.display_name || otherUser.displayName || otherUserHandle;
                const otherUserAvatar = otherUser.avatar_url || otherUser.avatarUrl || '';
                const otherUserStatus = otherUser.status || 'offline';

                return {
                    channel: {
                        id: ch.id,
                        user1Id: '', // These aren't strictly needed for UI if we have participants
                        user2Id: '',
                        createdAt: tsToIso(ch.created_at || ch.createdAt),
                        updatedAt: tsToIso(ch.updated_at || ch.updatedAt),
                    },
                    otherUserId,
                    otherUserHandle,
                    otherUserDisplay,
                    otherUserAvatar,
                    otherUserStatus,
                };
            });

            set({ channels, loading: false });
        } catch (err: any) {
            console.error('[DMStore] Failed to load channels:', err);
            set({ error: err?.message || 'Failed to load DMs', loading: false });
        }
    },

    loadMessages: async (channelId: string) => {
        set({ loading: true, error: null });
        try {
            const response = await window.concord.listDMMessages(channelId, 50);
            const messages: DMMessage[] = (response?.messages || []).map((m: any) => ({
                id: m.id,
                channelId: m.channel_id || channelId,
                authorId: m.author_id,
                content: m.content,
                createdAt: tsToIso(m.created_at),
                editedAt: m.edited_at ? tsToIso(m.edited_at) : undefined,
                deleted: !!m.deleted,
                attachments: m.attachments || [],
            }));
            set((state) => ({
                messages: { ...state.messages, [channelId]: messages },
                loading: false,
            }));
        } catch (err: any) {
            console.error('[DMStore] Failed to load messages:', err);
            set({ error: err?.message || 'Failed to load messages', loading: false });
        }
    },

    getOrCreateDM: async (userId: string) => {
        try {
            const response = await window.concord.getOrCreateDM(userId);
            const channelData = response?.channel || response;

            if (channelData?.id) {
                await get().loadChannels();
                return {
                    id: channelData.id,
                    user1Id: channelData.user1_id || '',
                    user2Id: channelData.user2_id || '',
                    createdAt: tsToIso(channelData.created_at),
                    updatedAt: tsToIso(channelData.updated_at),
                };
            }
            return null;
        } catch (err: any) {
            console.error('[DMStore] Failed to create DM:', err);
            set({ error: err?.message || 'Failed to create DM' });
            return null;
        }
    },
}));