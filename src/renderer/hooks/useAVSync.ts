import { useRef, useCallback } from 'react';
import { SYNC_DEAD_ZONE_US, AUDIO_CLOCK_HZ, VIDEO_CLOCK_HZ } from '../../shared/voice/constants';

interface SyncState {
    audioBaseUs: number;
    videoBaseUs: number;
    audioArrivalBase: number;
    videoArrivalBase: number;
    driftCompensationUs: number;
    initialized: boolean;
}

export interface AVSyncController {
    noteAudioPacket(timestamp: number): void;
    noteVideoFrame(timestamp: number): number;
    getCurrentAudioTimeUs(): number;
    reset(): void;
}

export function useAVSync(): AVSyncController {
    const stateRef = useRef<Map<string, SyncState>>(new Map());
    const globalAudioTimeRef = useRef(0);

    const getOrCreate = (key: string): SyncState => {
        let s = stateRef.current.get(key);
        if (!s) {
            s = {
                audioBaseUs: 0,
                videoBaseUs: 0,
                audioArrivalBase: 0,
                videoArrivalBase: 0,
                driftCompensationUs: 0,
                initialized: false,
            };
            stateRef.current.set(key, s);
        }
        return s;
    };

    const noteAudioPacket = useCallback((timestamp: number) => {
        const nowUs = performance.now() * 1000;
        const ptsUs = (timestamp / AUDIO_CLOCK_HZ) * 1_000_000;
        globalAudioTimeRef.current = nowUs;

        const s = getOrCreate('global');
        if (!s.initialized) {
            s.audioBaseUs = ptsUs;
            s.audioArrivalBase = nowUs;
            s.initialized = true;
        }
    }, []);

    const noteVideoFrame = useCallback((timestamp: number): number => {
        const nowUs = performance.now() * 1000;
        const videoPtsUs = (timestamp / VIDEO_CLOCK_HZ) * 1_000_000;
        const audioNowUs = globalAudioTimeRef.current;

        if (audioNowUs === 0) return 0;

        const s = getOrCreate('global');
        if (s.videoBaseUs === 0) {
            s.videoBaseUs = videoPtsUs;
            s.videoArrivalBase = nowUs;
        }

        const audioElapsed = nowUs - s.audioArrivalBase;
        const videoElapsed = videoPtsUs - s.videoBaseUs;
        const drift = videoElapsed - audioElapsed + s.driftCompensationUs;

        if (Math.abs(drift) < SYNC_DEAD_ZONE_US) {
            return 0;
        }

        if (drift > 0) {
            return Math.min(drift / 1000, 80);
        }

        return Math.max(drift / 1000, -80);
    }, []);

    const getCurrentAudioTimeUs = useCallback((): number => {
        return globalAudioTimeRef.current;
    }, []);

    const reset = useCallback(() => {
        stateRef.current.clear();
        globalAudioTimeRef.current = 0;
    }, []);

    return { noteAudioPacket, noteVideoFrame, getCurrentAudioTimeUs, reset };
}