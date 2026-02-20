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
    serverAddress: 'https://concord.akarpov.ru',
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

export function getFileBaseUrl(serverAddress: string): string {
    let addr = serverAddress.trim();

    if (addr.startsWith('https://')) {
        const host = addr.replace('https://', '').replace(/\/+$/, '').split(':')[0];
        return `https://${host}`;
    }

    if (addr.startsWith('http://')) {
        const host = addr.replace('http://', '').replace(/\/+$/, '').split(':')[0];
        return `http://${host}:8080`;
    }

    const host = addr.split(':')[0] || 'localhost';
    return `http://${host}:8080`;
}