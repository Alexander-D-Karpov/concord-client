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

function isH264Keyframe(data: Uint8Array): boolean {
    let i = 0;
    while (i < data.length - 4) {
        if (data[i] === 0 && data[i + 1] === 0) {
            let startCodeLen = 0;
            if (data[i + 2] === 1) {
                startCodeLen = 3;
            } else if (data[i + 2] === 0 && data[i + 3] === 1) {
                startCodeLen = 4;
            }

            if (startCodeLen > 0) {
                const nalHeader = data[i + startCodeLen];
                const nalType = nalHeader & 0x1f;

                if (nalType === 5) return true;
                if (nalType === 7) return true;

                i += startCodeLen + 1;
                continue;
            }
        }
        i++;
    }
    return false;
}

class HardwareEncoderDetector {
    static async probeHardwareSupport(width: number, height: number, framerate: number, isScreenShare: boolean): Promise<boolean> {
        const VideoEncoderCtor = (globalThis as any).VideoEncoder as typeof VideoEncoder | undefined;
        if (!VideoEncoderCtor?.isConfigSupported) return false;

        try {
            const result = await (VideoEncoderCtor as any).isConfigSupported({
                codec: 'avc1.42001f',
                width,
                height,
                bitrate: this.calculateBitrate(width, height, framerate, isScreenShare),
                framerate,
                hardwareAcceleration: 'prefer-hardware',
                latencyMode: 'realtime',
                avc: { format: 'annexb' },
            });
            return !!result?.supported;
        } catch {
            return false;
        }
    }

    static async findBestConfig(width: number, height: number, framerate: number, isScreenShare: boolean): Promise<EncoderConfig> {
        const VideoEncoderCtor = (globalThis as any).VideoEncoder as typeof VideoEncoder | undefined;
        if (!VideoEncoderCtor?.isConfigSupported) {
            throw new Error('WebCodecs VideoEncoder is not available in this runtime');
        }

        const hwAvailable = await this.probeHardwareSupport(width, height, framerate, isScreenShare);

        const codecs = [
            { name: 'H.264 Constrained Baseline L3.1', codec: 'avc1.42001f' },
            { name: 'H.264 Baseline L3.0', codec: 'avc1.42001E' },
            { name: 'VP8', codec: 'vp8' },
        ];

        for (const { name, codec } of codecs) {
            const config: any = {
                codec,
                width,
                height,
                bitrate: this.calculateBitrate(width, height, framerate, isScreenShare),
                framerate,
                hardwareAcceleration: 'no-preference',
                latencyMode: 'realtime',
                bitrateMode: 'variable',
                ...(codec.startsWith('avc') ? { avc: { format: 'annexb' } } : {}),
            };

            try {
                const result = await (VideoEncoderCtor as any).isConfigSupported(config);
                if (result?.supported && result?.config) {
                    console.log(`[VideoCapture] Using ${name} with no-preference (hw probe: ${hwAvailable}), bitrate: ${config.bitrate}`);
                    return {
                        config: result.config as VideoEncoderConfig,
                        codecName: name,
                        isHardware: hwAvailable,
                    };
                }
            } catch {}
        }

        throw new Error('No supported encoder configuration found');
    }

