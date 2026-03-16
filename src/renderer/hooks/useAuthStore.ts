import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { useSettingsStore } from './useSettingsStore';

export type PresenceStatus = 'online' | 'away' | 'idle' | 'dnd' | 'offline';

interface User {
    id: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
    avatarThumbnailUrl?: string;
    status?: PresenceStatus;
    statusPreference?: PresenceStatus;
}

interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
}

interface AuthState {
    tokens: AuthTokens | null;
    user: User | null;
    isAuthenticated: boolean;
    isRefreshing: boolean;
    isInitializing: boolean;
    refreshTimeout: NodeJS.Timeout | null;
    manualStatus: PresenceStatus;
    isAutoAway: boolean;

    setTokens: (accessToken: string, refreshToken: string, expiresIn: number) => Promise<void>;
    setUser: (user: Partial<User> & { id: string }) => void;
    setUserStatus: (status: PresenceStatus, options?: { auto?: boolean }) => void;
    restoreManualStatus: () => void;
    clearTokens: () => void;
    logout: () => void;
    startTokenRefresh: () => void;
    stopTokenRefresh: () => void;
    refreshToken: () => Promise<void>;
}

const normalizeStatus = (status?: string): PresenceStatus => {
    const normalized = (status || '').toLowerCase();

    if (normalized === 'busy') return 'dnd';
    if (normalized === 'invisible') return 'offline';
    if (
        normalized === 'online' ||
        normalized === 'away' ||
        normalized === 'idle' ||
        normalized === 'dnd' ||
        normalized === 'offline'
    ) {
        return normalized;
    }

    return 'online';
};

const normalizeStatusPreference = (status?: string): PresenceStatus => {
    const normalized = (status || '').toLowerCase();

    if (normalized === 'busy') return 'dnd';
    if (normalized === 'invisible') return 'offline';
    if (normalized === 'dnd') return 'dnd';
    if (normalized === 'offline') return 'offline';

    return 'online';
};

let initializationPromise: Promise<void> | null = null;

