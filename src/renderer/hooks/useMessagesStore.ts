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
}

export const useMessagesStore = create<MessagesState>((set) => ({
    messages: {},

    addMessage: (roomId, message) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            const idx = list.findIndex((m) => m.id === message.id);

            if (idx !== -1) {
                const next = list.slice();
                next[idx] = { ...list[idx], ...message, reactions: message.reactions ?? list[idx].reactions };
                console.log('[MessagesStore] Updated existing message:', message.id);
                return { messages: { ...state.messages, [roomId]: next } };
            }

            console.log('[MessagesStore] Added new message:', message.id);
            return {
                messages: {
                    ...state.messages,
                    [roomId]: [...list, { ...message, reactions: message.reactions ?? [] }]
                }
            };
        }),

    updateMessage: (roomId, messageId, content) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            const next = list.map((m) =>
                (m.id === messageId ? { ...m, content, editedAt: new Date().toISOString() } : m)
            );
            console.log('[MessagesStore] Updated message content:', messageId);
            return { messages: { ...state.messages, [roomId]: next } };
        }),

    deleteMessage: (roomId, messageId) =>
        set((state) => {
            const list = state.messages[roomId] || [];

            if (messageId.startsWith('temp-')) {
                const next = list.filter(m => m.id !== messageId);
                console.log('[MessagesStore] Removed temporary message:', messageId);
                return { messages: { ...state.messages, [roomId]: next } };
            }

            const next = list.map((m) => (m.id === messageId ? { ...m, deleted: true } : m));
            console.log('[MessagesStore] Marked message as deleted:', messageId);
            return { messages: { ...state.messages, [roomId]: next } };
        }),

    setMessages: (roomId, messages) => {
        console.log('[MessagesStore] Set messages for room:', roomId, 'count:', messages.length);
        return set((state) => ({ messages: { ...state.messages, [roomId]: messages } }));
    },

    addReaction: (roomId, messageId, reaction) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            const idx = list.findIndex((m) => m.id === messageId);
            if (idx === -1) {
                console.warn('[MessagesStore] Message not found for reaction:', messageId);
                return { messages: state.messages };
            }

            const msg = list[idx];
            const exists = (msg.reactions || []).find(
                (r) => (reaction.id && r.id === reaction.id) || (r.userId === reaction.userId && r.emoji === reaction.emoji)
            );

            const nextReacts = exists
                ? (msg.reactions || []).map((r) =>
                    (reaction.id && r.id === reaction.id) || (r.userId === reaction.userId && r.emoji === reaction.emoji)
                        ? { ...r, ...reaction }
                        : r
                )
                : [...(msg.reactions || []), reaction];

            const next = list.slice();
            next[idx] = { ...msg, reactions: nextReacts };
            console.log('[MessagesStore] Added/updated reaction:', reaction.emoji);
            return { messages: { ...state.messages, [roomId]: next } };
        }),

    removeReaction: (roomId, messageId, criteria) =>
        set((state) => {
            const list = state.messages[roomId] || [];
            const idx = list.findIndex((m) => m.id === messageId);
            if (idx === -1) {
                console.warn('[MessagesStore] Message not found for reaction removal:', messageId);
                return { messages: state.messages };
            }

            const msg = list[idx];
            const nextReacts = (msg.reactions || []).filter((r) => {
                if (criteria.id) return r.id !== criteria.id;
                if (criteria.userId && criteria.emoji) return !(r.userId === criteria.userId && r.emoji === criteria.emoji);
                if (criteria.userId) return r.userId !== criteria.userId;
                if (criteria.emoji) return r.emoji !== criteria.emoji;
                return true;
            });

            const next = list.slice();
            next[idx] = { ...msg, reactions: nextReacts };
            console.log('[MessagesStore] Removed reaction');
            return { messages: { ...state.messages, [roomId]: next } };
        }),
}));