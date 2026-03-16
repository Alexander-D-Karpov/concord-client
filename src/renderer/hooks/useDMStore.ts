import { create } from 'zustand';
import useAuthStore from './useAuthStore';
import type { DMMessage, MessageAttachment, MessageReaction } from '../utils/types';

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

    if (typeof ts === 'string') return ts;
    if (typeof ts === 'number') return new Date(ts).toISOString();

    const seconds = Number(ts.seconds ?? 0);
    const nanos = Number(ts.nanos ?? ts.nanoseconds ?? 0);

    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
};

const mapAttachment = (attachment: any): MessageAttachment => ({
    id: attachment.id,
    url: attachment.url || '',
    filename: attachment.filename || attachment.name || 'attachment',
    contentType: attachment.content_type || attachment.contentType || 'application/octet-stream',
    size: Number(attachment.size ?? 0),
    width: attachment.width ?? undefined,
    height: attachment.height ?? undefined,
    createdAt: tsToIso(attachment.created_at || attachment.createdAt),
});

const mapReaction = (reaction: any): MessageReaction => ({
    id: reaction.id,
    messageId: reaction.message_id || reaction.messageId || '',
    userId: reaction.user_id || reaction.userId || '',
    emoji: reaction.emoji || '',
    createdAt: tsToIso(reaction.created_at || reaction.createdAt),
});

export const mapDMMessage = (message: any, fallbackChannelId: string): DMMessage => ({
    id: message.id,
    channelId: message.channel_id || message.channelId || message.channelId || fallbackChannelId,
    authorId: message.author_id || message.authorId,
    content: message.content || '',
    createdAt: tsToIso(message.created_at || message.createdAt),
    editedAt:
        message.edited_at || message.editedAt
            ? tsToIso(message.edited_at || message.editedAt)
            : undefined,
    deleted: !!message.deleted,
    replyToId: message.reply_to_id || message.replyToId || undefined,
    attachments: Array.isArray(message.attachments) ? message.attachments.map(mapAttachment) : [],
    mentions: Array.isArray(message.mentions) ? message.mentions : [],
    reactions: Array.isArray(message.reactions) ? message.reactions.map(mapReaction) : [],
    pinned: !!message.pinned,
});

const normalizeDMMessage = (message: DMMessage, fallbackChannelId: string): DMMessage =>
    mapDMMessage(message, fallbackChannelId);

export const useDMStore = create<DMState>((set, get) => ({
    channels: [],
    currentChannelId: null,
    messages: {},
    loading: false,
    error: null,

    setChannels: (channels) => set({ channels }),

    setCurrentChannel: (channelId) => set({ currentChannelId: channelId }),

    setMessages: (channelId, messages) =>
        set((state) => ({
            messages: {
                ...state.messages,
                [channelId]: messages.map((message) => normalizeDMMessage(message, channelId)),
            },
        })),

    addMessage: (channelId, message) =>
        set((state) => {
            const normalized = normalizeDMMessage(message, channelId);
            const existing = state.messages[channelId] || [];
            const index = existing.findIndex((m) => m.id === normalized.id);

            if (index !== -1) {
                const updated = [...existing];
                updated[index] = {
                    ...updated[index],
                    ...normalized,
                };

                return {
                    messages: {
                        ...state.messages,
                        [channelId]: updated.sort(
                            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                        ),
                    },
                };
            }

            return {
                messages: {
                    ...state.messages,
                    [channelId]: [...existing, normalized].sort(
                        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                    ),
                },
            };
        }),

    loadChannels: async () => {
        set({ loading: true, error: null });

        try {
            let currentUserId = useAuthStore.getState().user?.id;

            if (!currentUserId) {
                const self = await window.concord.getSelf();
                currentUserId = self.id;
            }

            const response = await window.concord.listDMs();

            const channels: DMChannelWithUser[] = (response?.channels || []).map((channel: any) => {
                const participants = channel.participants || [];

                const otherUser =
                    participants.find((participant: any) => {
                        const participantId = participant.user_id || participant.userId;
                        return participantId !== currentUserId;
                    }) || {};

                const otherUserId = otherUser.user_id || otherUser.userId || 'unknown';
                const otherUserHandle = otherUser.handle || 'unknown';
                const otherUserDisplay =
                    otherUser.display_name || otherUser.displayName || otherUserHandle;
                const otherUserAvatar =
                    otherUser.avatar_url || otherUser.avatarUrl || otherUser.avatar_thumbnail_url || '';
                const otherUserStatus = otherUser.status || 'offline';

                return {
                    channel: {
                        id: channel.id,
                        user1Id: channel.user1_id || channel.user1Id || '',
                        user2Id: channel.user2_id || channel.user2Id || '',
                        createdAt: tsToIso(channel.created_at || channel.createdAt),
                        updatedAt: tsToIso(channel.updated_at || channel.updatedAt),
                    },
                    otherUserId,
                    otherUserHandle,
                    otherUserDisplay,
                    otherUserAvatar,
                    otherUserStatus,
                };
            });

            set({
                channels,
                loading: false,
                error: null,
            });
        } catch (err: any) {
            console.error('[DMStore] Failed to load channels:', err);
            set({
                error: err?.message || 'Failed to load DMs',
                loading: false,
            });
        }
    },

    loadMessages: async (channelId: string) => {
        set({ loading: true, error: null });

        try {
            const response = await window.concord.listDMMessages(channelId, 50);
            const mappedMessages: DMMessage[] = (response?.messages || []).map((message: any) =>
                mapDMMessage(message, channelId)
            );

            set((state) => ({
                messages: {
                    ...state.messages,
                    [channelId]: mappedMessages,
                },
                loading: false,
                error: null,
            }));
        } catch (err: any) {
            console.error('[DMStore] Failed to load messages:', err);
            set({
                error: err?.message || 'Failed to load messages',
                loading: false,
            });
        }
    },

    getOrCreateDM: async (userId: string) => {
        try {
            const response = await window.concord.getOrCreateDM(userId);
            const channelData = response?.channel || response;

            if (!channelData?.id) {
                return null;
            }

            await get().loadChannels();

            return {
                id: channelData.id,
                user1Id: channelData.user1_id || channelData.user1Id || '',
                user2Id: channelData.user2_id || channelData.user2Id || '',
                createdAt: tsToIso(channelData.created_at || channelData.createdAt),
                updatedAt: tsToIso(channelData.updated_at || channelData.updatedAt),
            };
        } catch (err: any) {
            console.error('[DMStore] Failed to create DM:', err);
            set({
                error: err?.message || 'Failed to create DM',
            });
            return null;
        }
    },
}));