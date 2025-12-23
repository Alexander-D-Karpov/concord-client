import { useEffect, useRef } from "react";

interface AudioPacket {
    ssrc: number;
    sequence: number;
    timestamp: number;
    pts: number;
    data: number[] | Uint8Array;
}

const WORKLET_CODE = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(48000 * 4);
    this.writePos = 0;
    this.readPos = 0;
    this.bufferedSamples = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'samples') {
        const samples = e.data.samples;
        for (let i = 0; i < samples.length; i++) {
          this.buffer[this.writePos] = samples[i];
          this.writePos = (this.writePos + 1) % this.buffer.length;
        }
        this.bufferedSamples = Math.min(this.bufferedSamples + samples.length, this.buffer.length);
      } else if (e.data.type === 'clear') {
        this.bufferedSamples = 0;
        this.writePos = 0;
        this.readPos = 0;
      }
    };
  }

  process(inputs, outputs) {
    const output = outputs[0][0];
    if (!output) return true;

    for (let i = 0; i < output.length; i++) {
      if (this.bufferedSamples > 0) {
        output[i] = this.buffer[this.readPos];
        this.readPos = (this.readPos + 1) % this.buffer.length;
        this.bufferedSamples--;
      } else {
        output[i] = 0;
      }
    }
    return true;
  }
}
registerProcessor('playback-processor', PlaybackProcessor);
`;

declare global {
    interface Window {
        concord: any;
    }
}

interface DecoderState {
    decoder: AudioDecoder;
    configured: boolean;
}

export function useAudioPlayback(enabled: boolean, deafened: boolean) {
    const contextRef = useRef<AudioContext | null>(null);
    const workletRef = useRef<AudioWorkletNode | null>(null);
    const decodersRef = useRef<Map<number, DecoderState>>(new Map());
    const initializedRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        if (!enabled || deafened) {
            for (const state of decodersRef.current.values()) {
                if (state.decoder.state !== 'closed') {
                    try { state.decoder.close(); } catch {}
                }
            }
            decodersRef.current.clear();

            if (workletRef.current) {
                workletRef.current.port.postMessage({ type: "clear" });
                workletRef.current.disconnect();
                workletRef.current = null;
            }

            if (contextRef.current && contextRef.current.state !== "closed") {
                contextRef.current.close().catch(() => {});
                contextRef.current = null;
            }

            initializedRef.current = false;
            return;
        }

        if (initializedRef.current) return;

        let cancelled = false;

        const setup = async () => {
            try {
                const context = new AudioContext({ sampleRate: 48000 });
                contextRef.current = context;

                if (context.state === "suspended") {
                    await context.resume();
                }

                const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
                const url = URL.createObjectURL(blob);
                await context.audioWorklet.addModule(url);
                URL.revokeObjectURL(url);

                if (cancelled || !mountedRef.current) {
                    await context.close().catch(() => {});
                    return;
                }

                const worklet = new AudioWorkletNode(context, "playback-processor");
                workletRef.current = worklet;
                worklet.connect(context.destination);

                initializedRef.current = true;
                console.log('[AudioPlayback] Initialized with WebCodecs');
            } catch (err) {
                console.error('[AudioPlayback] Setup failed:', err);
            }
        };

        setup();

        const getOrCreateDecoder = (ssrc: number): DecoderState | null => {
            let state = decodersRef.current.get(ssrc);
            if (state && state.decoder.state !== 'closed') return state;

            const AudioDecoderCtor = (globalThis as any).AudioDecoder;
            if (!AudioDecoderCtor) {
                console.warn('[AudioPlayback] WebCodecs AudioDecoder not available');
                return null;
            }

            try {
                const decoder = new AudioDecoderCtor({
                    output: (audioData: AudioData) => {
                        if (!mountedRef.current || !workletRef.current) {
                            audioData.close();
                            return;
                        }

                        try {
                            const numFrames = audioData.numberOfFrames;
                            const numChannels = audioData.numberOfChannels;
                            const samples = new Float32Array(numFrames);

                            audioData.copyTo(samples, { planeIndex: 0 });
                            workletRef.current.port.postMessage({ type: 'samples', samples });
                        } finally {
                            audioData.close();
                        }
                    },
                    error: (e: DOMException) => {
                        console.error(`[AudioPlayback] Decoder error for SSRC ${ssrc}:`, e.message);
                        decodersRef.current.delete(ssrc);
                    }
                });

                state = { decoder, configured: false };
                decodersRef.current.set(ssrc, state);
                return state;
            } catch (e) {
                console.error('[AudioPlayback] Failed to create decoder:', e);
                return null;
            }
        };

        const configureDecoder = async (state: DecoderState): Promise<boolean> => {
            if (state.configured && state.decoder.state === 'configured') return true;

            const config = {
                codec: 'opus',
                sampleRate: 48000,
                numberOfChannels: 1,
            };

            try {
                const AudioDecoderCtor = (globalThis as any).AudioDecoder;
                const support = await AudioDecoderCtor.isConfigSupported(config);

                if (support?.supported) {
                    state.decoder.configure(support.config || config);
                    state.configured = true;
                    console.log('[AudioPlayback] Opus decoder configured successfully');
                    return true;
                } else {
                    console.error('[AudioPlayback] Opus not supported');
                    return false;
                }
            } catch (e) {
                console.error('[AudioPlayback] Failed to configure decoder:', e);
                return false;
            }
        };

        const handleAudio = async (packet: AudioPacket) => {
            if (!mountedRef.current || !initializedRef.current) return;

            const raw = packet.data;
            let u8: Uint8Array;

            if (Array.isArray(raw)) {
                u8 = new Uint8Array(raw);
            } else if (raw instanceof Uint8Array) {
                u8 = raw;
            } else if (raw && typeof raw === 'object' && 'buffer' in raw) {
                u8 = new Uint8Array(raw as ArrayBuffer);
            } else {
                return;
            }

            if (u8.length === 0) return;

            const ssrc = packet.ssrc >>> 0;

            const EncodedAudioChunkCtor = (globalThis as any).EncodedAudioChunk;
            if (!EncodedAudioChunkCtor) {
                console.warn('[AudioPlayback] EncodedAudioChunk not available - cannot decode Opus');
                return;
            }

            const state = getOrCreateDecoder(ssrc);
            if (!state) return;

            if (!state.configured) {
                const ok = await configureDecoder(state);
                if (!ok) return;
            }

            if (state.decoder.state !== 'configured') return;

            try {
                const chunk = new EncodedAudioChunkCtor({
                    type: 'key',
                    timestamp: (packet.timestamp || 0) * 1000,
                    data: u8,
                });

                if (state.decoder.decodeQueueSize < 20) {
                    state.decoder.decode(chunk);
                }
            } catch (e) {
                console.error('[AudioPlayback] Failed to decode chunk:', e);
            }
        };

        const handleParticipantLeft = (ev: any) => {
            const ssrc = (ev?.ssrc ?? ev?.audio_ssrc ?? 0) >>> 0;
            const videoSsrc = (ev?.videoSsrc ?? ev?.video_ssrc ?? 0) >>> 0;

            [ssrc, videoSsrc].forEach(s => {
                if (s) {
                    const state = decodersRef.current.get(s);
                    if (state && state.decoder.state !== 'closed') {
                        try { state.decoder.close(); } catch {}
                    }
                    decodersRef.current.delete(s);
                }
            });
        };

        const unsubAudio = window.concord.onVoiceAudio?.(handleAudio);
        const unsubLeft = window.concord.onVoiceParticipantLeft?.(handleParticipantLeft);

        return () => {
            cancelled = true;
            unsubAudio?.();
            unsubLeft?.();

            for (const state of decodersRef.current.values()) {
                if (state.decoder.state !== 'closed') {
                    try { state.decoder.close(); } catch {}
                }
            }
            decodersRef.current.clear();

            if (workletRef.current) {
                workletRef.current.port.postMessage({ type: "clear" });
                workletRef.current.disconnect();
                workletRef.current = null;
            }

            if (contextRef.current && contextRef.current.state !== "closed") {
                contextRef.current.close().catch(() => {});
                contextRef.current = null;
            }

            initializedRef.current = false;
        };
    }, [enabled, deafened]);

    return {};
}