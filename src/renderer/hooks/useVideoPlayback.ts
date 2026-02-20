import { useEffect, useRef, useState, useCallback } from 'react';

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
}

declare global {
    interface Window {
        concord: any;
    }
}

const MAX_DECODE_QUEUE = 5;

export function useVideoPlayback(enabled: boolean, ssrcToUserId: Map<number, string>) {
    const [remoteVideos, setRemoteVideos] = useState<Map<number, RemoteVideo>>(new Map());
    const cleanupRef = useRef<(() => void) | null>(null);
    const mountedRef = useRef(true);
    const decodersRef = useRef<Map<number, DecoderState>>(new Map());
    const ssrcMapRef = useRef<Map<number, string>>(ssrcToUserId);
    const frameQueueRef = useRef<Map<number, VideoFrame[]>>(new Map());

    useEffect(() => {
        ssrcMapRef.current = ssrcToUserId;
    }, [ssrcToUserId]);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const getOrCreateDecoder = useCallback((ssrc: number): DecoderState | null => {
        let state = decodersRef.current.get(ssrc);
        if (state && state.decoder.state !== 'closed') return state;

        const VideoDecoderCtor = (globalThis as any).VideoDecoder;
        if (!VideoDecoderCtor) return null;

        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;

        const ctx = canvas.getContext('2d', {
            alpha: false,
            desynchronized: true,
        });
        if (!ctx) return null;

        console.log(`[VideoPlayback] Creating decoder for SSRC ${ssrc}`);

        const decoder = new VideoDecoderCtor({
            output: (frame: globalThis.VideoFrame) => {
                if (!mountedRef.current) {
                    frame.close();
                    return;
                }

                const decoderState = decodersRef.current.get(ssrc);
                if (!decoderState) {
                    frame.close();
                    return;
                }

                if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
                if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;

                ctx.drawImage(frame, 0, 0);
                frame.close();

                decoderState.frameCount++;
                if (decoderState.frameCount % 30 === 1) {
                    console.log(`[VideoPlayback] Decoded frame #${decoderState.frameCount} for SSRC ${ssrc}`);
                }

                const userId = ssrcMapRef.current.get(ssrc) || `unknown-${ssrc}`;
                setRemoteVideos(prev => {
                    const next = new Map(prev);
                    next.set(ssrc, { ssrc, userId, canvas, lastFrame: Date.now() });
                    return next;
                });
            },
            error: (e: DOMException) => {
                console.error(`[VideoPlayback] Decoder error for SSRC ${ssrc}:`, e);
                const state = decodersRef.current.get(ssrc);
                if (state) state.pendingKeyframe = true;
            }
        });

        state = {
            decoder,
            canvas,
            ctx,
            configured: false,
            pendingKeyframe: true,
            lastTimestamp: 0,
            frameCount: 0,
        };
        decodersRef.current.set(ssrc, state);
        return state;
    }, []);

    const configureDecoder = useCallback(async (state: DecoderState, ssrc: number): Promise<boolean> => {
        if (state.configured && state.decoder.state === 'configured') return true;

        const configs = [
            {
                codec: 'avc1.42001f',
                hardwareAcceleration: 'no-preference' as const,
                optimizeForLatency: true,
            },
            {
                codec: 'avc1.42001E',
                hardwareAcceleration: 'no-preference' as const,
                optimizeForLatency: true,
            },
            {
                codec: 'vp8',
                hardwareAcceleration: 'no-preference' as const,
                optimizeForLatency: true,
            },
        ];

        for (const config of configs) {
            try {
                const support = await (VideoDecoder as any).isConfigSupported(config);
                if (support?.supported) {
                    state.decoder.configure(support.config || config);
                    state.configured = true;
                    state.pendingKeyframe = false;
                    console.log(`[VideoPlayback] Decoder configured for SSRC ${ssrc} with ${config.codec}, optimizeForLatency=true`);
                    return true;
                }
            } catch {}
        }
        console.error(`[VideoPlayback] Failed to configure decoder for SSRC ${ssrc}`);
        return false;
    }, []);

    const processFrame = useCallback(async (frame: VideoFrame) => {
        const ssrc = frame.ssrc;
        const state = getOrCreateDecoder(ssrc);
        if (!state) return;

        let bytes: Uint8Array;
        if (Array.isArray(frame.data)) {
            bytes = new Uint8Array(frame.data);
        } else if (frame.data instanceof Uint8Array) {
            bytes = frame.data;
        } else {
            return;
        }

        if (bytes.length === 0) return;

        if (!state.configured) {
            if (!frame.isKeyframe) {
                state.pendingKeyframe = true;
                return;
            }
            console.log(`[VideoPlayback] Configuring decoder for SSRC ${ssrc} with keyframe`);
            const configured = await configureDecoder(state, ssrc);
            if (!configured) return;
        }

        if (state.pendingKeyframe && !frame.isKeyframe) {
            return;
        }

        if (frame.isKeyframe) {
            state.pendingKeyframe = false;
        }

        const EncodedVideoChunkCtor = (globalThis as any).EncodedVideoChunk;
        if (!EncodedVideoChunkCtor) return;

        try {
            const chunk = new EncodedVideoChunkCtor({
                type: frame.isKeyframe ? 'key' : 'delta',
                timestamp: frame.timestamp,
                data: bytes
            });

            if (state.decoder.state === 'configured' && state.decoder.decodeQueueSize < MAX_DECODE_QUEUE) {
                state.decoder.decode(chunk);
                state.lastTimestamp = frame.timestamp;
            }
        } catch (err) {
            console.error('[VideoPlayback] Decode error:', err);
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
            frameQueueRef.current.clear();
            setRemoteVideos(new Map());
            return;
        }

        const handleVideo = (frame: VideoFrame) => {
            if (!mountedRef.current) return;
            processFrame(frame);
        };

        const handleParticipantLeft = (ev: any) => {
            const ssrc = (ev?.ssrc ?? ev?.audio_ssrc ?? 0) >>> 0;
            const videoSsrc = (ev?.videoSsrc ?? ev?.video_ssrc ?? 0) >>> 0;
            const screenSsrc = (ev?.screenSsrc ?? ev?.screen_ssrc ?? 0) >>> 0;

            [ssrc, videoSsrc, screenSsrc].forEach(s => {
                if (s) {
                    const state = decodersRef.current.get(s);
                    if (state?.decoder.state !== 'closed') state?.decoder.close();
                    decodersRef.current.delete(s);
                    frameQueueRef.current.delete(s);
                    setRemoteVideos(prev => {
                        const next = new Map(prev);
                        next.delete(s);
                        return next;
                    });
                }
            });
        };

        const unsubVideo = window.concord?.onVoiceVideo?.(handleVideo);
        const unsubLeft = window.concord?.onVoiceParticipantLeft?.(handleParticipantLeft);

        const cleanupInterval = setInterval(() => {
            const now = Date.now();
            setRemoteVideos(prev => {
                let changed = false;
                const next = new Map(prev);
                for (const [ssrc, video] of next) {
                    if (now - video.lastFrame > 10000) {
                        next.delete(ssrc);
                        const state = decodersRef.current.get(ssrc);
                        if (state?.decoder.state !== 'closed') state?.decoder.close();
                        decodersRef.current.delete(ssrc);
                        frameQueueRef.current.delete(ssrc);
                        changed = true;
                    }
                }
                return changed ? next : prev;
            });
        }, 2000);

        cleanupRef.current = () => {
            unsubVideo?.();
            unsubLeft?.();
            clearInterval(cleanupInterval);
        };

        return () => {
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [enabled, processFrame]);

    return { remoteVideos };
}