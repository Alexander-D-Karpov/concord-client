import { useEffect, useRef, useState, useCallback } from 'react';
import { SYNC_DEAD_ZONE_US, VIDEO_CLOCK_HZ } from '../../shared/voice/constants';

interface VideoFrame {
    ssrc: number;
    timestamp: number;
    isKeyframe: boolean;
    data: number[] | Uint8Array;
}

interface RemoteVideo {
    ssrc: number;
    userId: string;
    canvas: HTMLCanvasElement;
    lastFrame: number;
}

interface DecoderState {
    decoder: VideoDecoder;
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    configured: boolean;
    pendingKeyframe: boolean;
    lastTimestamp: number;
    frameCount: number;
    syncQueue: { frame: any; renderAt: number }[];
}

declare global {
    interface Window {
        concord: any;
    }
}

const MAX_DECODE_QUEUE = 5;
const SYNC_BUFFER_MS = 40;

export function useVideoPlayback(enabled: boolean, ssrcToUserId: Map<number, string>) {
    const [remoteVideos, setRemoteVideos] = useState<Map<number, RemoteVideo>>(new Map());
    const cleanupRef = useRef<(() => void) | null>(null);
    const mountedRef = useRef(true);
    const decodersRef = useRef<Map<number, DecoderState>>(new Map());
    const ssrcMapRef = useRef<Map<number, string>>(ssrcToUserId);
    const audioClockRef = useRef<Map<number, { baseAudioPts: number; baseWallUs: number }>>(new Map());

    useEffect(() => { ssrcMapRef.current = ssrcToUserId; }, [ssrcToUserId]);
    useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

    const updateRemoteVideo = useCallback((ssrc: number, canvas: HTMLCanvasElement) => {
        const userId = ssrcMapRef.current.get(ssrc) || `unknown-${ssrc}`;
        setRemoteVideos(prev => {
            const next = new Map(prev);
            next.set(ssrc, { ssrc, userId, canvas, lastFrame: Date.now() });
            return next;
        });
    }, []);

    const getOrCreateDecoder = useCallback((ssrc: number): DecoderState | null => {
        let state = decodersRef.current.get(ssrc);
        if (state && state.decoder.state !== 'closed') return state;

        const VideoDecoderCtor = (globalThis as any).VideoDecoder;
        if (!VideoDecoderCtor) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        if (!ctx) return null;

        const decoder = new VideoDecoderCtor({
            output: (frame: globalThis.VideoFrame) => {
                if (!mountedRef.current) { frame.close(); return; }
                const ds = decodersRef.current.get(ssrc);
                if (!ds) { frame.close(); return; }

                if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
                if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;

                ctx.drawImage(frame, 0, 0);
                frame.close();
                ds.frameCount++;

                updateRemoteVideo(ssrc, canvas);
            },
            error: (e: DOMException) => {
                console.error(`[VideoPlayback] Decoder error SSRC ${ssrc}:`, e);
                const ds = decodersRef.current.get(ssrc);
                if (ds) ds.pendingKeyframe = true;
            }
        });

        state = {
            decoder, canvas, ctx,
            configured: false,
            pendingKeyframe: true,
            lastTimestamp: 0,
            frameCount: 0,
            syncQueue: [],
        };
        decodersRef.current.set(ssrc, state);
        return state;
    }, [updateRemoteVideo]);

    const configureDecoder = useCallback(async (state: DecoderState, ssrc: number): Promise<boolean> => {
        if (state.configured && state.decoder.state === 'configured') return true;

        const configs = [
            { codec: 'avc1.42001f', hardwareAcceleration: 'no-preference' as const, optimizeForLatency: true },
            { codec: 'avc1.42001E', hardwareAcceleration: 'no-preference' as const, optimizeForLatency: true },
            { codec: 'vp8', hardwareAcceleration: 'no-preference' as const, optimizeForLatency: true },
        ];

        for (const config of configs) {
            try {
                const support = await (VideoDecoder as any).isConfigSupported(config);
                if (support?.supported) {
                    state.decoder.configure(support.config || config);
                    state.configured = true;
                    state.pendingKeyframe = false;
                    return true;
                }
            } catch {}
        }
        return false;
    }, []);

    const processFrame = useCallback(async (frame: VideoFrame) => {
        const ssrc = frame.ssrc;
        const state = getOrCreateDecoder(ssrc);
        if (!state) return;

        let bytes: Uint8Array;
        if (Array.isArray(frame.data)) bytes = new Uint8Array(frame.data);
        else if (frame.data instanceof Uint8Array) bytes = frame.data;
        else return;
        if (bytes.length === 0) return;

        if (!state.configured) {
            if (!frame.isKeyframe) { state.pendingKeyframe = true; return; }
            const ok = await configureDecoder(state, ssrc);
            if (!ok) return;
        }

        if (state.pendingKeyframe && !frame.isKeyframe) return;
        if (frame.isKeyframe) state.pendingKeyframe = false;

        const EncodedVideoChunkCtor = (globalThis as any).EncodedVideoChunk;
        if (!EncodedVideoChunkCtor) return;

        // AV sync: check drift against audio clock
        const audioClock = window.__concordAudioClock;
        if (audioClock) {
            // Find audio clock for the same user (any SSRC that maps to the same userId)
            const userId = ssrcMapRef.current.get(ssrc);
            if (userId) {
                for (const [audioSsrc, clock] of Object.entries(audioClock)) {
                    const audioUserId = ssrcMapRef.current.get(Number(audioSsrc));
                    if (audioUserId === userId) {
                        const audioBase = audioClockRef.current.get(ssrc);
                        if (!audioBase) {
                            audioClockRef.current.set(ssrc, {
                                baseAudioPts: clock.pts,
                                baseWallUs: clock.wallMs * 1000,
                            });
                        }
                        break;
                    }
                }
            }
        }

        try {
            const chunk = new EncodedVideoChunkCtor({
                type: frame.isKeyframe ? 'key' : 'delta',
                timestamp: frame.timestamp,
                data: bytes,
            });

            if (state.decoder.state === 'configured' && state.decoder.decodeQueueSize < MAX_DECODE_QUEUE) {
                state.decoder.decode(chunk);
                state.lastTimestamp = frame.timestamp;
            }
        } catch {
            state.pendingKeyframe = true;
        }
    }, [getOrCreateDecoder, configureDecoder]);

    useEffect(() => {
        if (!enabled) {
            cleanupRef.current?.();
            cleanupRef.current = null;
            for (const state of decodersRef.current.values()) {
                if (state.decoder.state !== 'closed') state.decoder.close();
            }
            decodersRef.current.clear();
            audioClockRef.current.clear();
            setRemoteVideos(new Map());
            return;
        }

        const handleVideo = (frame: VideoFrame) => {
            if (!mountedRef.current) return;
            processFrame(frame);
        };

        const handleAudio = (packet: any) => {
            if (!mountedRef.current) return;
            const ssrc = packet.ssrc >>> 0;
            if (!audioClockRef.current.has(ssrc)) {
                audioClockRef.current.set(ssrc, {
                    baseAudioPts: packet.timestamp || 0,
                    baseWallUs: performance.now() * 1000,
                });
            }
        };

        const handleParticipantLeft = (ev: any) => {
            const ssrcs = [
                (ev?.ssrc ?? 0) >>> 0,
                (ev?.videoSsrc ?? ev?.video_ssrc ?? 0) >>> 0,
                (ev?.screenSsrc ?? ev?.screen_ssrc ?? 0) >>> 0,
            ];
            ssrcs.forEach(s => {
                if (!s) return;
                const state = decodersRef.current.get(s);
                if (state?.decoder.state !== 'closed') state?.decoder.close();
                decodersRef.current.delete(s);
                audioClockRef.current.delete(s);
                if (window.__concordAudioClock) delete window.__concordAudioClock[s];
                setRemoteVideos(prev => { const n = new Map(prev); n.delete(s); return n; });
            });
        };

        const unsubVideo = window.concord?.onVoiceVideo?.(handleVideo);
        const unsubAudio = window.concord?.onVoiceAudio?.(handleAudio);
        const unsubLeft = window.concord?.onVoiceParticipantLeft?.(handleParticipantLeft);

        const cleanup = setInterval(() => {
            const now = Date.now();
            setRemoteVideos(prev => {
                let changed = false;
                const next = new Map(prev);
                for (const [ssrc, v] of next) {
                    if (now - v.lastFrame > 10000) {
                        next.delete(ssrc);
                        const ds = decodersRef.current.get(ssrc);
                        if (ds?.decoder.state !== 'closed') ds?.decoder.close();
                        decodersRef.current.delete(ssrc);
                        audioClockRef.current.delete(ssrc);
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 3000);

        cleanupRef.current = () => {
            unsubVideo?.();
            unsubAudio?.();
            unsubLeft?.();
            clearInterval(cleanup);
            window.__concordAudioClock = undefined;
        };

        return () => { cleanupRef.current?.(); cleanupRef.current = null; };
    }, [enabled, processFrame]);

    return { remoteVideos };
}