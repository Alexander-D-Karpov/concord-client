import * as dgram from "dgram";
import { EventEmitter } from "events";

import { KeyRing, ReplayFilter } from "./crypto";
import { Fragmenter, Reassembler } from "./fragment";
import { RetransmitCache, NackTracker, PliTracker } from "./nack";
import { StatsCollector } from "./stats";

import {
    MEDIA_HEADER_SIZE,
    PacketType,
    PacketFlags,
    CodecType,
} from "../../shared/voice/constants";

import {
    encodeMediaHeader,
    decodeMediaHeader,
    buildHelloPacket,
    buildPingPacket,
    buildByePacket,
    buildSpeakingPacket,
    buildMediaStatePacket,
    buildNackPacket,
    buildPliPacket,
    buildReceiverReport,
} from "../../shared/voice/protocol";

import type { MediaHeader, ParticipantInfo, ParticipantLeftPayload } from "../../shared/voice/types";
import type { VoiceConfig } from "../../shared/voice/types";

const DEBUG_VOICE = true;

export interface VoiceServiceConfig extends VoiceConfig {}

export class VoiceService extends EventEmitter {
    private config: VoiceServiceConfig;

    private socket?: dgram.Socket;

    private keyRing: KeyRing;
    private replayFilters = new Map<string, ReplayFilter>(); // `${keyId}:${ssrc}`

    private fragmenter = new Fragmenter();
    private reassemblers = new Map<number, Reassembler>();

    private retransmitCache = new RetransmitCache();
    private nackTracker = new NackTracker();
    private pliTracker = new PliTracker();
    private stats = new StatsCollector();

    private connected = false;
    private connectingPromise: Promise<void> | null = null;

    private sessionId?: number;
    private audioSsrc?: number;
    private videoSsrc?: number;
    private screenSsrc?: number;

    private audioSequence = 0;
    private videoSequence = 0;
    private screenSequence = 0;

    private audioTimestamp = 0;
    private videoTimestamp = 0;
    private screenTimestamp = 0;

    private audioCounter = 0n;
    private videoCounter = 0n;
    private screenCounter = 0n;

    private pingInterval?: NodeJS.Timeout;
    private rrInterval?: NodeJS.Timeout;
    private connectionTimeout?: NodeJS.Timeout;

    private connectResolve?: () => void;
    private connectReject?: (err: Error) => void;

    private participants = new Map<string, ParticipantInfo>();
    private ssrcToUserId = new Map<number, string>();

    private decryptOk = 0;
    private decryptFail = 0;

    private seenFirstVideoFrom = new Set<number>();

    constructor(config: VoiceServiceConfig) {
        super();
        this.config = config;

        this.keyRing = new KeyRing(config.roomId);
        this.keyRing.setKey(config.crypto.keyId, config.crypto.keyMaterial);

        this.audioCounter = BigInt(Math.floor(Math.random() * 0xffffffff));
        this.videoCounter = BigInt(Math.floor(Math.random() * 0xffffffff));
        this.screenCounter = BigInt(Math.floor(Math.random() * 0xffffffff));
    }

    async connect(): Promise<void> {
        if (this.connected) return;
        if (this.connectingPromise) return this.connectingPromise;

        this.connectingPromise = new Promise((resolve, reject) => {
            this.connectResolve = resolve;
            this.connectReject = reject;

            this.connectionTimeout = setTimeout(() => {
                this.cleanupTimers();
                this.closeSocket();
                this.connectingPromise = null;
                reject(new Error("Connection timeout"));
            }, 10000);

            try {
                this.socket = dgram.createSocket("udp4");

                this.socket.on("error", (err) => {
                    this.emit("error", err);
                    if (!this.connected && this.connectReject) {
                        this.cleanupTimers();
                        this.closeSocket();
                        this.connectingPromise = null;
                        this.connectReject(err);
                    }
                });

                this.socket.on("message", (msg) => this.handleMessage(msg));

                this.socket.on("close", () => {
                    if (this.connected) {
                        this.connected = false;
                        this.emit("disconnected");
                    }
                });

                this.socket.bind(() => {
                    this.sendHello();
                });
            } catch (err: any) {
                this.cleanupTimers();
                this.closeSocket();
                this.connectingPromise = null;
                reject(err);
            }
        });

        return this.connectingPromise;
    }