const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            tokens: null,
            user: null,
            isAuthenticated: false,
            isRefreshing: false,
            isInitializing: false,
            refreshTimeout: null,
            manualStatus: 'online',
            isAutoAway: false,

            setTokens: async (accessToken, refreshToken, expiresIn) => {
                const state = get();
                if (state.isRefreshing || state.isInitializing) return;
                if (initializationPromise) {
                    await initializationPromise;
                    return;
                }

                const expiresAt = Date.now() + expiresIn * 1000;
                set({ isInitializing: true });

                initializationPromise = (async () => {
                    try {
                        set({
                            tokens: { accessToken, refreshToken, expiresAt },
                            isAuthenticated: true,
                        });

                        const { settings } = useSettingsStore.getState();
                        await window.concord.initializeClient(
                            accessToken,
                            settings.serverAddress,
                            refreshToken,
                            expiresIn
                        );

                        get().startTokenRefresh();
                    } finally {
                        set({ isInitializing: false });
                        initializationPromise = null;
                    }
                })();

                await initializationPromise;
            },

            setUser: (userData) =>
                set((state) => {
                    const filtered = Object.fromEntries(
                        Object.entries(userData).filter(([_, value]) => value !== undefined && value !== '')
                    ) as Partial<User> & { id: string };

                    const incomingStatus = filtered.status
                        ? normalizeStatus(filtered.status as string)
                        : undefined;

                    const incomingStatusPreference = filtered.statusPreference
                        ? normalizeStatusPreference(filtered.statusPreference as string)
                        : undefined;

                    const nextUser = {
                        ...state.user,
                        ...filtered,
                        ...(incomingStatus ? { status: incomingStatus } : {}),
                        ...(incomingStatusPreference ? { statusPreference: incomingStatusPreference } : {}),
                    } as User;

                    let manualStatus = state.manualStatus;
                    let isAutoAway = state.isAutoAway;

                    if (incomingStatusPreference) {
                        manualStatus = incomingStatusPreference;
                    }

                    if (incomingStatus === 'away') {
                        isAutoAway = true;
                    } else if (incomingStatus) {
                        isAutoAway = false;
                    }

                    return {
                        user: nextUser,
                        manualStatus,
                        isAutoAway,
                    };
                }),

            setUserStatus: (status, options) =>
                set((state) => {
                    const nextStatus = normalizeStatus(status);

                    return {
                        user: state.user
                            ? {
                                ...state.user,
                                status: nextStatus,
                                statusPreference: options?.auto
                                    ? state.user.statusPreference ?? state.manualStatus
                                    : nextStatus,
                            }
                            : state.user,
                        manualStatus: options?.auto ? state.manualStatus : nextStatus,
                        isAutoAway: !!options?.auto && nextStatus === 'away',
                    };
                }),

            restoreManualStatus: () =>
                set((state) => ({
                    user: state.user
                        ? {
                            ...state.user,
                            status: state.manualStatus,
                            statusPreference: state.manualStatus,
                        }
                        : state.user,
                    isAutoAway: false,
                })),

            clearTokens: () => {
                get().stopTokenRefresh();
                set({
                    tokens: null,
                    user: null,
                    isAuthenticated: false,
                    isRefreshing: false,
                    isInitializing: false,
                    manualStatus: 'online',
                    isAutoAway: false,
                });
            },

            logout: () => {
                get().stopTokenRefresh();
                set({
                    tokens: null,
                    user: null,
                    isAuthenticated: false,
                    isRefreshing: false,
                    isInitializing: false,
                    manualStatus: 'online',
                    isAutoAway: false,
                });
            },

            startTokenRefresh: () => {
                const state = get();
                if (!state.tokens) return;

                state.stopTokenRefresh();

                const timeUntilExpiry = state.tokens.expiresAt - Date.now();
                if (timeUntilExpiry <= 60000) {
                    state.refreshToken().catch(() => state.logout());
                    return;
                }

                const refreshTime = Math.max(timeUntilExpiry - 60000, 10000);
                const timeout = setTimeout(async () => {
                    try {
                        await get().refreshToken();
                    } catch {
                        get().logout();
                    }
                }, refreshTime);

                set({ refreshTimeout: timeout });
            },

            stopTokenRefresh: () => {
                const { refreshTimeout } = get();
                if (refreshTimeout) {
                    clearTimeout(refreshTimeout);
                    set({ refreshTimeout: null });
                }
            },

            refreshToken: async () => {
                const { tokens, isRefreshing } = get();
                if (isRefreshing || !tokens?.refreshToken) return;

                set({ isRefreshing: true });

                try {
                    const response = await window.concord.refreshToken(tokens.refreshToken);
                    const expiresAt = Date.now() + response.expires_in * 1000;

                    set({
                        tokens: {
                            accessToken: response.access_token,
                            refreshToken: response.refresh_token,
                            expiresAt,
                        },
                    });

                    const { settings } = useSettingsStore.getState();
                    await window.concord.initializeClient(
                        response.access_token,
                        settings.serverAddress,
                        response.refresh_token,
                        response.expires_in
                    );

                    get().startTokenRefresh();
                } catch (err) {
                    get().logout();
                    throw err;
                } finally {
                    set({ isRefreshing: false });
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => {
                const persistedUser = state.user
                    ? (({ status, ...rest }) => rest)(state.user)
                    : null;

                return {
                    tokens: state.tokens,
                    user: persistedUser,
                    isAuthenticated: state.isAuthenticated,
                    manualStatus: state.manualStatus === 'offline' ? 'online' : state.manualStatus,
                };
            },
            onRehydrateStorage: () => async (state) => {
                if (state?.tokens?.accessToken && !state.isInitializing) {
                    try {
                        const { settings } = useSettingsStore.getState();
                        const expiresIn = state.tokens.expiresAt
                            ? Math.max(
                                Math.floor((state.tokens.expiresAt - Date.now()) / 1000),
                                0
                            )
                            : undefined;

                        await window.concord.initializeClient(
                            state.tokens.accessToken,
                            settings.serverAddress,
                            state.tokens.refreshToken,
                            expiresIn
                        );

                        state.startTokenRefresh?.();
                    } catch {}
                }
            },
        }
    )
);
export default useAuthStore