import { useEffect, useRef, useCallback, useState } from 'react';
import { useDeviceStore } from './useDeviceStore';

interface VideoCaptureOptions {
    width?: number;
    height?: number;
    frameRate?: number;
}

interface EncoderConfig {
    config: VideoEncoderConfig;
    codecName: string;
    isHardware: boolean;
}

declare global {
    interface Window {
        concord: any;
    }
}

/**
 * Some TS/lib.dom versions don't include these newer WebCodecs-related types.
 * Keep them local + runtime-checked so builds don't fail.
 */
const HW_ACCELERATIONS = ['prefer-hardware', 'no-preference', 'prefer-software'] as const;
type HardwareAccelerationMode = (typeof HW_ACCELERATIONS)[number];

class HardwareEncoderDetector {
    static async findBestConfig(width: number, height: number, framerate: number): Promise<EncoderConfig> {
        const codecs = [
            { name: 'H.264 Baseline', codec: 'avc1.42001E' },
            { name: 'H.264 Main', codec: 'avc1.4D401F' },
            { name: 'VP8', codec: 'vp8' }
        ];

        const VideoEncoderCtor = (globalThis as any).VideoEncoder as typeof VideoEncoder | undefined;
        if (!VideoEncoderCtor?.isConfigSupported) {
            throw new Error('WebCodecs VideoEncoder is not available in this runtime');
        }

        for (const { name, codec } of codecs) {
            for (const acceleration of HW_ACCELERATIONS) {
                // Use `any` here because lib.dom typing for WebCodecs varies across TS versions.
                const config: any = {
                    codec,
                    width,
                    height,
                    bitrate: this.calculateBitrate(width, height, framerate),
                    framerate,
                    hardwareAcceleration: acceleration satisfies HardwareAccelerationMode,
                    latencyMode: 'realtime',
                    bitrateMode: 'constant',
                    ...(codec.startsWith('avc') ? { avc: { format: 'annexb' } } : {})
                };

                try {
                    const result = await (VideoEncoderCtor as any).isConfigSupported(config);
                    if (result?.supported && result?.config) {
                        console.log(`[VideoCapture] Using ${name} with ${acceleration}`);
                        return {
                            config: result.config as VideoEncoderConfig,
                            codecName: name,
                            isHardware: acceleration === 'prefer-hardware'
                        };
                    }
                } catch {
                    // try next config
                }
            }
        }

        throw new Error('No supported encoder configuration found');
    }