    static calculateBitrate(width: number, height: number, framerate: number, isScreenShare: boolean): number {
        const pixels = width * height;
        const baseBitsPerPixel = isScreenShare ? 0.05 : 0.06;
        const baseRate = pixels * framerate * baseBitsPerPixel;
        const minBitrate = isScreenShare ? 500_000 : 500_000;
        const maxBitrate = isScreenShare ? 2_000_000 : 2_500_000;
        return Math.min(Math.max(baseRate, minBitrate), maxBitrate);
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
    const sendingRef = useRef(false);
    const currentStreamRef = useRef<MediaStream | null>(null);
    const currentConfigRef = useRef<EncoderConfig | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const createAndConfigureEncoder = useCallback(
        async (
            mediaStream: MediaStream,
            encoderConfig: EncoderConfig,
            forceSoftware: boolean,
        ): Promise<{
            encoder: VideoEncoder;
            cleanup: () => void;
        } | null> => {
            const VideoEncoderCtor = (globalThis as any).VideoEncoder as typeof VideoEncoder | undefined;
            if (!VideoEncoderCtor) return null;

            const track = mediaStream.getVideoTracks()[0];
            if (!track || track.readyState === 'ended') return null;

            const settings = track.getSettings();
            const actualWidth = Math.min(settings.width || width, 1280);
            const actualHeight = Math.min(settings.height || height, 720);
            const actualFrameRate = isScreenShare ? 10 : frameRate;

            let configToUse = encoderConfig.config;
            if (forceSoftware) {
                const swConfig: any = {
                    ...configToUse,
                    hardwareAcceleration: 'prefer-software',
                };
                const VideoEnc = (globalThis as any).VideoEncoder;
                try {
                    const result = await VideoEnc.isConfigSupported(swConfig);
                    if (result?.supported && result?.config) {
                        configToUse = result.config;
                        console.log('[VideoCapture] Falling back to software encoder after HW crash');
                    }
                } catch {}
            }

            const isH264 = (configToUse as any).codec?.startsWith('avc');
            let packetCount = 0;
            let sentKeyframe = false;
            let lastKeyframeTime = 0;
            const KEYFRAME_INTERVAL_MS = isScreenShare ? 1500 : 2000;
            let forceNextKeyframe = true;
            let running = true;

            const encoder = new VideoEncoderCtor({
                output: (chunk: EncodedVideoChunk) => {
                    if (!mountedRef.current) return;

                    try {
                        const buffer = new ArrayBuffer(chunk.byteLength);
                        chunk.copyTo(buffer);
                        const data = new Uint8Array(buffer);

                        let isKeyframe = chunk.type === 'key';

                        if (isH264 && !isKeyframe) {
                            isKeyframe = isH264Keyframe(data);
                        }

                        if (isKeyframe) {
                            sentKeyframe = true;
                            lastKeyframeTime = Date.now();
                            forceNextKeyframe = false;
                            console.log(`[VideoCapture] Keyframe produced! packet #${packetCount + 1}, size=${chunk.byteLength}`);
                        }

                        packetCount++;
                        if (packetCount % 30 === 1) {
                            console.log(`[VideoCapture] Sending packet #${packetCount}, size=${chunk.byteLength}, keyframe=${isKeyframe}`);
                        }

                        const source = isScreenShare ? 'screen' : 'camera';
                        window.concord?.sendVoiceVideo?.(buffer, isKeyframe, source);
                    } catch (e) {
                        console.error('[VideoCapture] Failed to send encoded chunk:', e);
                    }
                },
                error: (e: DOMException) => {
                    console.error('[VideoCapture] Encoder error (will attempt recovery):', e);
                    if (!mountedRef.current) return;
                    running = false;
                    handleEncoderFailure();
                },
            });

            encoder.configure(configToUse);
            encoderRef.current = encoder;
            sendingRef.current = true;

            const ProcessorCtor = (globalThis as any).MediaStreamTrackProcessor as
                | (new (opts: { track: MediaStreamTrack }) => { readable: ReadableStream<any> })
                | undefined;

            if (!ProcessorCtor) {
                console.warn('[VideoCapture] MediaStreamTrackProcessor is not available');
                if (encoder.state !== 'closed') encoder.close();
                encoderRef.current = null;
                sendingRef.current = false;
                return null;
            }

            const processor = new ProcessorCtor({ track });
            const reader = processor.readable.getReader();

            let inputFrameCount = 0;

            const processFrames = async () => {
                while (running && mountedRef.current) {
                    try {
                        const { value: frame, done } = await reader.read();
                        if (done || !frame) break;

                        try {
                            if (encoder.state === 'configured' && encoder.encodeQueueSize <= 2) {
                                const now = Date.now();
                                const needKeyframe = forceNextKeyframe ||
                                    !sentKeyframe ||
                                    (now - lastKeyframeTime) > KEYFRAME_INTERVAL_MS;

                                if (needKeyframe && inputFrameCount > 0) {
                                    await encoder.flush();
                                }

                                encoder.encode(frame, { keyFrame: needKeyframe });

                                if (needKeyframe) forceNextKeyframe = false;

                                frameCountRef.current++;
                                inputFrameCount++;
                            } else if (encoder.encodeQueueSize > 2) {
                                // backpressure: drop frame
                            }
                        } finally {
                            if (typeof frame.close === 'function') frame.close();
                        }
                    } catch (e) {
                        console.error('[VideoCapture] Frame processing error:', e);
                        break;
                    }
                }
            };

            void processFrames();

            const cleanup = () => {
                running = false;
                sendingRef.current = false;
                reader.cancel().catch(() => {});
                try {
                    if (encoder.state !== 'closed') encoder.close();
                } catch {}
                encoderRef.current = null;
            };

            return { encoder, cleanup };
        },
        [width, height, frameRate, isScreenShare],
    );

    const handleEncoderFailure = useCallback(async () => {
        console.log('[VideoCapture] Handling encoder failure — creating new instance with SW fallback');

        if (encoderRef.current) {
            try {
                if (encoderRef.current.state !== 'closed') encoderRef.current.close();
            } catch {}
            encoderRef.current = null;
        }

        const mediaStream = currentStreamRef.current;
        const config = currentConfigRef.current;
        if (!mediaStream || !config || !mountedRef.current) return;

        const track = mediaStream.getVideoTracks()[0];
        if (!track || track.readyState === 'ended') return;

        const result = await createAndConfigureEncoder(mediaStream, config, true);
        if (result) {
            cleanupRef.current = () => {
                result.cleanup();
                mediaStream.getTracks().forEach(t => t.stop());
                if (mountedRef.current) setStream(null);
            };
        }
    }, [createAndConfigureEncoder]);

    const setupWebCodecsEncoder = useCallback(
        async (mediaStream: MediaStream): Promise<(() => void) | null> => {
            const VideoEncoderCtor = (globalThis as any).VideoEncoder as typeof VideoEncoder | undefined;
            if (!VideoEncoderCtor) {
                console.warn('[VideoCapture] WebCodecs VideoEncoder is not available');
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
            const actualWidth = Math.min(settings.width || width, 1280);
            const actualHeight = Math.min(settings.height || height, 720);
            const actualFrameRate = isScreenShare ? 10 : frameRate;

            console.log(`[VideoCapture] Setting up encoder: ${actualWidth}x${actualHeight}@${actualFrameRate}fps, screenShare=${isScreenShare}`);

            let encoderConfig: EncoderConfig;
            try {
                encoderConfig = await HardwareEncoderDetector.findBestConfig(
                    actualWidth,
                    actualHeight,
                    actualFrameRate,
                    isScreenShare,
                );
                setIsHardwareAccelerated(encoderConfig.isHardware);
                currentConfigRef.current = encoderConfig;
                currentStreamRef.current = mediaStream;
            } catch (e: any) {
                console.error('[VideoCapture] No encoder available:', e);
                setError('No video encoder available');
                mediaStream.getTracks().forEach(t => t.stop());
                return null;
            }

            const result = await createAndConfigureEncoder(mediaStream, encoderConfig, false);
            if (!result) {
                setError('Failed to create encoder');
                mediaStream.getTracks().forEach(t => t.stop());
                setStream(null);
                return null;
            }

            console.log('[VideoCapture] Encoder configured successfully');

            return () => {
                console.log('[VideoCapture] Cleaning up encoder');
                result.cleanup();
                currentStreamRef.current = null;
                currentConfigRef.current = null;
                mediaStream.getTracks().forEach(t => t.stop());
                if (mountedRef.current) setStream(null);
            };
        },
        [width, height, frameRate, isScreenShare, createAndConfigureEncoder],
    );

    const startCameraCapture = useCallback(async () => {
        const videoConstraints: MediaTrackConstraints = {
            width: { ideal: width, max: 1280 },
            height: { ideal: height, max: 720 },
            frameRate: { ideal: frameRate, max: 30 },
        };

        if (selectedVideo) {
            videoConstraints.deviceId = { exact: selectedVideo };
        }

        return navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
            audio: false,
        });
    }, [width, height, frameRate, selectedVideo]);

