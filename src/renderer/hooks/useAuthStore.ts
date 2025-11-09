import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
    id: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
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
    setTokens: (accessToken: string, refreshToken: string, expiresIn: number) => Promise<void>;
    setUser: (user: User) => void;
    clearTokens: () => void;
    logout: () => void;
    startTokenRefresh: () => void;
    stopTokenRefresh: () => void;
    refreshToken: () => Promise<void>;
}

let initializationPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            tokens: null,
            user: null,
            isAuthenticated: false,
            isRefreshing: false,
            isInitializing: false,
            refreshTimeout: null,

            setTokens: async (accessToken: string, refreshToken: string, expiresIn: number) => {
                const state = get();
                if (state.isRefreshing || state.isInitializing) {
                    console.log('[AuthStore] Token operation already in progress, skipping...');
                    return;
                }
                if (initializationPromise) {
                    console.log('[AuthStore] Waiting for existing initialization...');
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

                        console.log('[AuthStore] Initializing client with tokens');
                        await window.concord.initializeClient(accessToken, undefined, refreshToken, expiresIn);
                        console.log('[AuthStore] Client initialized successfully');

                        get().startTokenRefresh();
                    } catch (err) {
                        console.error('[AuthStore] Failed to initialize client:', err);
                        throw err;
                    } finally {
                        set({ isInitializing: false });
                        initializationPromise = null;
                    }
                })();

                await initializationPromise;
            },

            setUser: (user: User) => {
                set({ user });
            },

            clearTokens: () => {
                get().stopTokenRefresh();
                set({
                    tokens: null,
                    user: null,
                    isAuthenticated: false,
                    isRefreshing: false,
                    isInitializing: false,
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
                });
            },

            startTokenRefresh: () => {
                const state = get();
                const { tokens } = state;

                if (!tokens) return;

                state.stopTokenRefresh();

                const timeUntilExpiry = tokens.expiresAt - Date.now();

                if (timeUntilExpiry <= 60000) {
                    console.log('[AuthStore] Token expired or about to expire, refreshing immediately');
                    state.refreshToken().catch(err => {
                        console.error('[AuthStore] Immediate token refresh failed:', err);
                        state.logout();
                    });
                    return;
                }

                const refreshTime = Math.max(timeUntilExpiry - 60000, 10000);

                console.log(`[AuthStore] Token refresh scheduled in ${Math.round(refreshTime / 1000)}s`);

                const timeout = setTimeout(async () => {
                    try {
                        await state.refreshToken();
                    } catch (err) {
                        console.error('[AuthStore] Token refresh failed:', err);
                        state.logout();
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
                const state = get();
                const { tokens, isRefreshing } = state;

                if (isRefreshing) {
                    console.log('[AuthStore] Token refresh already in progress');
                    return;
                }

                if (!tokens?.refreshToken) {
                    throw new Error('No refresh token available');
                }

                console.log('[AuthStore] Refreshing token...');
                set({ isRefreshing: true });

                try {
                    const response = await window.concord.refreshToken(tokens.refreshToken);

                    const expiresAt = Date.now() + response.expires_in * 1000;

                    set({
                        tokens: {
                            accessToken: response.access_token,
                            refreshToken: response.refresh_token,
                            expiresAt
                        },
                    });

                    console.log('[AuthStore] Reinitializing client with new tokens');
                    await window.concord.initializeClient(
                        response.access_token,
                        undefined,
                        response.refresh_token,
                        response.expires_in
                    );
                    console.log('[AuthStore] Token refreshed successfully');

                    get().startTokenRefresh();
                } catch (err) {
                    console.error('[AuthStore] Failed to refresh token:', err);
                    get().logout();
                    throw err;
                } finally {
                    set({ isRefreshing: false });
                }
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                tokens: state.tokens,
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
            onRehydrateStorage: () => async (state) => {
                if (state?.tokens?.accessToken && !state.isInitializing) {
                    console.log('[AuthStore] Rehydrating auth state');
                    try {
                        const expiresIn = state.tokens.expiresAt
                            ? Math.max(Math.floor((state.tokens.expiresAt - Date.now()) / 1000), 0)
                            : undefined;

                        await window.concord.initializeClient(
                            state.tokens.accessToken,
                            undefined,
                            state.tokens.refreshToken,
                            expiresIn
                        );
                        console.log('[AuthStore] Client initialized on rehydration');

                        state.startTokenRefresh?.();
                    } catch (err) {
                        console.error('[AuthStore] Failed to initialize client on rehydration:', err);
                    }
                }
            },
        }
    )
);