    static calculateBitrate(width: number, height: number, framerate: number): number {
        const pixels = width * height;
        const baseRate = pixels * framerate * 0.07;
        return Math.min(Math.max(baseRate, 500_000), 4_000_000);
    }
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
    const frameCountRef = useRef(0);
    const encoderRef = useRef<VideoEncoder | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const setupWebCodecsEncoder = useCallback(
        async (mediaStream: MediaStream): Promise<(() => void) | null> => {
            const VideoEncoderCtor = (globalThis as any).VideoEncoder as typeof VideoEncoder | undefined;
            if (!VideoEncoderCtor) {
                console.warn('[VideoCapture] WebCodecs VideoEncoder is not available in this runtime.');
                setError('WebCodecs VideoEncoder is not available');
                mediaStream.getTracks().forEach(t => t.stop());
                return null;
            }

            const track = mediaStream.getVideoTracks()[0];
            if (!track) {
                setError('No video track available');
                mediaStream.getTracks().forEach(t => t.stop());
                return null;
            }

            const settings = track.getSettings();
            const actualWidth = Math.min(settings.width || width, isScreenShare ? 1920 : 1280);
            const actualHeight = Math.min(settings.height || height, isScreenShare ? 1080 : 720);

            let encoderConfig: EncoderConfig;
            try {
                encoderConfig = await HardwareEncoderDetector.findBestConfig(
                    actualWidth,
                    actualHeight,
                    isScreenShare ? 15 : frameRate
                );
                setIsHardwareAccelerated(encoderConfig.isHardware);
            } catch (e: any) {
                console.error('[VideoCapture] No encoder available:', e);
                setError('No video encoder available');
                mediaStream.getTracks().forEach(t => t.stop());
                return null;
            }

            const encoder = new VideoEncoderCtor({
                output: (chunk: EncodedVideoChunk) => {
                    if (!mountedRef.current) return;

                    try {
                        const buffer = new ArrayBuffer(chunk.byteLength);
                        chunk.copyTo(buffer);

                        const isKeyframe = chunk.type === 'key';
                        window.concord?.sendVoiceVideo?.(buffer, isKeyframe)?.catch?.(() => {});
                    } catch (e) {
                        console.error('[VideoCapture] Failed to send encoded chunk:', e);
                    }
                },
                error: (e: DOMException) => {
                    console.error('[VideoCapture] Encoder error:', e);
                    if (mountedRef.current) setError(e.message);
                }
            });

            encoder.configure(encoderConfig.config);
            encoderRef.current = encoder;

            const ProcessorCtor = (globalThis as any).MediaStreamTrackProcessor as
                | (new (opts: { track: MediaStreamTrack }) => { readable: ReadableStream<any> })
                | undefined;

            if (!ProcessorCtor) {
                console.warn('[VideoCapture] MediaStreamTrackProcessor is not available in this runtime.');
                setError('MediaStreamTrackProcessor is not available');
                if (encoder.state !== 'closed') encoder.close();
                encoderRef.current = null;
                mediaStream.getTracks().forEach(t => t.stop());
                setStream(null);
                return null;
            }

            const processor = new ProcessorCtor({ track });
            const reader = processor.readable.getReader();

            let running = true;
            const keyframeInterval = 60;

            const processFrames = async () => {
                while (running && mountedRef.current) {
                    try {
                        const { value: frame, done } = await reader.read();
                        if (done || !frame) break;

                        try {
                            if (encoder.state === 'configured' && encoder.encodeQueueSize < 5) {
                                const isKeyframe = frameCountRef.current % keyframeInterval === 0;
                                encoder.encode(frame, { keyFrame: isKeyframe });
                                frameCountRef.current++;
                            }
                        } finally {
                            // WebCodecs VideoFrame-like objects typically need closing
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
                try {
                    if (encoder.state !== 'closed') encoder.close();
                } catch {
                    // ignore
                }

                encoderRef.current = null;
                mediaStream.getTracks().forEach(t => t.stop());
                if (mountedRef.current) setStream(null);
            };
        },
        [width, height, frameRate, isScreenShare]
    );

    const startCameraCapture = useCallback(async () => {
        const videoConstraints: MediaTrackConstraints = {
            width: { ideal: width, max: 1280 },
            height: { ideal: height, max: 720 },
            frameRate: { ideal: frameRate, max: 30 }
        };

        if (selectedVideo) {
            videoConstraints.deviceId = { exact: selectedVideo };
        }

        return navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false
        });
    }, [width, height, frameRate, selectedVideo]);

    const startScreenCapture = useCallback(async (sourceId: string) => {
        return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 15
                }
            } as any
        });
    }, []);

    const selectScreenSource = useCallback(
        async (sourceId: string) => {
            setShowSourcePicker(false);

            try {
                const mediaStream = await startScreenCapture(sourceId);

                if (!mountedRef.current) {
                    mediaStream.getTracks().forEach(t => t.stop());
                    return;
                }

                setStream(mediaStream);

                mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
                    if (mountedRef.current) setStream(null);
                });

                cleanupRef.current = await setupWebCodecsEncoder(mediaStream);
            } catch (err: any) {
                setError(err?.message || 'Failed to capture screen');
            }
        },
        [startScreenCapture, setupWebCodecsEncoder]
    );

    useEffect(() => {
        if (!enabled) {
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
            setStream(null);
            setError(null);
            setShowSourcePicker(false);
            frameCountRef.current = 0;
            return;
        }

        let cancelled = false;

        const startCapture = async () => {
            try {
                if (isScreenShare) {
                    const sources = await window.concord?.getScreenSources?.();
                    if (cancelled || !mountedRef.current) return;

                    if (sources && sources.length > 0) {
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
                    cleanupRef.current = await setupWebCodecsEncoder(mediaStream);
                }
            } catch (err: any) {
                if (mountedRef.current) setError(err?.message || 'Failed to capture video');
            }
        };

        const timeoutId = setTimeout(() => void startCapture(), 100);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            if (cleanupRef.current) {
                cleanupRef.current();
                cleanupRef.current = null;
            }
        };
    }, [enabled, isScreenShare, startCameraCapture, setupWebCodecsEncoder]);

    return {
        stream,
        error,
        showSourcePicker,
        screenSources,
        selectScreenSource,
        cancelSourcePicker: () => setShowSourcePicker(false),
        isHardwareAccelerated
    };
}
