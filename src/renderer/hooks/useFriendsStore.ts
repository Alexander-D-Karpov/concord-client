import { create } from 'zustand';
import { mapFriend, mapFriendRequest } from '../utils/mappers';
import type { Friend, FriendRequest } from '../utils/types';

interface FriendsState {
    friends: Friend[];
    incomingRequests: FriendRequest[];
    outgoingRequests: FriendRequest[];
    blockedUsers: string[];
    loading: boolean;
    error: string | null;
    updateFriendStatus: (userId: string, status: string) => void;
    loadFriends: () => Promise<void>;
    loadPendingRequests: () => Promise<void>;
    loadBlockedUsers: () => Promise<void>;
    sendRequest: (userId: string) => Promise<void>;
    acceptRequest: (requestId: string) => Promise<void>;
    rejectRequest: (requestId: string) => Promise<void>;
    cancelRequest: (requestId: string) => Promise<void>;
    removeFriend: (userId: string) => Promise<void>;
    blockUser: (userId: string) => Promise<void>;
    unblockUser: (userId: string) => Promise<void>;
}

export const useFriendsStore = create<FriendsState>((set, get) => ({
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    blockedUsers: [],
    loading: false,
    error: null,

    updateFriendStatus: (userId, status) => set((state) => ({
        friends: state.friends.map(f => f.userId === userId ? { ...f, status } : f),
    })),

    loadFriends: async () => {
        set({ loading: true, error: null });
        try {
            const response = await window.concord.listFriends();
            set({ friends: (response?.friends || []).map(mapFriend), loading: false });
        } catch (err: any) {
            set({ error: err?.message || 'Failed to load friends', loading: false });
        }
    },

    loadPendingRequests: async () => {
        set({ loading: true, error: null });
        try {
            const response = await window.concord.listPendingRequests();
            set({
                incomingRequests: (response?.incoming || []).map(mapFriendRequest),
                outgoingRequests: (response?.outgoing || []).map(mapFriendRequest),
                loading: false,
            });
        } catch (err: any) {
            set({ error: err?.message || 'Failed to load requests', loading: false });
        }
    },

    loadBlockedUsers: async () => {
        set({ loading: true, error: null });
        try {
            const response = await window.concord.listBlockedUsers();
            set({ blockedUsers: response?.user_ids || [], loading: false });
        } catch (err: any) {
            set({ error: err?.message || 'Failed to load blocked users', loading: false });
        }
    },

    sendRequest: async (userId) => {
        set({ loading: true, error: null });
        try {
            const userInfo = await window.concord.getUserByHandle(userId).catch(() => null);
            const targetId = userInfo?.id || userId;
            const response = await window.concord.sendFriendRequest(targetId);

            if (response?.request) {
                const mapped = mapFriendRequest(response.request);
                set((state) => ({
                    outgoingRequests: state.outgoingRequests.some(r => r.id === mapped.id)
                        ? state.outgoingRequests.map(r => r.id === mapped.id ? mapped : r)
                        : [mapped, ...state.outgoingRequests],
                    loading: false,
                    error: null,
                }));
                return;
            }

            set({ loading: false, error: null });
        } catch (err: any) {
            set({ error: err?.message || 'Failed to send request', loading: false });
            throw err;
        }
    },

    acceptRequest: async (requestId) => {
        set({ loading: true, error: null });
        try {
            await window.concord.acceptFriendRequest(requestId);
            set((state) => ({
                incomingRequests: state.incomingRequests.filter(r => r.id !== requestId),
                outgoingRequests: state.outgoingRequests.filter(r => r.id !== requestId),
                loading: false,
                error: null,
            }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed', loading: false });
            throw err;
        }
    },

    rejectRequest: async (requestId) => {
        set({ loading: true, error: null });
        try {
            await window.concord.rejectFriendRequest(requestId);
            set((state) => ({
                incomingRequests: state.incomingRequests.filter(r => r.id !== requestId),
                loading: false,
                error: null,
            }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed', loading: false });
            throw err;
        }
    },

    cancelRequest: async (requestId) => {
        set({ loading: true, error: null });
        try {
            await window.concord.cancelFriendRequest(requestId);
            set((state) => ({
                outgoingRequests: state.outgoingRequests.filter(r => r.id !== requestId),
                loading: false,
                error: null,
            }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed', loading: false });
            throw err;
        }
    },

    removeFriend: async (userId) => {
        set({ loading: true, error: null });
        try {
            await window.concord.removeFriend(userId);
            set((state) => ({
                friends: state.friends.filter(f => f.userId !== userId),
                loading: false,
                error: null,
            }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed', loading: false });
            throw err;
        }
    },

    blockUser: async (userId) => {
        set({ loading: true, error: null });
        try {
            await window.concord.blockUser(userId);
            set((state) => ({
                blockedUsers: state.blockedUsers.includes(userId)
                    ? state.blockedUsers
                    : [...state.blockedUsers, userId],
                friends: state.friends.filter(f => f.userId !== userId),
                loading: false,
                error: null,
            }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed', loading: false });
            throw err;
        }
    },

    unblockUser: async (userId) => {
        set({ loading: true, error: null });
        try {
            await window.concord.unblockUser(userId);
            set((state) => ({
                blockedUsers: state.blockedUsers.filter(id => id !== userId),
                loading: false,
                error: null,
            }));
        } catch (err: any) {
            set({ error: err?.message || 'Failed', loading: false });
            throw err;
        }
    },
}));