    const startScreenCapture = useCallback(async (sourceId: string) => {
        console.log('[VideoCapture] Starting screen capture with source:', sourceId);
        return navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sourceId,
                    maxWidth: 1280,
                    maxHeight: 720,
                    maxFrameRate: 10,
                },
            } as any,
        });
    }, []);

    const selectScreenSource = useCallback(
        async (sourceId: string) => {
            console.log('[VideoCapture] Screen source selected:', sourceId);
            setShowSourcePicker(false);

            try {
                const mediaStream = await startScreenCapture(sourceId);
                console.log('[VideoCapture] Got screen stream:', mediaStream.getVideoTracks()[0]?.getSettings());

                if (!mountedRef.current) {
                    mediaStream.getTracks().forEach(t => t.stop());
                    return;
                }

                setStream(mediaStream);

                mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
                    console.log('[VideoCapture] Screen share track ended');
                    if (mountedRef.current) setStream(null);
                });

                cleanupRef.current = await setupWebCodecsEncoder(mediaStream);
            } catch (err: any) {
                console.error('[VideoCapture] Screen capture failed:', err);
                setError(err?.message || 'Failed to capture screen');
            }
        },
        [startScreenCapture, setupWebCodecsEncoder],
    );

    const cancelSourcePicker = useCallback(() => {
        console.log('[VideoCapture] Source picker cancelled');
        setShowSourcePicker(false);
    }, []);

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
            currentStreamRef.current = null;
            currentConfigRef.current = null;
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
                console.error('[VideoCapture] Capture failed:', err);
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
        cancelSourcePicker,
        isHardwareAccelerated,
    };
}