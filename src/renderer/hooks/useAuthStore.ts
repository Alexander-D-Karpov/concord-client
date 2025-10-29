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
    refreshTimeout: NodeJS.Timeout | null;
    setTokens: (accessToken: string, refreshToken: string, expiresIn: number) => Promise<void>;
    setUser: (user: User) => void;
    clearTokens: () => void;
    logout: () => void;
    startTokenRefresh: () => void;
    stopTokenRefresh: () => void;
    refreshToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            tokens: null,
            user: null,
            isAuthenticated: false,
            refreshTimeout: null,

            setTokens: async (accessToken: string, refreshToken: string, expiresIn: number) => {
                const expiresAt = Date.now() + expiresIn * 1000;
                set({
                    tokens: { accessToken, refreshToken, expiresAt },
                    isAuthenticated: true,
                });

                try {
                    await window.concord.initializeClient(accessToken);
                    console.log('[AuthStore] Client initialized with new token');
                } catch (err) {
                    console.error('[AuthStore] Failed to initialize client:', err);
                }

                get().startTokenRefresh();
            },

            setUser: (user: User) => {
                set({ user });
            },

            clearTokens: () => {
                get().stopTokenRefresh();
                set({
                    tokens: null,
                    user: null,
                    isAuthenticated: false
                });
            },

            logout: () => {
                get().stopTokenRefresh();
                set({
                    tokens: null,
                    user: null,
                    isAuthenticated: false
                });
            },

            startTokenRefresh: () => {
                const state = get();
                const { tokens } = state;

                if (!tokens) return;

                state.stopTokenRefresh();

                const timeUntilExpiry = tokens.expiresAt - Date.now();
                const refreshTime = Math.max(timeUntilExpiry - 60000, 10000);

                console.log(`[AuthStore] Token refresh scheduled in ${refreshTime / 1000}s`);

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
                const { tokens } = get();

                if (!tokens?.refreshToken) {
                    throw new Error('No refresh token available');
                }

                console.log('[AuthStore] Refreshing token...');

                try {
                    const response = await window.concord.refreshToken(tokens.refreshToken);

                    await get().setTokens(
                        response.access_token,
                        response.refresh_token,
                        response.expires_in
                    );

                    console.log('[AuthStore] Token refreshed and client re-initialized successfully');
                } catch (err) {
                    console.error('[AuthStore] Failed to refresh token:', err);
                    get().logout();
                    throw err;
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
            onRehydrateStorage: () => (state) => {
                if (state?.tokens?.accessToken) {
                    console.log('[AuthStore] Rehydrating auth state');
                    window.concord.initializeClient(state.tokens.accessToken).catch((err) => {
                        console.error('[AuthStore] Failed to initialize client on rehydration:', err);
                    });
                }
            },
        }
    )
);