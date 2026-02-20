import { create } from 'zustand';

interface TypingState {
    // roomId/channelId -> Set of userIds
    typingUsers: Record<string, Set<string>>;
    setTyping: (id: string, userId: string, isTyping: boolean) => void;
    getTypingUsers: (id: string) => Set<string>;
}

const typingTimeouts: Record<string, NodeJS.Timeout> = {};


const emptySet = new Set<string>();

export const useTypingStore = create<TypingState>((set, get) => ({
    typingUsers: {},

    getTypingUsers: (id: string) => get().typingUsers[id] || emptySet,

    setTyping: (id, userId, isTyping) => set((state) => {
        const key = `${id}:${userId}`;

        // Clear existing timeout
        if (typingTimeouts[key]) {
            clearTimeout(typingTimeouts[key]);
            delete typingTimeouts[key];
        }

        const currentSet = new Set(state.typingUsers[id] || []);

        if (isTyping) {
            currentSet.add(userId);

            // Auto-clear after 5 seconds if no stop event received
            typingTimeouts[key] = setTimeout(() => {
                useTypingStore.getState().setTyping(id, userId, false);
            }, 5000);
        } else {
            currentSet.delete(userId);
        }

        return {
            typingUsers: {
                ...state.typingUsers,
                [id]: currentSet
            }
        };
    }),
}));