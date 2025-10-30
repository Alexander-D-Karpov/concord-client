import { create } from 'zustand';
import { User } from '../types';

interface UsersState {
    users: Map<string, User>;
    loading: Set<string>;
    getUser: (userId: string) => User | null;
    fetchUser: (userId: string) => Promise<void>;
    fetchUsers: (userIds: string[]) => Promise<void>;
    setUser: (user: User) => void;
}

export const useUsersStore = create<UsersState>((set, get) => ({
    users: new Map(),
    loading: new Set(),

    getUser: (userId: string) => {
        return get().users.get(userId) || null;
    },

    fetchUser: async (userId: string) => {
        const state = get();

        if (state.users.has(userId) || state.loading.has(userId)) {
            return;
        }

        set((state) => ({
            loading: new Set(state.loading).add(userId),
        }));

        try {
            const userInfo = await window.concord.getUser(userId);
            const user: User = {
                id: userInfo.id,
                handle: userInfo.handle,
                displayName: userInfo.display_name || userInfo.handle,
                avatarUrl: userInfo.avatar_url,
                createdAt: userInfo.created_at,
                status: userInfo.status,
                bio: userInfo.bio,
            };

            set((state) => {
                const newUsers = new Map(state.users);
                newUsers.set(userId, user);
                const newLoading = new Set(state.loading);
                newLoading.delete(userId);
                return { users: newUsers, loading: newLoading };
            });
        } catch (err) {
            console.error('[UsersStore] Failed to fetch user:', userId, err);
            set((state) => {
                const newLoading = new Set(state.loading);
                newLoading.delete(userId);
                return { loading: newLoading };
            });
        }
    },

    fetchUsers: async (userIds: string[]) => {
        const state = get();
        const idsToFetch = userIds.filter(
            (id) => !state.users.has(id) && !state.loading.has(id)
        );

        if (idsToFetch.length === 0) return;

        await Promise.all(idsToFetch.map((id) => state.fetchUser(id)));
    },

    setUser: (user: User) => {
        set((state) => {
            const newUsers = new Map(state.users);
            newUsers.set(user.id, user);
            return { users: newUsers };
        });
    },
}));