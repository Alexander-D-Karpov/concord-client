import { useEffect, useRef, useCallback, useState } from 'react';
import { useDeviceStore } from './useDeviceStore';
import {
    KEYFRAME_INTERVAL_FRAMES,
    KEYFRAME_INTERVAL_SCREEN,
    QualityTier,
    QualityTierBitrate,
} from '../../shared/voice/constants';

interface VideoCaptureOptions {
    width?: number;
    height?: number;
    frameRate?: number;
}

declare global {
    interface Window {
        concord: any;
    }
}

function isH264Keyframe(data: Uint8Array): boolean {
    let i = 0;
    while (i < data.length - 4) {
        if (data[i] === 0 && data[i + 1] === 0) {
            let startCodeLen = 0;
            if (data[i + 2] === 1) startCodeLen = 3;
            else if (data[i + 2] === 0 && data[i + 3] === 1) startCodeLen = 4;

            if (startCodeLen > 0) {
                const nalType = data[i + startCodeLen] & 0x1f;
                if (nalType === 5 || nalType === 7) return true;
                i += startCodeLen + 1;
                continue;
            }
        }
        i++;
    }
    return false;
}

const CODEC_CANDIDATES = [
    { name: 'H.264 CB L3.1', codec: 'avc1.42001f' },
    { name: 'H.264 CB L3.0', codec: 'avc1.42001E' },
    { name: 'VP8', codec: 'vp8' },
];

function bitrateForResolution(w: number, h: number, fps: number, isScreen: boolean): number {
    const pixels = w * h;
    if (isScreen) {
        if (pixels >= 921600) return 1_500_000;
        if (pixels >= 409600) return 800_000;
        return 400_000;
    }
    if (pixels >= 921600) return 2_500_000;
    if (pixels >= 409600) return 1_500_000;
    if (pixels >= 230400) return 800_000;
    return 400_000;
}

