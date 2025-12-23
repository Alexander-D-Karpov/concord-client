import { useEffect, useRef, useState, useCallback } from 'react';
import { useDeviceStore } from './useDeviceStore';

declare global {
    interface Window {
        concord: any;
    }
}

const OPUS_FRAME_SIZE = 960; // 20ms @ 48kHz
const SAMPLE_RATE = 48000;
const FRAME_DURATION_MS = 20;

const VAD_THRESHOLD_BASE = 0.01;
const VAD_SPEECH_FRAMES = 3;
const VAD_SILENCE_FRAMES = 15;

export function useAudioCapture(enabled: boolean) {
    const { selectedAudioInput } = useDeviceStore();

    const [isSpeaking, setIsSpeaking] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [audioLevel, setAudioLevel] = useState(0);

    const cleanupRef = useRef<(() => void) | null>(null);
    const mountedRef = useRef(true);

    const speechFrameCountRef = useRef(0);
    const silenceFrameCountRef = useRef(0);
    const speakingRef = useRef(false);
    const lastSpeakingNotifyRef = useRef(0);

    const audioContextRef = useRef<AudioContext | null>(null);
    const workletNodeRef = useRef<AudioWorkletNode | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const safeSetIsSpeaking = (v: boolean) => {
        if (mountedRef.current) setIsSpeaking(v);
    };
    const safeSetError = (v: string | null) => {
        if (mountedRef.current) setError(v);
    };
    const safeSetAudioLevel = (v: number) => {
        if (mountedRef.current) setAudioLevel(v);
    };

    const startCapture = useCallback(async () => {
        let stream: MediaStream | null = null;
        let encoder: AudioEncoder | null = null;
        let context: AudioContext | null = null;

        let source: MediaStreamAudioSourceNode | null = null;
        let workletNode: AudioWorkletNode | null = null;
        let gainNode: GainNode | null = null;

        const stopAll = () => {
            try {
                workletNode?.port && (workletNode.port.onmessage = null);
            } catch {}

            try {
                workletNode?.disconnect();
            } catch {}
            try {
                source?.disconnect();
            } catch {}
            try {
                gainNode?.disconnect();
            } catch {}

            try {
                if (encoder && encoder.state !== 'closed') encoder.close();
            } catch {}

            try {
                if (context && context.state !== 'closed') context.close().catch(() => {});
            } catch {}

            try {
                stream?.getTracks().forEach((t) => t.stop());
            } catch {}

            // Reset local state/refs
            speakingRef.current = false;
            speechFrameCountRef.current = 0;
            silenceFrameCountRef.current = 0;
            lastSpeakingNotifyRef.current = 0;

            safeSetIsSpeaking(false);
            safeSetAudioLevel(0);
        };

        try {
            safeSetError(null);

            const constraints: MediaStreamConstraints = {
                audio: {
                    deviceId: selectedAudioInput ? { exact: selectedAudioInput } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: SAMPLE_RATE,
                    channelCount: 1,
                },
                video: false,
            };

            stream = await navigator.mediaDevices.getUserMedia(constraints);

            if (!mountedRef.current) {
                stream.getTracks().forEach((t) => t.stop());
                return null;
            }

            context = new AudioContext({ sampleRate: SAMPLE_RATE });
            audioContextRef.current = context;

            if (context.state === 'suspended') {
                await context.resume();
            }

            const AudioEncoderClass = (globalThis as any).AudioEncoder as
                | (new (init: AudioEncoderInit) => AudioEncoder) & {
                isConfigSupported: (config: AudioEncoderConfig) => Promise<AudioEncoderSupport>;
            }
                | undefined;

            if (!AudioEncoderClass) {
                throw new Error('AudioEncoder not available');
            }

            encoder = new AudioEncoderClass({
                output: (chunk: EncodedAudioChunk) => {
                    if (!mountedRef.current) return;
                    const buffer = new ArrayBuffer(chunk.byteLength);
                    chunk.copyTo(buffer);
                    window.concord?.sendVoiceAudio?.(buffer).catch(() => {});
                },
                error: (e: DOMException) => {
                    console.error('[AudioCapture] Encoder error:', e);
                },
            });

            const opusConfig: AudioEncoderConfig = {
                codec: 'opus',
                sampleRate: SAMPLE_RATE,
                numberOfChannels: 1,
                bitrate: 64000,
                opus: {
                    frameDuration: FRAME_DURATION_MS * 1000, // microseconds
                    complexity: 5,
                    useinbandfec: true,
                    usedtx: false,
                } as any,
            };

            const support = await AudioEncoderClass.isConfigSupported(opusConfig);
            if (!support.supported) {
                throw new Error('Opus codec not supported');
            }

            encoder.configure(support.config || opusConfig);

            // Define notifySpeaking BEFORE audio starts to avoid TDZ issues.
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

                // Copy frame and transfer its ArrayBuffer to reduce main-thread cloning.
                const frame = new Float32Array(this.buffer);
                this.port.postMessage(
                  { type: 'audio', samplesBuffer: frame.buffer, rms },
                  [frame.buffer]
                );

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
            try {
                await context.audioWorklet.addModule(url);
            } finally {
                URL.revokeObjectURL(url);
            }

            source = context.createMediaStreamSource(stream);
            workletNode = new AudioWorkletNode(context, 'voice-processor');
            workletNodeRef.current = workletNode;

            // Mute output (some browsers need a destination connection for processing to run).
            gainNode = context.createGain();
            gainNode.gain.value = 0;

            let frameTimestamp = 0;

            workletNode.port.onmessage = (event) => {
                if (!mountedRef.current || !encoder || encoder.state !== 'configured') return;

                const { samplesBuffer, rms } = event.data || {};
                if (!(samplesBuffer instanceof ArrayBuffer) || typeof rms !== 'number') return;

                // UI-ish level (0..100)
                const normalizedLevel = Math.min(100, Math.round(rms * 500));
                safeSetAudioLevel(normalizedLevel);

                // Live sensitivity from store (no need to restart capture on changes)
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
                        timestamp: frameTimestamp, // microseconds
                        data: samples,
                    });

                    encoder.encode(audioData);
                    audioData.close();

                    frameTimestamp += FRAME_DURATION_MS * 1000; // microseconds
                }
            };

            source.connect(workletNode);
            workletNode.connect(gainNode);
            gainNode.connect(context.destination);

            return () => {
                if (speakingRef.current) {
                    window.concord?.setVoiceSpeaking?.(false).catch(() => {});
                }
                stopAll();
            };
        } catch (err: any) {
            console.error('[AudioCapture] Setup failed:', err);
            stopAll();
            safeSetError(err?.message || 'Failed to access microphone');
            return null;
        }
    }, [selectedAudioInput]);

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
        }, 100);

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
            cleanupRef.current?.();
            cleanupRef.current = null;
        };
    }, [enabled, startCapture]);

    return { isSpeaking, error, audioLevel };
}
