import { create } from 'zustand';
import { User, AuthTokens } from '@/types';

interface AuthState {
    user: User | null;
    tokens: AuthTokens | null;
    isAuthenticated: boolean;
    setUser: (user: User | null) => void;
    setTokens: (tokens: AuthTokens | null) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
    user: null,
    tokens: null,
    isAuthenticated: false,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    setTokens: (tokens) => set({ tokens }),
    logout: () => set({ user: null, tokens: null, isAuthenticated: false }),
}));