export function useVideoCapture(enabled: boolean, isScreenShare: boolean, options: VideoCaptureOptions = {}) {
    const { width = 1280, height = 720, frameRate = 30 } = options;
    const { selectedVideo } = useDeviceStore();

    const [stream, setStream] = useState<MediaStream | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showSourcePicker, setShowSourcePicker] = useState(false);
    const [screenSources, setScreenSources] = useState<any[]>([]);
    const [isHardwareAccelerated, setIsHardwareAccelerated] = useState(false);

    const cleanupRef = useRef<(() => void) | null>(null);
    const mountedRef = useRef(true);
    const encoderRef = useRef<VideoEncoder | null>(null);
    const qualityTierRef = useRef<number>(QualityTier.LARGE);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const createEncoder = useCallback(async (
        mediaStream: MediaStream,
        forceSoftware: boolean,
    ): Promise<(() => void) | null> => {
        const VideoEncoderCtor = (globalThis as any).VideoEncoder as typeof VideoEncoder | undefined;
        if (!VideoEncoderCtor) return null;

        const track = mediaStream.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') return null;

        const settings = track.getSettings();
        const actualFps = isScreenShare ? 15 : Math.min(settings.frameRate || frameRate, 30);
        const actualWidth = Math.min(settings.width || width, 1280);
        const actualHeight = Math.min(settings.height || height, 720);
        const targetBitrate = bitrateForResolution(actualWidth, actualHeight, actualFps, isScreenShare);

        let configToUse: VideoEncoderConfig | null = null;

        for (const { name, codec } of CODEC_CANDIDATES) {
            const candidate: any = {
                codec,
                width: actualWidth,
                height: actualHeight,
                bitrate: targetBitrate,
                framerate: actualFps,
                latencyMode: 'realtime',
                bitrateMode: 'constant',
                hardwareAcceleration: forceSoftware ? 'prefer-software' : 'no-preference',
                ...(codec.startsWith('avc') ? { avc: { format: 'annexb' } } : {}),
            };

            try {
                const result = await (VideoEncoderCtor as any).isConfigSupported(candidate);
                if (result?.supported && result?.config) {
                    configToUse = result.config as VideoEncoderConfig;
                    setIsHardwareAccelerated(!forceSoftware);
                    console.log(`[VideoCapture] Using ${name}, ${actualWidth}x${actualHeight}@${actualFps}, bitrate=${targetBitrate}`);
                    break;
                }
            } catch {}
        }

        if (!configToUse) return null;

        let running = true;
        let frameCount = 0;
        let lastKeyframeAt = 0;
        const keyframeInterval = isScreenShare ? KEYFRAME_INTERVAL_SCREEN : KEYFRAME_INTERVAL_FRAMES;

        const encoder = new VideoEncoderCtor({
            output: (chunk: EncodedVideoChunk) => {
                if (!mountedRef.current) return;
                const buffer = new ArrayBuffer(chunk.byteLength);
                chunk.copyTo(buffer);
                const data = new Uint8Array(buffer);
                const isH264 = (configToUse as any)?.codec?.startsWith('avc');
                let isKf = chunk.type === 'key';
                if (isH264 && !isKf) isKf = isH264Keyframe(data);
                if (isKf) lastKeyframeAt = frameCount;
                window.concord?.sendVoiceVideo?.(buffer, isKf, isScreenShare ? 'screen' : 'camera');
            },
            error: (e: DOMException) => {
                console.error('[VideoCapture] Encoder error:', e);
                running = false;
                if (!forceSoftware && mountedRef.current) {
                    handleSoftwareFallback(mediaStream);
                }
            },
        });

        encoder.configure(configToUse);
        encoderRef.current = encoder;

        const ProcessorCtor = (globalThis as any).MediaStreamTrackProcessor as
            | (new (opts: { track: MediaStreamTrack }) => { readable: ReadableStream<any> })
            | undefined;

        if (!ProcessorCtor) {
            encoder.close();
            encoderRef.current = null;
            return null;
        }

        const processor = new ProcessorCtor({ track });
        const reader = processor.readable.getReader();

        const processFrames = async () => {
            while (running && mountedRef.current) {
                try {
                    const { value: frame, done } = await reader.read();
                    if (done || !frame) break;

                    try {
                        if (encoder.state === 'configured' && encoder.encodeQueueSize <= 2) {
                            frameCount++;
                            const needKeyframe = frameCount === 1 ||
                                (frameCount - lastKeyframeAt) >= keyframeInterval;

                            encoder.encode(frame, { keyFrame: needKeyframe });
                        }
                    } finally {
                        if (typeof frame.close === 'function') frame.close();
                    }
                } catch {
                    break;
                }
            }
        };

        void processFrames();

        return () => {
            running = false;
            reader.cancel().catch(() => {});
            try { if (encoder.state !== 'closed') encoder.close(); } catch {}
            encoderRef.current = null;
            mediaStream.getTracks().forEach(t => t.stop());
            if (mountedRef.current) setStream(null);
        };
    }, [width, height, frameRate, isScreenShare]);

    const handleSoftwareFallback = useCallback(async (mediaStream: MediaStream) => {
        if (encoderRef.current) {
            try { if (encoderRef.current.state !== 'closed') encoderRef.current.close(); } catch {}
            encoderRef.current = null;
        }
        const track = mediaStream.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') return;
        const cleanup = await createEncoder(mediaStream, true);
        if (cleanup) cleanupRef.current = cleanup;
    }, [createEncoder]);

    const startCameraCapture = useCallback(async () => {
        const constraints: MediaTrackConstraints = {
            width: { ideal: width, max: 1280 },
            height: { ideal: height, max: 720 },
            frameRate: { ideal: frameRate, max: 30 },
        };
        if (selectedVideo) constraints.deviceId = { exact: selectedVideo };
        return navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
    }, [width, height, frameRate, selectedVideo]);

    const startScreenCapture = useCallback(async (sourceId: string) => {
        return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    maxWidth: 1280,
                    maxHeight: 720,
                    maxFrameRate: 15,
                },
            } as any,
        });
    }, []);

    const selectScreenSource = useCallback(async (sourceId: string) => {
        setShowSourcePicker(false);
        try {
            const mediaStream = await startScreenCapture(sourceId);
            if (!mountedRef.current) { mediaStream.getTracks().forEach(t => t.stop()); return; }

            setStream(mediaStream);
            mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
                if (mountedRef.current) setStream(null);
            });
            cleanupRef.current = await createEncoder(mediaStream, false);
        } catch (err: any) {
            setError(err?.message || 'Failed to capture screen');
        }
    }, [startScreenCapture, createEncoder]);

    const cancelSourcePicker = useCallback(() => setShowSourcePicker(false), []);

    useEffect(() => {
        if (!enabled) {
            cleanupRef.current?.();
            cleanupRef.current = null;
            setStream(null);
            setError(null);
            setShowSourcePicker(false);
            return;
        }

        let cancelled = false;

        const start = async () => {
            try {
                if (isScreenShare) {
                    const sources = await window.concord?.getScreenSources?.();
                    if (cancelled || !mountedRef.current) return;
                    if (sources?.length > 0) {
                        setScreenSources(sources);
                        setShowSourcePicker(true);
                    } else {
                        setError('No screen sources available');
                    }
                } else {
                    const mediaStream = await startCameraCapture();
                    if (cancelled || !mountedRef.current) {
                        mediaStream.getTracks().forEach(t => t.stop());
                        return;
                    }
                    setStream(mediaStream);
                    cleanupRef.current = await createEncoder(mediaStream, false);
                }
            } catch (err: any) {
                if (mountedRef.current) setError(err?.message || 'Failed to capture video');
            }
        };

        const t = setTimeout(() => void start(), 100);
        return () => {
            cancelled = true;
            clearTimeout(t);
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [enabled, isScreenShare, startCameraCapture, createEncoder]);

    return {
        stream,
        error,
        showSourcePicker,
        screenSources,
        selectScreenSource,
        cancelSourcePicker,
        isHardwareAccelerated,
    };
}