import { create } from 'zustand';
import { Message, MessageReaction } from '../types';

interface MessagesState {
    messages: Record<string, Message[]>;
    addMessage: (roomId: string, message: Message) => void;
    updateMessage: (roomId: string, messageId: string, content: string) => void;
    deleteMessage: (roomId: string, messageId: string) => void;
    setMessages: (roomId: string, messages: Message[]) => void;
    addReaction: (roomId: string, messageId: string, reaction: MessageReaction) => void;
    removeReaction: (roomId: string, messageId: string, criteria: { id?: string; userId?: string; emoji?: string }) => void;
    setPinned: (roomId: string, messageId: string, pinned: boolean) => void;
}

export const useMessagesStore = create<MessagesState>((set) => ({
    messages: {},

    addMessage: (roomId, message) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            const idx = list.findIndex((m) => m.id === message.id);
            if (idx !== -1) {
                const next = [...list];
                next[idx] = { ...list[idx], ...message };
                return { messages: { ...state.messages, [roomId]: next } };
            }
            return { messages: { ...state.messages, [roomId]: [...list, message] } };
        }),

    updateMessage: (roomId, messageId, content) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            return {
                messages: {
                    ...state.messages,
                    [roomId]: list.map((m) =>
                        m.id === messageId ? { ...m, content, editedAt: new Date().toISOString() } : m
                    ),
                },
            };
        }),

    deleteMessage: (roomId, messageId) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            if (messageId.startsWith('temp-')) {
                return { messages: { ...state.messages, [roomId]: list.filter((m) => m.id !== messageId) } };
            }
            return {
                messages: {
                    ...state.messages,
                    [roomId]: list.map((m) => (m.id === messageId ? { ...m, deleted: true } : m)),
                },
            };
        }),

    setMessages: (roomId, messages) =>
        set((state) => ({ messages: { ...state.messages, [roomId]: messages } })),

    addReaction: (roomId, messageId, reaction) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            return {
                messages: {
                    ...state.messages,
                    [roomId]: list.map((m) => {
                        if (m.id !== messageId) return m;
                        const reactions = m.reactions || [];
                        const exists = reactions.find(
                            (r) => r.id === reaction.id || (r.userId === reaction.userId && r.emoji === reaction.emoji)
                        );
                        return {
                            ...m,
                            reactions: exists
                                ? reactions.map((r) =>
                                    r.id === reaction.id || (r.userId === reaction.userId && r.emoji === reaction.emoji)
                                        ? { ...r, ...reaction }
                                        : r
                                )
                                : [...reactions, reaction],
                        };
                    }),
                },
            };
        }),

    removeReaction: (roomId, messageId, criteria) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            return {
                messages: {
                    ...state.messages,
                    [roomId]: list.map((m) => {
                        if (m.id !== messageId) return m;
                        return {
                            ...m,
                            reactions: (m.reactions || []).filter((r) => {
                                if (criteria.id) return r.id !== criteria.id;
                                if (criteria.userId && criteria.emoji)
                                    return !(r.userId === criteria.userId && r.emoji === criteria.emoji);
                                if (criteria.userId) return r.userId !== criteria.userId;
                                return true;
                            }),
                        };
                    }),
                },
            };
        }),

    setPinned: (roomId, messageId, pinned) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            return {
                messages: {
                    ...state.messages,
                    [roomId]: list.map((m) => (m.id === messageId ? { ...m, pinned } : m)),
                },
            };
        }),
}));