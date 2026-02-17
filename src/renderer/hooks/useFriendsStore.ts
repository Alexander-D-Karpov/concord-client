import { create } from 'zustand';
import { Friend, FriendRequest } from '../types';

interface FriendsState {
    friends: Friend[];
    incomingRequests: FriendRequest[];
    outgoingRequests: FriendRequest[];
    blockedUsers: string[];
    loading: boolean;
    error: string | null;

    setFriends: (friends: Friend[]) => void;
    setIncomingRequests: (requests: FriendRequest[]) => void;
    setOutgoingRequests: (requests: FriendRequest[]) => void;
    setBlockedUsers: (users: string[]) => void;
    setLoading: (loading: boolean) => void;
    setError: (error: string | null) => void;

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

const mapFriend = (f: any): Friend => ({
    userId: f.user_id,
    handle: f.handle,
    displayName: f.display_name,
    avatarUrl: f.avatar_url,
    status: f.status || 'offline',
    friendsSince: new Date(Number(f.friends_since?.seconds || 0) * 1000).toISOString(),
});

const mapRequest = (r: any): FriendRequest => ({
    id: r.id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    status: r.status === 'FRIEND_REQUEST_STATUS_PENDING' ? 'pending' :
        r.status === 'FRIEND_REQUEST_STATUS_ACCEPTED' ? 'accepted' : 'rejected',
    createdAt: new Date(Number(r.created_at?.seconds || 0) * 1000).toISOString(),
    updatedAt: new Date(Number(r.updated_at?.seconds || 0) * 1000).toISOString(),
    fromHandle: r.from_handle,
    fromDisplayName: r.from_display_name,
    fromAvatarUrl: r.from_avatar_url,
    toHandle: r.to_handle,
    toDisplayName: r.to_display_name,
    toAvatarUrl: r.to_avatar_url,
});

export const useFriendsStore = create<FriendsState>((set, get) => ({
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    blockedUsers: [],
    loading: false,
    error: null,

    setFriends: (friends) => set({ friends }),
    setIncomingRequests: (requests) => set({ incomingRequests: requests }),
    setOutgoingRequests: (requests) => set({ outgoingRequests: requests }),
    setBlockedUsers: (users) => set({ blockedUsers: users }),
    setLoading: (loading) => set({ loading }),
    setError: (error) => set({ error }),

    updateFriendStatus: (userId, status) => set((state) => ({
        friends: state.friends.map(f =>
            f.userId === userId ? { ...f, status } : f
        )
    })),

    loadFriends: async () => {
        set({ loading: true, error: null });
        try {
            const response = await window.concord.listFriends();
            const friends = (response?.friends || []).map(mapFriend);
            set({ friends, loading: false });
        } catch (err: any) {
            set({ error: err?.message || 'Failed to load friends', loading: false });
        }
    },

    loadPendingRequests: async () => {
        set({ loading: true, error: null });
        try {
            const response = await window.concord.listPendingRequests();
            const incoming = (response?.incoming || []).map(mapRequest);
            const outgoing = (response?.outgoing || []).map(mapRequest);
            set({ incomingRequests: incoming, outgoingRequests: outgoing, loading: false });
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

    sendRequest: async (userId: string) => {
        set({ loading: true, error: null });
        try {
            await window.concord.sendFriendRequest(userId);
            await get().loadPendingRequests();
        } catch (err: any) {
            set({ error: err?.message || 'Failed to send request', loading: false });
            throw err;
        }
    },

    acceptRequest: async (requestId: string) => {
        set({ loading: true, error: null });
        try {
            await window.concord.acceptFriendRequest(requestId);
            await Promise.all([get().loadFriends(), get().loadPendingRequests()]);
        } catch (err: any) {
            set({ error: err?.message || 'Failed to accept request', loading: false });
            throw err;
        }
    },

    rejectRequest: async (requestId: string) => {
        set({ loading: true, error: null });
        try {
            await window.concord.rejectFriendRequest(requestId);
            await get().loadPendingRequests();
        } catch (err: any) {
            set({ error: err?.message || 'Failed to reject request', loading: false });
            throw err;
        }
    },

    cancelRequest: async (requestId: string) => {
        set({ loading: true, error: null });
        try {
            await window.concord.cancelFriendRequest(requestId);
            await get().loadPendingRequests();
        } catch (err: any) {
            set({ error: err?.message || 'Failed to cancel request', loading: false });
            throw err;
        }
    },

    removeFriend: async (userId: string) => {
        set({ loading: true, error: null });
        try {
            await window.concord.removeFriend(userId);
            await get().loadFriends();
        } catch (err: any) {
            set({ error: err?.message || 'Failed to remove friend', loading: false });
            throw err;
        }
    },

    blockUser: async (userId: string) => {
        set({ loading: true, error: null });
        try {
            await window.concord.blockUser(userId);
            await Promise.all([get().loadBlockedUsers(), get().loadFriends()]);
        } catch (err: any) {
            set({ error: err?.message || 'Failed to block user', loading: false });
            throw err;
        }
    },

    unblockUser: async (userId: string) => {
        set({ loading: true, error: null });
        try {
            await window.concord.unblockUser(userId);
            await get().loadBlockedUsers();
        } catch (err: any) {
            set({ error: err?.message || 'Failed to unblock user', loading: false });
            throw err;
        }
    },
}));