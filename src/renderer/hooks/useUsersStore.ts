import { create } from 'zustand';
import { mapUserFromApi } from '../utils/mappers';
import type { User } from '../utils/types';

interface UsersState {
    users: Map<string, User>;
    loading: Set<string>;
    failed: Set<string>;
    pendingBatch: Set<string>;
    batchTimer: ReturnType<typeof setTimeout> | null;
    getUser: (userId: string) => User | null;
    fetchUser: (userId: string) => Promise<void>;
    fetchUsers: (userIds: string[]) => Promise<void>;
    setUser: (user: Partial<User> & { id: string }) => void;
}

const BATCH_DELAY = 50;

const mergeUser = (existing: User | undefined, incoming: Partial<User> & { id: string }): User => {
    const merged = { ...(existing || {}) } as User;

    for (const [key, value] of Object.entries(incoming)) {
        if (value !== undefined && value !== null && value !== '') {
            (merged as any)[key] = value;
        }
    }

    return merged;
};

export const useUsersStore = create<UsersState>((set, get) => ({
    users: new Map(),
    loading: new Set(),
    failed: new Set(),
    pendingBatch: new Set(),
    batchTimer: null,

    getUser: (userId) => get().users.get(userId) || null,

    fetchUser: async (userId) => {
        const state = get();
        if (
            state.users.has(userId) ||
            state.loading.has(userId) ||
            state.failed.has(userId) ||
            state.pendingBatch.has(userId)
        ) {
            return;
        }

        set((s) => {
            const pending = new Set(s.pendingBatch);
            pending.add(userId);

            if (s.batchTimer) {
                clearTimeout(s.batchTimer);
            }

            const timer = setTimeout(() => {
                const currentPending = Array.from(get().pendingBatch);
                set({ pendingBatch: new Set(), batchTimer: null });

                if (currentPending.length > 0) {
                    void get().fetchUsers(currentPending);
                }
            }, BATCH_DELAY);

            return { pendingBatch: pending, batchTimer: timer };
        });
    },

    fetchUsers: async (userIds) => {
        const state = get();
        const idsToFetch = userIds.filter(
            (id) => !state.loading.has(id) && !state.failed.has(id)
        );

        if (idsToFetch.length === 0) {
            return;
        }

        set((s) => {
            const newLoading = new Set(s.loading);
            idsToFetch.forEach((id) => newLoading.add(id));
            return { loading: newLoading };
        });

        try {
            const res = await window.concord.listUsersByIds(idsToFetch);
            const fetched = (res?.users || []).map(mapUserFromApi);

            set((s) => {
                const newUsers = new Map(s.users);
                const newLoading = new Set(s.loading);

                for (const rawUser of fetched) {
                    const existing = newUsers.get(rawUser.id);
                    newUsers.set(rawUser.id, mergeUser(existing, rawUser));
                }

                idsToFetch.forEach((id) => newLoading.delete(id));

                return {
                    users: newUsers,
                    loading: newLoading,
                };
            });
        } catch {
            set((s) => {
                const newLoading = new Set(s.loading);
                const newFailed = new Set(s.failed);

                idsToFetch.forEach((id) => {
                    newLoading.delete(id);
                    newFailed.add(id);
                });

                return {
                    loading: newLoading,
                    failed: newFailed,
                };
            });

            setTimeout(() => {
                set((s) => {
                    const newFailed = new Set(s.failed);
                    idsToFetch.forEach((id) => newFailed.delete(id));
                    return { failed: newFailed };
                });
            }, 10000);
        }
    },

    setUser: (user) => {
        set((s) => {
            const newUsers = new Map(s.users);
            const existing = newUsers.get(user.id);
            newUsers.set(user.id, mergeUser(existing, user));
            return { users: newUsers };
        });
    },
}));