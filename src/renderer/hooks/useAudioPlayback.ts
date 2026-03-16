import { useEffect, useRef } from "react";

interface AudioPacket {
    ssrc: number;
    sequence: number;
    timestamp: number;
    pts: number;
    data: number[] | ArrayBuffer | ArrayBufferView;
}

declare global {
    interface Window {
        concord: any;
        __concordAudioClock?: Record<number, { pts: number; wallMs: number }>;
    }
}

const SAMPLE_RATE = 48000;
const FRAME_DURATION_MS = 20;
const FRAME_DURATION_US = FRAME_DURATION_MS * 1000;
const STREAM_BUFFER_SECONDS = 4;
const STREAM_BUFFER_SIZE = SAMPLE_RATE * STREAM_BUFFER_SECONDS;
const PREBUFFER_SAMPLES = 960; // 20ms @ 48kHz
const MAX_DECODE_QUEUE = 32;
const WORKLET_NAME = "playback-processor";

const WORKLET_CODE = `
class PlaybackProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.streamBufferSize = ${STREAM_BUFFER_SIZE};
    this.prebufferThreshold = ${PREBUFFER_SAMPLES};
    this.streams = new Map();
    this.renderCount = 0;
    this.staleRenderLimit = Math.ceil(sampleRate * 3 / 128); // ~3 seconds

    this.port.onmessage = (event) => {
      const data = event.data || {};

      if (data.type === "samples") {
        const ssrc = (data.ssrc >>> 0) || 0;
        const samplesBuffer = data.samplesBuffer;

        if (!ssrc || !(samplesBuffer instanceof ArrayBuffer)) return;

        let stream = this.streams.get(ssrc);
        if (!stream) {
          stream = {
            buffer: new Float32Array(this.streamBufferSize),
            writePos: 0,
            readPos: 0,
            buffered: 0,
            prebuffering: true,
            lastTouchedRender: this.renderCount,
          };
          this.streams.set(ssrc, stream);
        }

        const samples = new Float32Array(samplesBuffer);
        const len = samples.length;

        if (len >= this.streamBufferSize) {
          const start = len - this.streamBufferSize;
          for (let i = 0; i < this.streamBufferSize; i++) {
            stream.buffer[i] = samples[start + i];
          }
          stream.readPos = 0;
          stream.writePos = 0;
          stream.buffered = this.streamBufferSize;
          stream.prebuffering = false;
          stream.lastTouchedRender = this.renderCount;
          return;
        }

        const overflow = Math.max(0, stream.buffered + len - this.streamBufferSize);
        if (overflow > 0) {
          stream.readPos = (stream.readPos + overflow) % this.streamBufferSize;
          stream.buffered -= overflow;
        }

        for (let i = 0; i < len; i++) {
          stream.buffer[stream.writePos] = samples[i];
          stream.writePos = (stream.writePos + 1) % this.streamBufferSize;
        }

        stream.buffered += len;
        stream.lastTouchedRender = this.renderCount;
      } else if (data.type === "remove-stream") {
        const ssrc = (data.ssrc >>> 0) || 0;
        if (ssrc) {
          this.streams.delete(ssrc);
        }
      } else if (data.type === "clear") {
        this.streams.clear();
      }
    };
  }

  process(_inputs, outputs) {
    const output = outputs[0]?.[0];
    if (!output) return true;

    output.fill(0);
    this.renderCount++;

    let activeStreams = 0;
    const toDelete = [];

    for (const [ssrc, stream] of this.streams.entries()) {
      if (stream.prebuffering) {
        if (stream.buffered < this.prebufferThreshold) {
          if (stream.buffered === 0 && (this.renderCount - stream.lastTouchedRender) > this.staleRenderLimit) {
            toDelete.push(ssrc);
          }
          continue;
        }
        stream.prebuffering = false;
      }

      let contributed = false;

      for (let i = 0; i < output.length; i++) {
        if (stream.buffered <= 0) break;

        output[i] += stream.buffer[stream.readPos];
        stream.readPos = (stream.readPos + 1) % this.streamBufferSize;
        stream.buffered--;
        contributed = true;
      }

      if (contributed) {
        activeStreams++;
      }

      if (stream.buffered === 0) {
        stream.prebuffering = true;
        if ((this.renderCount - stream.lastTouchedRender) > this.staleRenderLimit) {
          toDelete.push(ssrc);
        }
      }
    }

    for (const ssrc of toDelete) {
      this.streams.delete(ssrc);
    }

    if (activeStreams > 1) {
      const gain = 1 / Math.sqrt(activeStreams);
      for (let i = 0; i < output.length; i++) {
        output[i] *= gain;
      }
    }

    for (let i = 0; i < output.length; i++) {
      if (output[i] > 1) output[i] = 1;
      else if (output[i] < -1) output[i] = -1;
    }

    return true;
  }
}

registerProcessor("${WORKLET_NAME}", PlaybackProcessor);
`;

