import { useEffect } from 'react';
import { useSettingsStore } from './useSettingsStore';

export function useTheme() {
    const { settings } = useSettingsStore();

    useEffect(() => {
        const root = document.documentElement;

        if (settings.theme === 'auto') {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            const apply = (e: MediaQueryListEvent | MediaQueryList) => {
                root.classList.toggle('dark', e.matches);
            };
            apply(mq);
            mq.addEventListener('change', apply);
            return () => mq.removeEventListener('change', apply);
        }

        root.classList.toggle('dark', settings.theme === 'dark');
    }, [settings.theme]);
}