    disconnect(): void {
        if (!this.connected && !this.connectingPromise && !this.socket) return;

        this.cleanupTimers();

        const socket = this.socket;
        const wasConnected = this.connected;
        const ssrc = this.audioSsrc;

        this.connected = false;
        this.connectingPromise = null;

        this.sessionId = undefined;
        this.audioSsrc = undefined;
        this.videoSsrc = undefined;
        this.screenSsrc = undefined;

        this.participants.clear();
        this.ssrcToUserId.clear();
        this.replayFilters.clear();
        this.reassemblers.clear();
        this.retransmitCache.clear();
        this.nackTracker.clear();
        this.pliTracker.clear();
        this.stats.reset();
        this.seenFirstVideoFrom.clear();

        if (socket && wasConnected && ssrc) {
            const packet = buildByePacket(ssrc);
            const buf = Buffer.from(packet);
            socket.send(buf, 0, buf.length, this.config.endpoint.port, this.config.endpoint.host, () => {
                try { socket.close(); } catch {}
            });
            setTimeout(() => {
                try { socket.close(); } catch {}
            }, 200);
        } else {
            this.closeSocket();
        }

        this.socket = undefined;
        this.emit("disconnected");
    }

    private closeSocket(): void {
        if (!this.socket) return;
        try {
            this.socket.close();
        } catch {}
        this.socket = undefined;
    }