interface DecoderState {
    decoder: AudioDecoder;
    configured: boolean;
    configuring: Promise<boolean> | null;
    nextTimestampUs: number;
}

function normalizePacketData(raw: AudioPacket["data"]): Uint8Array | null {
    if (Array.isArray(raw)) {
        return new Uint8Array(raw);
    }

    if (raw instanceof Uint8Array) {
        return raw;
    }

    if (raw instanceof ArrayBuffer) {
        return new Uint8Array(raw);
    }

    if (ArrayBuffer.isView(raw)) {
        return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    }

    return null;
}

export function useAudioPlayback(enabled: boolean, deafened: boolean) {
    const contextRef = useRef<AudioContext | null>(null);
    const workletRef = useRef<AudioWorkletNode | null>(null);
    const decodersRef = useRef<Map<number, DecoderState>>(new Map());
    const initializedRef = useRef(false);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    useEffect(() => {
        const closeAllDecoders = () => {
            for (const [ssrc, state] of decodersRef.current) {
                try {
                    if (state.decoder.state !== "closed") {
                        state.decoder.close();
                    }
                } catch {}
                decodersRef.current.delete(ssrc);
            }
        };

        const cleanupAudioGraph = () => {
            try {
                workletRef.current?.port.postMessage({ type: "clear" });
            } catch {}

            try {
                workletRef.current?.disconnect();
            } catch {}

            workletRef.current = null;

            if (contextRef.current && contextRef.current.state !== "closed") {
                contextRef.current.close().catch(() => {});
            }
            contextRef.current = null;

            initializedRef.current = false;
        };

        if (!enabled || deafened) {
            closeAllDecoders();
            cleanupAudioGraph();
            return;
        }

        if (initializedRef.current) {
            return;
        }

        let cancelled = false;
        let unsubAudio: (() => void) | undefined;
        let unsubLeft: (() => void) | undefined;

        const getOrCreateDecoder = (ssrc: number): DecoderState | null => {
            const existing = decodersRef.current.get(ssrc);
            if (existing && existing.decoder.state !== "closed") {
                return existing;
            }

            const AudioDecoderCtor = (globalThis as any).AudioDecoder as
                | (new (init: AudioDecoderInit) => AudioDecoder)
                | undefined;

            if (!AudioDecoderCtor || typeof (AudioDecoderCtor as any).isConfigSupported !== "function") {
                console.warn("[AudioPlayback] WebCodecs AudioDecoder not available");
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
                            const samples = new Float32Array(numFrames);

                            audioData.copyTo(samples, {
                                planeIndex: 0,
                                format: "f32-planar" as AudioSampleFormat,
                            });

                            workletRef.current.port.postMessage(
                                {
                                    type: "samples",
                                    ssrc,
                                    samplesBuffer: samples.buffer,
                                },
                                [samples.buffer]
                            );
                        } catch (err) {
                            console.error("[AudioPlayback] Failed to push decoded samples:", err);
                        } finally {
                            audioData.close();
                        }
                    },
                    error: (e: DOMException) => {
                        console.error(`[AudioPlayback] Decoder error SSRC ${ssrc}:`, e);

                        const state = decodersRef.current.get(ssrc);
                        if (!state) return;

                        try {
                            if (state.decoder.state !== "closed") {
                                state.decoder.reset();
                                state.configured = false;
                            }
                        } catch {
                            try {
                                state.decoder.close();
                            } catch {}
                            decodersRef.current.delete(ssrc);
                        }

                        try {
                            workletRef.current?.port.postMessage({ type: "remove-stream", ssrc });
                        } catch {}
                    },
                });

                const state: DecoderState = {
                    decoder,
                    configured: false,
                    configuring: null,
                    nextTimestampUs: 0,
                };

                decodersRef.current.set(ssrc, state);
                return state;
            } catch (err) {
                console.error("[AudioPlayback] Failed to create decoder:", err);
                return null;
            }
        };

        const configureDecoder = async (state: DecoderState): Promise<boolean> => {
            if (state.configured && state.decoder.state === "configured") {
                return true;
            }

            if (state.configuring) {
                return state.configuring;
            }

            state.configuring = (async () => {
                const AudioDecoderCtor = (globalThis as any).AudioDecoder;

                const config: AudioDecoderConfig = {
                    codec: "opus",
                    sampleRate: SAMPLE_RATE,
                    numberOfChannels: 1,
                };

                try {
                    const support = await AudioDecoderCtor.isConfigSupported(config);

                    if (!support?.supported) {
                        console.error("[AudioPlayback] Opus decoder not supported");
                        return false;
                    }

                    state.decoder.configure(support.config || config);
                    state.configured = true;
                    return true;
                } catch (err) {
                    console.error("[AudioPlayback] Failed to configure decoder:", err);
                    return false;
                } finally {
                    state.configuring = null;
                }
            })();

            return state.configuring;
        };

        const handleAudio = async (packet: AudioPacket) => {
            if (!mountedRef.current || !initializedRef.current) {
                return;
            }

            const u8 = normalizePacketData(packet.data);
            if (!u8 || u8.length === 0) {
                return;
            }

            const ssrc = packet.ssrc >>> 0;
            if (!ssrc) {
                return;
            }

            if (packet.timestamp && packet.pts) {
                window.__concordAudioClock = window.__concordAudioClock || {};
                window.__concordAudioClock[ssrc] = {
                    pts: packet.pts,
                    wallMs: performance.now(),
                };
            }

            const EncodedAudioChunkCtor = (globalThis as any).EncodedAudioChunk as
                | (new (init: EncodedAudioChunkInit) => EncodedAudioChunk)
                | undefined;

            if (!EncodedAudioChunkCtor) {
                console.warn("[AudioPlayback] EncodedAudioChunk not available");
                return;
            }

            const state = getOrCreateDecoder(ssrc);
            if (!state) {
                return;
            }

            const ok = await configureDecoder(state);
            if (!ok || state.decoder.state !== "configured") {
                return;
            }

            try {
                const chunk = new EncodedAudioChunkCtor({
                    type: "key",
                    timestamp: state.nextTimestampUs,
                    data: u8,
                });

                state.nextTimestampUs += FRAME_DURATION_US;

                if (state.decoder.decodeQueueSize < MAX_DECODE_QUEUE) {
                    state.decoder.decode(chunk);
                }
            } catch (err) {
                console.error("[AudioPlayback] Failed to decode chunk:", err);
            }
        };

        const removeStream = (ssrc: number) => {
            if (!ssrc) return;

            const state = decodersRef.current.get(ssrc);
            if (state) {
                try {
                    if (state.decoder.state !== "closed") {
                        state.decoder.close();
                    }
                } catch {}
                decodersRef.current.delete(ssrc);
            }

            try {
                workletRef.current?.port.postMessage({
                    type: "remove-stream",
                    ssrc,
                });
            } catch {}
        };

        const handleParticipantLeft = (ev: any) => {
            const ssrc = (ev?.ssrc ?? ev?.audio_ssrc ?? 0) >>> 0;
            const videoSsrc = (ev?.videoSsrc ?? ev?.video_ssrc ?? 0) >>> 0;
            const screenSsrc = (ev?.screenSsrc ?? ev?.screen_ssrc ?? 0) >>> 0;

            removeStream(ssrc);
            removeStream(videoSsrc);
            removeStream(screenSsrc);
        };

        const setup = async () => {
            try {
                const context = new AudioContext({
                    sampleRate: SAMPLE_RATE,
                    latencyHint: "interactive",
                });
                contextRef.current = context;

                if (context.state === "suspended") {
                    await context.resume();
                }

                const blob = new Blob([WORKLET_CODE], { type: "application/javascript" });
                const url = URL.createObjectURL(blob);

                try {
                    await context.audioWorklet.addModule(url);
                } finally {
                    URL.revokeObjectURL(url);
                }

                if (cancelled || !mountedRef.current) {
                    await context.close().catch(() => {});
                    return;
                }

                const worklet = new AudioWorkletNode(context, WORKLET_NAME, {
                    numberOfInputs: 0,
                    numberOfOutputs: 1,
                    outputChannelCount: [1],
                });

                workletRef.current = worklet;
                worklet.connect(context.destination);

                initializedRef.current = true;

                unsubAudio = window.concord.onVoiceAudio?.(handleAudio);
                unsubLeft = window.concord.onVoiceParticipantLeft?.(handleParticipantLeft);

                console.log("[AudioPlayback] Initialized per-SSRC mixer");
            } catch (err) {
                console.error("[AudioPlayback] Setup failed:", err);
            }
        };

        setup();

        return () => {
            cancelled = true;
            unsubAudio?.();
            unsubLeft?.();
            closeAllDecoders();
            cleanupAudioGraph();
        };
    }, [enabled, deafened]);

    return {};
}