import { useCallback, useEffect, useRef } from 'react';
import useAuthStore, { type PresenceStatus } from './useAuthStore';
import { useVoiceStore } from './useVoiceStore';

const AWAY_AFTER_MS = 30 * 60 * 1000;

const canAutoAwayFrom = (status: PresenceStatus) =>
    status === 'online' || status === 'idle';

export const usePresence = () => {
    const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
    const userId = useAuthStore((s) => s.user?.id);
    const connectedToVoice = useVoiceStore((s) => s.connected || s.connecting);

    const lastActiveAtRef = useRef(Date.now());

    const syncStatus = useCallback(
        async (status: PresenceStatus) => {
            if (!isAuthenticated || !userId) return;

            try {
                await window.concord.updateStatus(status);
            } catch (err) {
                console.error('[Presence] Failed to sync status:', err);
            }
        },
        [isAuthenticated, userId]
    );

    const restoreFromAutoAway = useCallback(() => {
        const auth = useAuthStore.getState();
        if (!auth.isAutoAway) return;

        auth.restoreManualStatus();
        void syncStatus(auth.manualStatus);
    }, [syncStatus]);

    const markActivity = useCallback(() => {
        lastActiveAtRef.current = Date.now();
        restoreFromAutoAway();
    }, [restoreFromAutoAway]);

    useEffect(() => {
        if (!isAuthenticated || !userId) return;

        lastActiveAtRef.current = Date.now();

        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                markActivity();
            }
        };

        const activityEvents: Array<keyof WindowEventMap> = [
            'mousemove',
            'mousedown',
            'keydown',
            'touchstart',
            'wheel',
            'focus',
        ];

        activityEvents.forEach((eventName) => {
            window.addEventListener(eventName, markActivity, { passive: true });
        });

        document.addEventListener('visibilitychange', handleVisibility);

        const interval = window.setInterval(() => {
            const auth = useAuthStore.getState();
            const inactiveFor = Date.now() - lastActiveAtRef.current;

            if (
                !connectedToVoice &&
                canAutoAwayFrom(auth.manualStatus) &&
                inactiveFor >= AWAY_AFTER_MS
            ) {
                if (!auth.isAutoAway || auth.user?.status !== 'away') {
                    auth.setUserStatus('away', { auto: true });
                    void syncStatus('away');
                }
                return;
            }

            if (auth.isAutoAway && (connectedToVoice || inactiveFor < AWAY_AFTER_MS)) {
                auth.restoreManualStatus();
                void syncStatus(auth.manualStatus);
            }
        }, 60_000);

        return () => {
            window.clearInterval(interval);
            activityEvents.forEach((eventName) => {
                window.removeEventListener(eventName, markActivity);
            });
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [connectedToVoice, isAuthenticated, markActivity, syncStatus, userId]);
};