import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getFileBaseUrl } from '../utils/urls';

export { getFileBaseUrl };

export type Theme = 'dark' | 'light' | 'auto';
export type FontSize = 'small' | 'medium' | 'large';

export interface Settings {
    serverAddress: string;
    theme: Theme;
    notifications: boolean;
    sounds: boolean;
    compactMode: boolean;
    showMemberList: boolean;
    fontSize: FontSize;
    language: string;
}

interface SettingsState {
    settings: Settings;
    updateSettings: (settings: Partial<Settings>) => void;
    resetSettings: () => void;
}

const defaultSettings: Settings = {
    serverAddress: 'https://concord.akarpov.ru',
    theme: 'dark',
    notifications: true,
    sounds: true,
    compactMode: false,
    showMemberList: true,
    fontSize: 'medium',
    language: 'en',
};

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            settings: defaultSettings,
            updateSettings: (newSettings) => set((state) => ({ settings: { ...state.settings, ...newSettings } })),
            resetSettings: () => set({ settings: defaultSettings }),
        }),
        { name: 'settings-storage' }
    )
);