    private cleanupTimers(): void {
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = undefined;
        }
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = undefined;
        }
        if (this.rrInterval) {
            clearInterval(this.rrInterval);
            this.rrInterval = undefined;
        }
    }

    private sendHello(): void {
        const payload = {
            token: this.config.voiceToken,
            protocol: 1,
            codec: this.config.codec.audio,
            room_id: this.config.roomId,
            user_id: this.config.userId,
            video_enabled: !!this.config.codec.video,
            video_codec: this.config.codec.video,
            crypto: {
                aead: "aes-256-gcm",
                key_id: [this.config.crypto.keyId & 0xff],
            },
        };

        const packet = buildHelloPacket(payload);
        this.send(Buffer.from(packet));
    }

    private handleMessage(msg: Buffer): void {
        if (msg.length < 1) return;

        const type = msg[0];

        switch (type) {
            case PacketType.WELCOME:
                this.handleWelcome(msg);
                break;
            case PacketType.AUDIO:
            case PacketType.VIDEO:
                this.handleMedia(msg);
                break;
            case PacketType.PONG:
                this.handlePong(msg);
                break;
            case PacketType.SPEAKING:
                this.handleSpeaking(msg);
                break;
            case PacketType.MEDIA_STATE:
                this.handleMediaState(msg);
                break;
            case PacketType.NACK:
                this.handleNack(msg);
                break;
            case PacketType.PLI:
                this.handlePli(msg);
                break;
            case PacketType.PARTICIPANT_LEFT:
                this.handleParticipantLeft(msg);
                break;
        }
    }

    private handleWelcome(msg: Buffer): void {
        try {
            const json = msg.slice(1).toString("utf8");
            const welcome: any = JSON.parse(json);

            this.cleanupTimers();

            this.sessionId = welcome.sessionId ?? welcome.session_id;
            this.audioSsrc = welcome.ssrc ?? welcome.audio_ssrc;
            this.videoSsrc = welcome.videoSsrc ?? welcome.video_ssrc;
            this.screenSsrc = welcome.screenSsrc ?? welcome.screen_ssrc;

            const participants = Array.isArray(welcome.participants) ? welcome.participants : [];

            this.participants.clear();
            this.ssrcToUserId.clear();

            for (const raw of participants) {
                const userId = raw.userId ?? raw.user_id;
                if (!userId) continue;

                const audio = raw.ssrc ?? raw.audioSsrc ?? raw.audio_ssrc ?? 0;
                const video = raw.videoSsrc ?? raw.video_ssrc ?? 0;
                const screen = raw.screenSsrc ?? raw.screen_ssrc ?? 0;

                const p: ParticipantInfo = {
                    userId,
                    ssrc: audio >>> 0,
                    videoSsrc: (video >>> 0) || undefined,
                    screenSsrc: (screen >>> 0) || undefined,
                    muted: !!(raw.muted ?? false),
                    videoEnabled: !!(raw.videoEnabled ?? raw.video_enabled ?? false),
                    screenSharing: !!(raw.screenSharing ?? raw.screen_sharing ?? false),
                    displayName: raw.displayName ?? raw.display_name,
                    avatarUrl: raw.avatarUrl ?? raw.avatar_url,
                };

                this.participants.set(userId, p);

                if (p.ssrc) this.ssrcToUserId.set(p.ssrc, userId);
                if (p.videoSsrc) this.ssrcToUserId.set(p.videoSsrc, userId);
                if (p.screenSsrc) this.ssrcToUserId.set(p.screenSsrc, userId);
            }

            this.connected = true;

            this.startPingInterval();
            this.startRRInterval();

            this.connectResolve?.();
            this.connectResolve = undefined;
            this.connectReject = undefined;
            this.connectingPromise = null;

            this.emit("connected", {
                sessionId: this.sessionId,
                ssrc: this.audioSsrc,
                videoSsrc: this.videoSsrc,
                screenSsrc: this.screenSsrc,
                participants: Array.from(this.participants.values()),
            });
        } catch (err) {
            console.error("[VoiceService] Failed to parse welcome:", err);
        }
    }

    private replayKey(keyId: number, ssrc: number): string {
        return `${keyId & 0xff}:${ssrc >>> 0}`;
    }

    private handleMedia(msg: Buffer): void {
        if (msg.length < MEDIA_HEADER_SIZE) {
            if (DEBUG_VOICE) console.log('[VoiceService] Media packet too small:', msg.length);
            return;
        }

        const header = decodeMediaHeader(new Uint8Array(msg.buffer, msg.byteOffset, MEDIA_HEADER_SIZE));
        if (!header) {
            if (DEBUG_VOICE) console.log('[VoiceService] Failed to decode header');
            return;
        }

        const ssrc = header.ssrc >>> 0;
        const keyId = header.keyId & 0xff;
        const counter = header.counter;
        const isVideo = header.type === PacketType.VIDEO;

        if (DEBUG_VOICE && this.decryptOk % 100 === 0) {
            console.log(`[VoiceService] handleMedia: type=${isVideo ? 'video' : 'audio'}, ssrc=${ssrc}, keyId=${keyId}, counter=${counter}, size=${msg.length}`);
        }

        // Check if this SSRC belongs to us (skip our own packets)
        if (ssrc === this.audioSsrc || ssrc === this.videoSsrc || ssrc === this.screenSsrc) {
            return; // Don't process our own packets
        }

        const rk = this.replayKey(keyId, ssrc);
        let rf = this.replayFilters.get(rk);
        if (!rf) {
            rf = new ReplayFilter();
            this.replayFilters.set(rk, rf);
            if (DEBUG_VOICE) console.log(`[VoiceService] Created new ReplayFilter for keyId=${keyId}, ssrc=${ssrc}`);
        }

        if (!rf.accept(counter)) {
            if (DEBUG_VOICE) console.log(`[VoiceService] Replay filter rejected packet: ssrc=${ssrc}, counter=${counter}`);
            return;
        }

        const aad = Buffer.from(msg.buffer, msg.byteOffset, MEDIA_HEADER_SIZE);
        const ciphertext = Buffer.from(msg.buffer, msg.byteOffset + MEDIA_HEADER_SIZE);

        if (ciphertext.length === 0) {
            if (DEBUG_VOICE) console.log('[VoiceService] Empty ciphertext');
            return;
        }

        const plaintext = this.keyRing.open(aad, ciphertext, keyId, ssrc, counter);

        if (!plaintext) {
            this.decryptFail++;
            if (DEBUG_VOICE) {
                console.error(`[VoiceService] Decrypt FAILED: ssrc=${ssrc}, keyId=${keyId}, counter=${counter}, cipherLen=${ciphertext.length}, ok=${this.decryptOk}, fail=${this.decryptFail}`);
            }
            this.emit("decrypt-error", {
                ssrc,
                keyId,
                sequence: header.sequence,
                decryptOk: this.decryptOk,
                decryptFail: this.decryptFail,
            });
            return;
        }

        this.decryptOk++;

        if (DEBUG_VOICE && this.decryptOk % 100 === 1) {
            console.log(`[VoiceService] Decrypt OK #${this.decryptOk}: ssrc=${ssrc}, type=${isVideo ? 'video' : 'audio'}, plainLen=${plaintext.length}`);
        }

        // Update SSRC mapping if we don't have it
        if (!this.ssrcToUserId.has(ssrc)) {
            // Try to find user by checking participants
            for (const [userId, p] of this.participants) {
                if (p.ssrc === ssrc || p.videoSsrc === ssrc || p.screenSsrc === ssrc) {
                    this.ssrcToUserId.set(ssrc, userId);
                    if (DEBUG_VOICE) console.log(`[VoiceService] Mapped SSRC ${ssrc} to user ${userId}`);
                    break;
                }
            }
        }

        const timestampHz = isVideo ? 90000 : 48000;
        this.stats.recordPacketReceived(ssrc, header.sequence, header.timestamp, timestampHz, msg.length);

        this.emitDecryptedMedia(header, plaintext, isVideo);
    }

    private emitDecryptedMedia(header: MediaHeader, payload: Buffer, isVideo: boolean): void {
        if (isVideo) {
            let reassembler = this.reassemblers.get(header.ssrc);
            if (!reassembler) {
                reassembler = new Reassembler();
                this.reassemblers.set(header.ssrc, reassembler);
            }

            const isKeyframe = (header.flags & PacketFlags.KEYFRAME) !== 0;
            const frame = reassembler.addFragment(payload, isKeyframe);

            if (frame) {
                this.emit("video", {
                    ssrc: header.ssrc,
                    sequence: header.sequence,
                    timestamp: header.timestamp,
                    pts: header.timestamp,
                    isKeyframe: frame.isKeyframe,
                    data: frame.data,
                });
            }
            return;
        }

        this.emit("audio", {
            ssrc: header.ssrc,
            sequence: header.sequence,
            timestamp: header.timestamp,
            pts: header.timestamp,
            data: payload,
        });
    }

    private handlePong(msg: Buffer): void {
        if (msg.length < 9) return;
        const view = new DataView(msg.buffer, msg.byteOffset);
        const sentTime = Number(view.getBigUint64(1, false));
        const rtt = Date.now() - sentTime;
        this.stats.recordRtt(rtt);
        this.emit("rtt", rtt);
    }

    private handleSpeaking(msg: Buffer): void {
        try {
            const json = msg.slice(1).toString("utf8");
            const data = JSON.parse(json);

            const userId = data.userId || data.user_id;
            const ssrc = (data.ssrc ?? 0) >>> 0;
            const videoSsrc = (data.videoSsrc ?? data.video_ssrc ?? 0) >>> 0;
            const screenSsrc = (data.screenSsrc ?? data.screen_ssrc ?? 0) >>> 0;

            if (userId) {
                if (ssrc) this.ssrcToUserId.set(ssrc, userId);
                if (videoSsrc) this.ssrcToUserId.set(videoSsrc, userId);
                if (screenSsrc) this.ssrcToUserId.set(screenSsrc, userId);
            }

            this.emit("speaking", {
                ssrc,
                userId,
                speaking: !!data.speaking,
            });
        } catch {}
    }

    private handleMediaState(msg: Buffer): void {
        try {
            const json = msg.slice(1).toString("utf8");
            const data = JSON.parse(json);

            const userId = data.userId || data.user_id;
            if (!userId) return;

            const ssrc = (data.ssrc ?? 0) >>> 0;
            const videoSsrc = (data.videoSsrc ?? data.video_ssrc ?? 0) >>> 0;
            const screenSsrc = (data.screenSsrc ?? data.screen_ssrc ?? 0) >>> 0;

            console.log('[VoiceService] MediaState received:', {
                userId,
                ssrc,
                videoSsrc,
                screenSsrc,
                screenSharing: data.screenSharing ?? data.screen_sharing
            });

            if (ssrc) this.ssrcToUserId.set(ssrc, userId);
            if (videoSsrc) this.ssrcToUserId.set(videoSsrc, userId);
            if (screenSsrc) this.ssrcToUserId.set(screenSsrc, userId);

            const existing = this.participants.get(userId);

            const next: ParticipantInfo = {
                userId,
                ssrc: ssrc || existing?.ssrc || 0,
                videoSsrc: videoSsrc || existing?.videoSsrc,
                screenSsrc: screenSsrc || existing?.screenSsrc,
                muted: !!(data.muted ?? existing?.muted ?? false),
                videoEnabled: !!(data.videoEnabled ?? data.video_enabled ?? existing?.videoEnabled ?? false),
                screenSharing: !!(data.screenSharing ?? data.screen_sharing ?? existing?.screenSharing ?? false),
                speaking: existing?.speaking ?? false,
                displayName: existing?.displayName,
                avatarUrl: existing?.avatarUrl,
            };

            this.participants.set(userId, next);

            this.emit("media-state", {
                ssrc: next.ssrc,
                videoSsrc: next.videoSsrc,
                screenSsrc: next.screenSsrc,
                userId,
                muted: next.muted,
                videoEnabled: next.videoEnabled,
                screenSharing: next.screenSharing,
            });

            if (!existing) {
                this.emit("participant-joined", next);
            } else {
                this.emit("participant-updated", next);
            }
        } catch (e) {
            console.error('[VoiceService] Failed to parse MediaState:', e);
        }
    }

    private handleParticipantLeft(msg: Buffer): void {
        try {
            const json = msg.slice(1).toString("utf8");
            const data: ParticipantLeftPayload = JSON.parse(json);

            let userId = data.userId || data.user_id || "";
            const ssrc = ((data.ssrc ?? data.audio_ssrc ?? 0) >>> 0) || 0;
            const videoSsrc = ((data.videoSsrc ?? data.video_ssrc ?? 0) >>> 0) || 0;

            if (!userId) {
                if (ssrc) userId = this.ssrcToUserId.get(ssrc) || "";
                if (!userId && videoSsrc) userId = this.ssrcToUserId.get(videoSsrc) || "";
            }

            if (ssrc) this.ssrcToUserId.delete(ssrc);
            if (videoSsrc) this.ssrcToUserId.delete(videoSsrc);

            if (userId) this.participants.delete(userId);

            if (ssrc) this.clearPerStreamState(ssrc);
            if (videoSsrc && videoSsrc !== ssrc) this.clearPerStreamState(videoSsrc);

            this.emit("participant-left", { userId, ssrc, videoSsrc });
        } catch {}
    }

    private clearPerStreamState(ssrc: number): void {
        for (const k of Array.from(this.replayFilters.keys())) {
            if (k.endsWith(`:${ssrc >>> 0}`)) this.replayFilters.delete(k);
        }

        this.reassemblers.delete(ssrc);
        this.stats.clearSsrc(ssrc);

        this.retransmitCache.clearSsrc(ssrc);
        this.nackTracker.clearSsrc(ssrc);
        this.pliTracker.clearSsrc(ssrc);

        this.seenFirstVideoFrom.delete(ssrc);
    }

    private handleNack(msg: Buffer): void {
        if (msg.length < 7) return;

        const view = new DataView(msg.buffer, msg.byteOffset);
        const targetSsrc = view.getUint32(1, false);
        const count = view.getUint16(5, false);

        if (targetSsrc !== this.audioSsrc && targetSsrc !== this.videoSsrc && targetSsrc !== this.screenSsrc) return;

        for (let i = 0; i < count && 7 + i * 2 + 2 <= msg.length; i++) {
            const seq = view.getUint16(7 + i * 2, false);
            const cached = this.retransmitCache.get(targetSsrc, seq);
            if (cached) this.send(cached);
        }
    }

    private handlePli(msg: Buffer): void {
        if (msg.length < 5) return;

        const view = new DataView(msg.buffer, msg.byteOffset);
        const targetSsrc = view.getUint32(1, false);

        if (targetSsrc === this.videoSsrc || targetSsrc === this.screenSsrc) {
            this.emit("pli-requested");
        }
    }

    sendAudio(audioData: Buffer): void {
        if (!this.connected || !this.audioSsrc) return;

        const counter = this.audioCounter++;
        const sequence = this.audioSequence++ & 0xffff;

        const timestamp = this.audioTimestamp >>> 0;
        this.audioTimestamp = (this.audioTimestamp + 960) >>> 0;

        const header: MediaHeader = {
            type: PacketType.AUDIO,
            flags: 0,
            keyId: this.config.crypto.keyId,
            codec: CodecType.OPUS,
            sequence,
            timestamp,
            ssrc: this.audioSsrc,
            counter,
        };

        const headerBytes = Buffer.from(encodeMediaHeader(header));
        const payload = this.keyRing.seal(headerBytes, audioData, header.keyId, header.ssrc, counter);

        const packet = Buffer.concat([headerBytes, payload]);
        this.retransmitCache.store(header.ssrc, sequence, packet);
        this.stats.recordPacketSent(packet.length);

        this.send(packet);
    }

    sendVideo(videoData: Buffer, isKeyframe: boolean, source: 'camera' | 'screen' = 'camera'): void {
        if (!this.connected) return;

        let targetSsrc: number | undefined;
        let sequence: number;
        let timestamp: number;
        let counter: bigint;

        if (source === 'screen') {
            if (!this.screenSsrc) return;
            targetSsrc = this.screenSsrc;
            sequence = this.screenSequence;
            timestamp = this.screenTimestamp;
            counter = this.screenCounter;
            this.screenTimestamp = (this.screenTimestamp + 3000) >>> 0;
        } else {
            if (!this.videoSsrc) return;
            targetSsrc = this.videoSsrc;
            sequence = this.videoSequence;
            timestamp = this.videoTimestamp;
            counter = this.videoCounter;
            this.videoTimestamp = (this.videoTimestamp + 3000) >>> 0;
        }

        const fragments = this.fragmenter.fragment(videoData, isKeyframe);

        for (let i = 0; i < fragments.length; i++) {
            const fragPayload = fragments[i];
            const fragSequence = (sequence + i) & 0xffff;
            this.sendVideoPacket(fragPayload, timestamp, isKeyframe && i === 0, targetSsrc!, counter + BigInt(i), fragSequence);
        }

        if (source === 'screen') {
            this.screenSequence = (sequence + fragments.length) & 0xffff;
            this.screenCounter = counter + BigInt(fragments.length);
        } else {
            this.videoSequence = (sequence + fragments.length) & 0xffff;
            this.videoCounter = counter + BigInt(fragments.length);
        }
    }

    private sendVideoPacket(payload: Buffer, timestamp: number, isKeyframe: boolean, ssrc: number, counter: bigint, sequence: number): void {
        const header: MediaHeader = {
            type: PacketType.VIDEO,
            flags: isKeyframe ? PacketFlags.KEYFRAME : 0,
            keyId: this.config.crypto.keyId,
            codec: CodecType.H264,
            sequence: sequence & 0xffff,
            timestamp,
            ssrc,
            counter,
        };

        const headerBytes = Buffer.from(encodeMediaHeader(header));
        const enc = this.keyRing.seal(headerBytes, payload, header.keyId, header.ssrc, counter);

        const packet = Buffer.concat([headerBytes, enc]);
        this.retransmitCache.store(header.ssrc, sequence, packet);
        this.stats.recordPacketSent(packet.length);

        if (packet.length > 1500) {
            console.warn(`[VoiceService] Packet exceeds MTU: ${packet.length}`);
            return;
        }

        this.send(packet);
    }

    setSpeaking(speaking: boolean): void {
        if (!this.connected || !this.audioSsrc) return;

        const payload = {
            ssrc: this.audioSsrc,
            video_ssrc: this.videoSsrc,
            screen_ssrc: this.screenSsrc,
            user_id: this.config.userId,
            room_id: this.config.roomId,
            speaking,
        };

        const packet = buildSpeakingPacket(payload);
        this.send(Buffer.from(packet));
    }

    setMediaState(muted: boolean, videoEnabled: boolean, screenSharing: boolean): void {

        if (!this.connected || !this.audioSsrc) return;

        const payload = {
            ssrc: this.audioSsrc,
            video_ssrc: this.videoSsrc,
            screen_ssrc: this.screenSsrc,
            user_id: this.config.userId,
            room_id: this.config.roomId,
            muted,
            video_enabled: videoEnabled,
            screen_sharing: screenSharing,
        };

        const packet = buildMediaStatePacket(payload);
        this.send(Buffer.from(packet));
    }

    requestKeyframe(targetSsrc: number): void {
        if (!this.connected) return;

        if (this.pliTracker.shouldSendPli(targetSsrc)) {
            const packet = buildPliPacket(targetSsrc);
            this.send(Buffer.from(packet));
        }
    }

    setSubscriptions(ssrcs: number[]): void {
        if (!this.connected) return;

        // PacketType 0x0e = SUBSCRIBE
        const packetType = 0x0e;
        const payload = JSON.stringify({ subscriptions: ssrcs });
        const jsonBytes = new TextEncoder().encode(payload);
        const packet = new Uint8Array(1 + jsonBytes.length);
        packet[0] = packetType;
        packet.set(jsonBytes, 1);

        this.send(Buffer.from(packet));
    }

    private startPingInterval(): void {
        this.pingInterval = setInterval(() => {
            if (!this.connected) return;
            const packet = buildPingPacket();
            this.send(Buffer.from(packet));
        }, 5000);
    }

    private startRRInterval(): void {
        this.rrInterval = setInterval(() => {
            if (!this.connected || !this.audioSsrc) return;

            for (const [ssrc] of this.ssrcToUserId) {
                if (ssrc === this.audioSsrc || ssrc === this.videoSsrc || ssrc === this.screenSsrc) continue;

                const streamStats = this.stats.getStreamStats(ssrc);
                if (!streamStats) continue;

                const fractionLost = this.stats.getFractionLost(ssrc);

                const packet = buildReceiverReport(
                    ssrc,
                    this.audioSsrc!,
                    fractionLost,
                    streamStats.packetsLost,
                    streamStats.highestSeq,
                    Math.floor(streamStats.jitterMs)
                );

                this.send(Buffer.from(packet));
            }
        }, 250);
    }

    private send(data: Buffer): void {
        if (!this.socket) return;

        this.socket.send(
            data,
            0,
            data.length,
            this.config.endpoint.port,
            this.config.endpoint.host,
            (err) => {
                if (err) this.emit("error", err);
            }
        );
    }

    isConnected(): boolean {
        return this.connected;
    }

    getSSRC(): number | undefined {
        return this.audioSsrc;
    }

    getVideoSSRC(): number | undefined {
        return this.videoSsrc;
    }

    getScreenSSRC(): number | undefined {
        return this.screenSsrc;
    }

    getSessionId(): number | undefined {
        return this.sessionId;
    }

    getParticipants(): ParticipantInfo[] {
        return Array.from(this.participants.values());
    }

    getSsrcToUserIdMap(): Map<number, string> {
        return new Map(this.ssrcToUserId);
    }

    getStats() {
        return this.stats.getStats();
    }
}