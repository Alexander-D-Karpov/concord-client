import { useEffect, useRef, useState, useCallback } from 'react';
import { useDeviceStore } from './useDeviceStore';

declare global {
    interface Window {
        concord: any;
    }
}

const OPUS_FRAME_SIZE = 960;
const SAMPLE_RATE = 48000;
const FRAME_DURATION_MS = 20;
const FRAME_DURATION_US = FRAME_DURATION_MS * 1000;
const VAD_THRESHOLD_BASE = 0.01;
const VAD_SPEECH_FRAMES = 3;
const VAD_SILENCE_FRAMES = 15;

export function useAudioCapture(enabled: boolean) {
    const { selectedAudioInput, noiseSuppression, echoCancellation, autoGainControl } = useDeviceStore();
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);

    const cleanupRef = useRef<(() => void) | null>(null);
    const mountedRef = useRef(true);
    const speechFrameCountRef = useRef(0);
    const silenceFrameCountRef = useRef(0);
    const speakingRef = useRef(false);
    const lastSpeakingNotifyRef = useRef(0);
    const captureLockRef = useRef(false);

    const deviceInputRef = useRef(selectedAudioInput);
    const noiseSupRef = useRef(noiseSuppression);
    const echoCancelRef = useRef(echoCancellation);
    const autoGainRef = useRef(autoGainControl);

    useEffect(() => { deviceInputRef.current = selectedAudioInput; }, [selectedAudioInput]);
    useEffect(() => { noiseSupRef.current = noiseSuppression; }, [noiseSuppression]);
    useEffect(() => { echoCancelRef.current = echoCancellation; }, [echoCancellation]);
    useEffect(() => { autoGainRef.current = autoGainControl; }, [autoGainControl]);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    const safeSetIsSpeaking = (v: boolean) => { if (mountedRef.current) setIsSpeaking(v); };
    const safeSetError = (v: string | null) => { if (mountedRef.current) setError(v); };
    const safeSetAudioLevel = (v: number) => { if (mountedRef.current) setAudioLevel(v); };

    const acquireWithRetry = async (constraints: MediaStreamConstraints, retries = 2): Promise<MediaStream> => {
        for (let attempt = 0; attempt <= retries; attempt++) {
            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err: any) {
                if (err?.name === 'AbortError' && attempt < retries) {
                    await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
                    if (!mountedRef.current) throw err;
                    continue;
                }
                throw err;
            }
        }
        throw new Error('Failed to acquire media');
    };

    const acquireAudioStream = async (): Promise<MediaStream> => {
        const currentDevice = deviceInputRef.current;
        const currentNoise = noiseSupRef.current;
        const currentEcho = echoCancelRef.current;
        const currentGain = autoGainRef.current;

        const exactDevice = currentDevice && currentDevice !== 'default'
            ? { exact: currentDevice }
            : undefined;

        const baseConstraints: MediaTrackConstraints = {
            echoCancellation: !!currentEcho,
            noiseSuppression: !!currentNoise,
            autoGainControl: !!currentGain,
            channelCount: 1,
        };

        const attempts = [
            { audio: { ...baseConstraints, deviceId: exactDevice, sampleRate: SAMPLE_RATE } },
            { audio: { ...baseConstraints, deviceId: exactDevice } },
            { audio: { ...baseConstraints } },
            { audio: true },
        ];

        for (let round = 0; round < 3; round++) {
            for (const constraints of attempts) {
                if (!mountedRef.current) throw new Error('unmounted');
                try {
                    return await navigator.mediaDevices.getUserMedia({
                        ...constraints,
                        video: false,
                    } as MediaStreamConstraints);
                } catch (err: any) {
                    const isRetryable = err?.name === 'AbortError'
                        || err?.name === 'NotReadableError';
                    const isConstraintIssue = err?.name === 'OverconstrainedError'
                        || err?.name === 'NotFoundError';

                    if (isConstraintIssue) continue;

                    if (isRetryable && round < 2) {
                        await new Promise(r => setTimeout(r, 500 * (round + 1)));
                        break;
                    }

                    if (!isRetryable) throw err;
                }
            }
        }

        throw new Error('Failed to acquire microphone after retries');
    };

    const startCapture = useCallback(async () => {
        if (captureLockRef.current) return null;
        captureLockRef.current = true;

        let stream: MediaStream | null = null;
        let encoder: AudioEncoder | null = null;
        let context: AudioContext | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let workletNode: AudioWorkletNode | null = null;
        let gainNode: GainNode | null = null;

        const stopAll = () => {
            captureLockRef.current = false;
            try { workletNode?.port && (workletNode.port.onmessage = null); } catch {}
            try { workletNode?.disconnect(); } catch {}
            try { source?.disconnect(); } catch {}
            try { gainNode?.disconnect(); } catch {}
            try { if (encoder && encoder.state !== 'closed') encoder.close(); } catch {}
            try { if (context && context.state !== 'closed') context.close().catch(() => {}); } catch {}
            try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
            speakingRef.current = false;
            speechFrameCountRef.current = 0;
            silenceFrameCountRef.current = 0;
            lastSpeakingNotifyRef.current = 0;
            safeSetIsSpeaking(false);
            safeSetAudioLevel(0);
        };

        try {
            safeSetError(null);
            stream = await acquireAudioStream();

            if (!mountedRef.current) {
                stream.getTracks().forEach((t) => t.stop());
                captureLockRef.current = false;
                return null;
            }

            const currentDevice = deviceInputRef.current;
            const currentNoise = noiseSupRef.current;
            const currentEcho = echoCancelRef.current;
            const currentGain = autoGainRef.current;

            const exactDevice = currentDevice && currentDevice !== 'default' ? { exact: currentDevice } : undefined;
            const baseAudioConstraints: MediaTrackConstraints = {
                echoCancellation: !!currentEcho,
                noiseSuppression: !!currentNoise,
                autoGainControl: !!currentGain,
                sampleRate: SAMPLE_RATE,
                channelCount: 1,
            };

            try {
                stream = await acquireWithRetry({
                    audio: { ...baseAudioConstraints, deviceId: exactDevice },
                    video: false,
                });
            } catch (deviceError: any) {
                const shouldFallbackToDefault = !!exactDevice && (deviceError?.name === 'OverconstrainedError' || deviceError?.name === 'NotFoundError');
                if (!shouldFallbackToDefault) throw deviceError;
                stream = await acquireWithRetry({ audio: baseAudioConstraints, video: false });
            }

            if (!mountedRef.current) {
                stream.getTracks().forEach((t) => t.stop());
                captureLockRef.current = false;
                return null;
            }

            context = new AudioContext({ sampleRate: SAMPLE_RATE, latencyHint: 'interactive' });
            if (context.state === 'suspended') await context.resume();

            const AudioEncoderClass = (globalThis as any).AudioEncoder as (new (init: AudioEncoderInit) => AudioEncoder) | undefined;
            if (!AudioEncoderClass || typeof (AudioEncoderClass as any).isConfigSupported !== 'function') {
                throw new Error('AudioEncoder not available in this runtime');
            }

            encoder = new AudioEncoderClass({
                output: (chunk: EncodedAudioChunk) => {
                    if (!mountedRef.current) return;
                    const buffer = new ArrayBuffer(chunk.byteLength);
                    chunk.copyTo(buffer);
                    window.concord?.sendVoiceAudio?.(buffer).catch(() => {});
                },
                error: (e: DOMException) => console.error('[AudioCapture] Encoder error:', e),
            });

            const candidateConfigs: AudioEncoderConfig[] = [
                {
                    codec: 'opus',
                    sampleRate: SAMPLE_RATE,
                    numberOfChannels: 1,
                    bitrate: 64000,
                    opus: { frameDuration: FRAME_DURATION_MS * 1000, complexity: 5, useinbandfec: true, usedtx: false } as any,
                },
                { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 64000 },
                { codec: 'opus', sampleRate: SAMPLE_RATE, numberOfChannels: 1, bitrate: 32000 },
            ];

            let supportedConfig: AudioEncoderConfig | null = null;
            for (const config of candidateConfigs) {
                const support = await (AudioEncoderClass as any).isConfigSupported(config);
                if (support?.supported) {
                    supportedConfig = support.config || config;
                    break;
                }
            }
            if (!supportedConfig) throw new Error('Opus codec not supported by this runtime');
            encoder.configure(supportedConfig);

            const notifySpeaking = (speaking: boolean) => {
                const now = Date.now();
                if (now - lastSpeakingNotifyRef.current > 50) {
                    lastSpeakingNotifyRef.current = now;
                    window.concord?.setVoiceSpeaking?.(speaking).catch(() => {});
                }
            };

            const workletCode = `
                class VoiceProcessor extends AudioWorkletProcessor {
                  constructor() {
                    super();
                    this.buffer = new Float32Array(${OPUS_FRAME_SIZE});
                    this.bufferIndex = 0;
                  }
                  process(inputs) {
                    const input = inputs[0];
                    if (!input || !input[0]) return true;
                    const samples = input[0];
                    for (let i = 0; i < samples.length; i++) {
                      this.buffer[this.bufferIndex++] = samples[i];
                      if (this.bufferIndex >= ${OPUS_FRAME_SIZE}) {
                        let sum = 0;
                        for (let j = 0; j < ${OPUS_FRAME_SIZE}; j++) {
                          const v = this.buffer[j];
                          sum += v * v;
                        }
                        const rms = Math.sqrt(sum / ${OPUS_FRAME_SIZE});
                        const frame = new Float32Array(this.buffer);
                        this.port.postMessage({ type: 'audio', samplesBuffer: frame.buffer, rms }, [frame.buffer]);
                        this.bufferIndex = 0;
                      }
                    }
                    return true;
                  }
                }
                registerProcessor('voice-processor', VoiceProcessor);
            `;

            const blob = new Blob([workletCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            try { await context.audioWorklet.addModule(url); } finally { URL.revokeObjectURL(url); }

            source = context.createMediaStreamSource(stream);
            workletNode = new AudioWorkletNode(context, 'voice-processor');
            gainNode = context.createGain();
            gainNode.gain.value = 0;

            let frameTimestamp = 0;
            workletNode.port.onmessage = (event) => {
                if (!mountedRef.current || !encoder || encoder.state !== 'configured') return;
                const { samplesBuffer, rms } = event.data || {};
                if (!(samplesBuffer instanceof ArrayBuffer) || typeof rms !== 'number') return;
                safeSetAudioLevel(Math.min(100, Math.round(rms * 500)));

                const rawSensitivity = useDeviceStore.getState().micSensitivity;
                const sensitivity = Math.max(0, Math.min(100, rawSensitivity));
                const threshold = Math.max(0.000001, VAD_THRESHOLD_BASE * (1 - sensitivity / 100));
                const isSpeakingNow = rms > threshold;
                if (isSpeakingNow) {
                    speechFrameCountRef.current++;
                    silenceFrameCountRef.current = 0;
                    if (!speakingRef.current && speechFrameCountRef.current >= VAD_SPEECH_FRAMES) {
                        speakingRef.current = true;
                        safeSetIsSpeaking(true);
                        notifySpeaking(true);
                    }
                } else {
                    silenceFrameCountRef.current++;
                    speechFrameCountRef.current = 0;
                    if (speakingRef.current && silenceFrameCountRef.current >= VAD_SILENCE_FRAMES) {
                        speakingRef.current = false;
                        safeSetIsSpeaking(false);
                        notifySpeaking(false);
                    }
                }

                if (encoder.encodeQueueSize < 10) {
                    const samples = new Float32Array(samplesBuffer);
                    const audioData = new AudioData({
                        format: 'f32-planar',
                        sampleRate: SAMPLE_RATE,
                        numberOfFrames: OPUS_FRAME_SIZE,
                        numberOfChannels: 1,
                        timestamp: frameTimestamp,
                        data: samples,
                    });
                    encoder.encode(audioData);
                    audioData.close();
                    frameTimestamp += FRAME_DURATION_US;
                }
            };

            source.connect(workletNode);
            workletNode.connect(gainNode);
            gainNode.connect(context.destination);

            return () => {
                if (speakingRef.current) window.concord?.setVoiceSpeaking?.(false).catch(() => {});
                stopAll();
            };
        } catch (err: any) {
            console.error('[AudioCapture] Setup failed:', err);
            stopAll();
            safeSetError(err?.message || 'Failed to access microphone');
            return null;
        }
    }, []);

    useEffect(() => {
        if (!enabled) {
            cleanupRef.current?.();
            cleanupRef.current = null;
            safeSetIsSpeaking(false);
            safeSetAudioLevel(0);
            safeSetError(null);
            return;
        }

        let cancelled = false;
        const timeoutId = window.setTimeout(() => {
            if (cancelled) return;
            startCapture().then((cleanup) => {
                if (cancelled) {
                    cleanup?.();
                    return;
                }
                cleanupRef.current = cleanup;
            });
        }, 200);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [enabled, startCapture]);

    return { isSpeaking, error, audioLevel };
}