import { create } from 'zustand';
import { User } from '../types';

interface UsersState {
    users: Map<string, User>;
    loading: Set<string>;
    failed: Set<string>;
    getUser: (userId: string) => User | null;
    fetchUser: (userId: string) => Promise<void>;
    fetchUsers: (userIds: string[]) => Promise<void>;
    setUser: (user: Partial<User> & { id: string }) => void;
}

const mapUserFromApi = (info: any): User => ({
    id: info.id,
    handle: info.handle,
    displayName: info.display_name || info.handle,
    avatarUrl: info.avatar_url || undefined,
    avatarThumbnailUrl: info.avatar_thumbnail_url || undefined,
    createdAt: info.created_at,
    status: info.status,
    bio: info.bio,
});

export const useUsersStore = create<UsersState>((set, get) => ({
    users: new Map(),
    loading: new Set(),
    failed: new Set(),

    getUser: (userId: string) => get().users.get(userId) || null,

    fetchUser: async (userId: string) => {
        const state = get();
        if (state.users.has(userId) || state.loading.has(userId) || state.failed.has(userId)) return;

        set((s) => {
            const newLoading = new Set(s.loading);
            newLoading.add(userId);
            return { loading: newLoading };
        });

        try {
            const userInfo = await window.concord.getUser(userId);
            const user = mapUserFromApi(userInfo);
            set((s) => {
                const newUsers = new Map(s.users);
                newUsers.set(userId, user);
                const newLoading = new Set(s.loading);
                newLoading.delete(userId);
                const newFailed = new Set(s.failed);
                newFailed.delete(userId);
                return { users: newUsers, loading: newLoading, failed: newFailed };
            });
        } catch (err) {
            console.error('[UsersStore] Failed to fetch user:', userId, err);
            set((s) => {
                const newLoading = new Set(s.loading);
                newLoading.delete(userId);
                const newFailed = new Set(s.failed);
                newFailed.add(userId);
                return { loading: newLoading, failed: newFailed };
            });
            setTimeout(() => {
                set((s) => {
                    const newFailed = new Set(s.failed);
                    newFailed.delete(userId);
                    return { failed: newFailed };
                });
            }, 10000);
        }
    },

    fetchUsers: async (userIds: string[]) => {
        const state = get();
        const idsToFetch = userIds.filter(
            (id) => !state.users.has(id) && !state.loading.has(id) && !state.failed.has(id)
        );
        if (idsToFetch.length === 0) return;

        set((s) => {
            const newLoading = new Set(s.loading);
            idsToFetch.forEach(id => newLoading.add(id));
            return { loading: newLoading };
        });

        try {
            const res = await window.concord.listUsersByIds(idsToFetch);
            const fetchedUsers = (res?.users || []).map(mapUserFromApi);

            set((s) => {
                const newUsers = new Map(s.users);
                fetchedUsers.forEach((u: User) => newUsers.set(u.id, u));
                const newLoading = new Set(s.loading);
                idsToFetch.forEach(id => newLoading.delete(id));
                return { users: newUsers, loading: newLoading };
            });
        } catch (err) {
            console.error('[UsersStore] Failed to batch fetch users:', err);
            set((s) => {
                const newLoading = new Set(s.loading);
                idsToFetch.forEach(id => newLoading.delete(id));
                const newFailed = new Set(s.failed);
                idsToFetch.forEach(id => newFailed.add(id));
                return { loading: newLoading, failed: newFailed };
            });
            setTimeout(() => {
                set((s) => {
                    const newFailed = new Set(s.failed);
                    idsToFetch.forEach(id => newFailed.delete(id));
                    return { failed: newFailed };
                });
            }, 10000);
        }
    },

    setUser: (user: Partial<User> & { id: string }) => {
        set((s) => {
            const newUsers = new Map(s.users);
            const existing = newUsers.get(user.id);
            if (existing) {
                const merged = { ...existing };
                for (const [key, value] of Object.entries(user)) {
                    if (value !== undefined && value !== '') {
                        (merged as any)[key] = value;
                    }
                }
                newUsers.set(user.id, merged);
            } else {
                newUsers.set(user.id, user as User);
            }
            return { users: newUsers };
        });
    },
}));