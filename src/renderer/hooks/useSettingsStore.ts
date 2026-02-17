import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CustomSounds {
    message?: string;
    dm?: string;
    mention?: string;
    call?: string;
}

export interface Settings {
    serverAddress: string;
    theme: 'dark' | 'light' | 'auto';
    notifications: boolean;
    sounds: boolean;
    compactMode: boolean;
    showMemberList: boolean;
    fontSize: 'small' | 'medium' | 'large';
    language: string;
    customSounds: CustomSounds;
}

interface SettingsState {
    settings: Settings;
    updateSettings: (settings: Partial<Settings>) => void;
    resetSettings: () => void;
    setCustomSound: (type: keyof CustomSounds, path: string | undefined) => void;
}

const defaultSettings: Settings = {
    serverAddress: 'localhost:9090',
    theme: 'dark',
    notifications: true,
    sounds: true,
    compactMode: false,
    showMemberList: true,
    fontSize: 'medium',
    language: 'en',
    customSounds: {},
};

export const useSettingsStore = create<SettingsState>()(
    persist(
        (set) => ({
            settings: defaultSettings,
            updateSettings: (newSettings) =>
                set((state) => ({
                    settings: { ...state.settings, ...newSettings },
                })),
            resetSettings: () => set({ settings: defaultSettings }),
            setCustomSound: (type, path) =>
                set((state) => ({
                    settings: {
                        ...state.settings,
                        customSounds: {
                            ...state.settings.customSounds,
                            [type]: path,
                        },
                    },
                })),
        }),
        {
            name: 'settings-storage',
        }
    )
);