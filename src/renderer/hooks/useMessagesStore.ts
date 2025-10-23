import { create } from 'zustand';
import { Message } from '../types';

interface MessagesState {
    messages: Record<string, Message[]>;
    addMessage: (roomId: string, message: Message) => void;
    updateMessage: (roomId: string, messageId: string, content: string) => void;
    deleteMessage: (roomId: string, messageId: string) => void;
    setMessages: (roomId: string, messages: Message[]) => void;
}

export const useMessagesStore = create<MessagesState>((set) => ({
    messages: {},
    addMessage: (roomId, message) =>
        set((state) => ({
            messages: {
                ...state.messages,
                [roomId]: [...(state.messages[roomId] || []), message],
            },
        })),
    updateMessage: (roomId, messageId, content) =>
        set((state) => ({
            messages: {
                ...state.messages,
                [roomId]: state.messages[roomId]?.map((msg) =>
                    msg.id === messageId ? { ...msg, content, editedAt: new Date().toISOString() } : msg
                ),
            },
        })),
    deleteMessage: (roomId, messageId) =>
        set((state) => ({
            messages: {
                ...state.messages,
                [roomId]: state.messages[roomId]?.map((msg) =>
                    msg.id === messageId ? { ...msg, deleted: true } : msg
                ),
            },
        })),
    setMessages: (roomId, messages) =>
        set((state) => ({
            messages: { ...state.messages, [roomId]: messages },
        })),
}));