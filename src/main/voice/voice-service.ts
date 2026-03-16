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
    buildSubscribePacket,
    buildQualityReportPacket,
} from "../../shared/voice/protocol";

import type {
    MediaHeader,
    ParticipantInfo,
    ParticipantLeftPayload,
    VoiceConfig,
    WelcomePayload,
} from "../../shared/voice/types";

const DEBUG_VOICE = true;

export interface VoiceServiceConfig extends VoiceConfig {}

export class VoiceService extends EventEmitter {
    private config: VoiceServiceConfig;
    private socket?: dgram.Socket;
    private keyRing: KeyRing;
    private replayFilters = new Map<string, ReplayFilter>();
    private fragmenter = new Fragmenter();
    private reassemblers = new Map<number, Reassembler>();
    private retransmitCache = new RetransmitCache();
    private nackTracker = new NackTracker();
    private pliTracker = new PliTracker();
    private stats = new StatsCollector();
    private nackInterval?: NodeJS.Timeout;
    private connected = false;
    private connectingPromise: Promise<void> | null = null;

    private sessionId?: number;
    private audioSsrc?: number;
    private videoSsrc?: number;
    private screenSsrc?: number;

    private audioSequence = 0;
    private videoSequence = 0;
    private screenSequence = 0;

    private baseTimeMs = 0;

    private audioCounter = 0n;
    private videoCounter = 0n;
    private screenCounter = 0n;

    private pingInterval?: NodeJS.Timeout;
    private rrInterval?: NodeJS.Timeout;
    private qualityInterval?: NodeJS.Timeout;
    private connectionTimeout?: NodeJS.Timeout;
    private lastPongAt = 0;

    private connectResolve?: () => void;
    private connectReject?: (err: Error) => void;

    private participants = new Map<string, ParticipantInfo>();
    private ssrcToUserId = new Map<number, string>();

    private decryptOk = 0;
    private decryptFail = 0;

    private localMuted = false;
    private localVideoEnabled = false;
    private localScreenSharing = false;
    private localQuality = 0;
    private peerQualities = new Map<string, number>();
    private currentSubscriptions: number[] = [];

    constructor(config: VoiceServiceConfig) {
        super();
        this.config = config;
        this.keyRing = new KeyRing(config.roomId);
        this.keyRing.setKey(config.crypto.keyId, config.crypto.keyMaterial);
        this.audioCounter = BigInt(Math.floor(Math.random() * 0xffffffff));
        this.videoCounter = BigInt(Math.floor(Math.random() * 0xffffffff));
        this.screenCounter = BigInt(Math.floor(Math.random() * 0xffffffff));
        this.localVideoEnabled = !!config.codec.video;
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
                this.socket.bind(() => this.sendHello());
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
        this.missedPongs = 0;
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
        this.peerQualities.clear();
        this.localQuality = 0;
        this.currentSubscriptions = [];

        if (socket && wasConnected && ssrc) {
            const packet = buildByePacket(ssrc);
            const buf = Buffer.from(packet);
            socket.send(buf, 0, buf.length, this.config.endpoint.port, this.config.endpoint.host, () => {
                try { socket.close(); } catch {}
            });
            setTimeout(() => { try { socket.close(); } catch {} }, 200);
        } else {
            this.closeSocket();
        }

        this.socket = undefined;
        this.emit("disconnected");
    }

    private closeSocket(): void {
        if (!this.socket) return;
        try { this.socket.close(); } catch {}
        this.socket = undefined;
    }

    private cleanupTimers(): void {
        if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.rrInterval) clearInterval(this.rrInterval);
        if (this.qualityInterval) clearInterval(this.qualityInterval);
        if (this.nackInterval) clearInterval(this.nackInterval);
        this.connectionTimeout = undefined;
        this.pingInterval = undefined;
        this.rrInterval = undefined;
        this.qualityInterval = undefined;
        this.nackInterval = undefined;
    }

    private sendHello(): void {
        const payload = {
            token: this.config.voiceToken,
            protocol: 2,
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
        this.send(Buffer.from(buildHelloPacket(payload)));
    }

    private handleMessage(msg: Buffer): void {
        if (msg.length < 1) return;
        switch (msg[0]) {
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
            case PacketType.PACKET_TYPE_QUALITY_REPORT:
                this.handleQualityReport(msg);
                break;
            case PacketType.RR:
                this.handleReceiverReport(msg);
                break;
        }
    }

    private startNackInterval(): void {
        this.nackInterval = setInterval(() => {
            if (!this.connected || !this.audioSsrc) return;
            for (const [ssrc] of this.ssrcToUserId) {
                if (ssrc === this.audioSsrc || ssrc === this.videoSsrc || ssrc === this.screenSsrc) continue;
                if (!this.isRemoteVideoOrScreen(ssrc)) continue;

                const missing = this.stats.getMissingSequences(ssrc, 16);
                if (missing.length > 0 && this.nackTracker.shouldSendNack(ssrc)) {
                    this.send(Buffer.from(buildNackPacket(ssrc, missing)));
                }

                const reassembler = this.reassemblers.get(ssrc);
                if (reassembler?.getStats().needsKeyframe && this.pliTracker.shouldSendPli(ssrc)) {
                    this.send(Buffer.from(buildPliPacket(ssrc)));
                }
            }
        }, 40);
    }

    private isRemoteVideoOrScreen(ssrc: number): boolean {
        for (const p of this.participants.values()) {
            if (p.videoSsrc === ssrc || p.screenSsrc === ssrc) return true;
        }
        return false;
    }

    private handleWelcome(msg: Buffer): void {
        try {
            const welcome = JSON.parse(msg.slice(1).toString("utf8")) as any;
            this.cleanupTimers();

            this.sessionId = welcome.sessionId ?? welcome.session_id;
            this.audioSsrc = welcome.ssrc;
            this.videoSsrc = welcome.videoSsrc ?? welcome.video_ssrc;
            this.screenSsrc = welcome.screenSsrc ?? welcome.screen_ssrc;
            this.participants.clear();
            this.ssrcToUserId.clear();

            const rawParticipants = Array.isArray(welcome.participants) ? welcome.participants : [];
            for (const raw of rawParticipants) {
                const userId = raw.user_id || raw.userId;
                if (!userId) continue;

                const ssrc = (raw.ssrc ?? 0) >>> 0;
                const videoSsrc = (raw.video_ssrc ?? raw.videoSsrc ?? 0) >>> 0;
                const screenSsrc = (raw.screen_ssrc ?? raw.screenSsrc ?? 0) >>> 0;

                const p: ParticipantInfo = {
                    userId,
                    ssrc,
                    videoSsrc: videoSsrc || undefined,
                    screenSsrc: screenSsrc || undefined,
                    muted: !!(raw.muted),
                    videoEnabled: !!(raw.video_enabled ?? raw.videoEnabled),
                    screenSharing: !!(raw.screen_sharing ?? raw.screenSharing),
                    speaking: !!(raw.speaking),
                    displayName: raw.display_name || raw.displayName,
                    avatarUrl: raw.avatar_url || raw.avatarUrl,
                    quality: raw.quality,
                    rttMs: raw.rtt_ms ?? raw.rttMs,
                    packetLoss: raw.packet_loss ?? raw.packetLoss,
                    jitterMs: raw.jitter_ms ?? raw.jitterMs,
                };
                this.participants.set(userId, p);
                if (ssrc) this.ssrcToUserId.set(ssrc, userId);
                if (videoSsrc) this.ssrcToUserId.set(videoSsrc, userId);
                if (screenSsrc) this.ssrcToUserId.set(screenSsrc, userId);
            }

            this.connected = true;
            this.baseTimeMs = Date.now();
            this.lastPongAt = Date.now();
            this.missedPongs = 0;
            this.startPingInterval(welcome.pingIntervalMs ?? welcome.ping_interval_ms ?? 5000);
            this.startRRInterval(welcome.rrIntervalMs ?? welcome.rr_interval_ms ?? 250);
            this.startQualityInterval();
            this.startNackInterval();
            this.pushSubscriptions();

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

    private startQualityInterval(): void {
        this.qualityInterval = setInterval(() => {
            if (!this.connected || !this.audioSsrc) return;
            const agg = this.stats.getStats();
            const rtt = agg.rttMs;
            const avgLoss = this.stats.getAverageLoss();
            const avgJitter = this.stats.getAverageJitter();
            this.localQuality = this.stats.calculateLocalQuality(rtt);

            const perPeer = new Map<number, number>();
            for (const [ssrc] of this.ssrcToUserId) {
                if (ssrc === this.audioSsrc || ssrc === this.videoSsrc || ssrc === this.screenSsrc) continue;
                perPeer.set(ssrc, this.stats.calculateStreamQuality(ssrc));
            }

            this.emit("quality", {
                local: this.localQuality,
                rttMs: rtt,
                peers: Object.fromEntries(perPeer),
                peerUsers: Object.fromEntries(this.peerQualities),
            });

            this.send(Buffer.from(buildQualityReportPacket({
                ssrc: this.audioSsrc,
                user_id: this.config.userId,
                room_id: this.config.roomId,
                quality: this.localQuality,
                rtt_ms: rtt,
                packet_loss: avgLoss,
                jitter_ms: avgJitter,
            })));
        }, 2000);
    }

    private handleQualityReport(msg: Buffer): void {
        try {
            const data = JSON.parse(msg.slice(1).toString("utf8"));
            const userId = data.user_id || data.userId;
            if (!userId) return;
            const quality = data.quality ?? 0;
            this.peerQualities.set(userId, quality);
            const existing = this.participants.get(userId);
            if (existing) {
                this.participants.set(userId, {
                    ...existing,
                    quality,
                    rttMs: data.rtt_ms,
                    packetLoss: data.packet_loss,
                    jitterMs: data.jitter_ms,
                });
            }
            this.emit("peer-quality", { userId, quality, rttMs: data.rtt_ms, packetLoss: data.packet_loss, jitterMs: data.jitter_ms });
        } catch {}
    }

    private replayKey(keyId: number, ssrc: number): string { return `${keyId & 0xff}:${ssrc >>> 0}`; }

    private handleMedia(msg: Buffer): void {
        if (msg.length < MEDIA_HEADER_SIZE) return;
        const header = decodeMediaHeader(new Uint8Array(msg.buffer, msg.byteOffset, MEDIA_HEADER_SIZE));
        if (!header) return;
        const ssrc = header.ssrc >>> 0;
        const keyId = header.keyId & 0xff;
        const counter = header.counter;
        const isVideo = header.type === PacketType.VIDEO;

        if (ssrc === this.audioSsrc || ssrc === this.videoSsrc || ssrc === this.screenSsrc) return;

        let rf = this.replayFilters.get(this.replayKey(keyId, ssrc));
        if (!rf) {
            rf = new ReplayFilter();
            this.replayFilters.set(this.replayKey(keyId, ssrc), rf);
        }
        if (!rf.accept(counter)) return;

        const aad = Buffer.from(msg.buffer, msg.byteOffset, MEDIA_HEADER_SIZE);
        const ciphertext = Buffer.from(msg.buffer, msg.byteOffset + MEDIA_HEADER_SIZE);
        if (ciphertext.length === 0) return;

        const plaintext = this.keyRing.open(aad, ciphertext, keyId, ssrc, counter);
        if (!plaintext) {
            this.decryptFail++;
            this.emit("decrypt-error", { ssrc, keyId, sequence: header.sequence, decryptOk: this.decryptOk, decryptFail: this.decryptFail });
            return;
        }
        this.decryptOk++;

        if (!this.ssrcToUserId.has(ssrc)) {
            for (const [userId, p] of this.participants) {
                if (p.ssrc === ssrc || p.videoSsrc === ssrc || p.screenSsrc === ssrc) {
                    this.ssrcToUserId.set(ssrc, userId);
                    break;
                }
            }
        }

        this.stats.recordPacketReceived(ssrc, header.sequence, header.timestamp, isVideo ? 90000 : 48000, msg.length);
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

    private handleSpeaking(msg: Buffer): void {
        try {
            const data = JSON.parse(msg.slice(1).toString("utf8"));
            const userId = data.userId || data.user_id;
            const ssrc = (data.ssrc ?? 0) >>> 0;
            const videoSsrc = (data.videoSsrc ?? data.video_ssrc ?? 0) >>> 0;
            const screenSsrc = (data.screenSsrc ?? data.screen_ssrc ?? 0) >>> 0;
            if (userId) {
                if (ssrc) this.ssrcToUserId.set(ssrc, userId);
                if (videoSsrc) this.ssrcToUserId.set(videoSsrc, userId);
                if (screenSsrc) this.ssrcToUserId.set(screenSsrc, userId);
                const existing = this.participants.get(userId);
                if (existing) this.participants.set(userId, { ...existing, speaking: !!data.speaking });
            }
            this.emit("speaking", { ssrc, userId, speaking: !!data.speaking });
        } catch {}
    }

    private handleMediaState(msg: Buffer): void {
        try {
            const data = JSON.parse(msg.slice(1).toString("utf8"));
            const userId = data.userId || data.user_id;
            if (!userId) return;
            const ssrc = (data.ssrc ?? 0) >>> 0;
            const videoSsrc = (data.videoSsrc ?? data.video_ssrc ?? 0) >>> 0;
            const screenSsrc = (data.screenSsrc ?? data.screen_ssrc ?? 0) >>> 0;
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
                quality: existing?.quality,
                rttMs: existing?.rttMs,
                packetLoss: existing?.packetLoss,
                jitterMs: existing?.jitterMs,
            };
            this.participants.set(userId, next);
            this.emit("media-state", { ssrc: next.ssrc, videoSsrc: next.videoSsrc, screenSsrc: next.screenSsrc, userId, muted: next.muted, videoEnabled: next.videoEnabled, screenSharing: next.screenSharing });
            this.emit(existing ? "participant-updated" : "participant-joined", next);
        } catch (e) {
            console.error("[VoiceService] Failed to parse MediaState:", e);
        }
    }

    private handleParticipantLeft(msg: Buffer): void {
        try {
            const data = JSON.parse(msg.slice(1).toString("utf8"));
            let userId = data.user_id || data.userId || "";
            const ssrc = (data.ssrc ?? data.audio_ssrc ?? 0) >>> 0;
            const videoSsrc = (data.video_ssrc ?? data.videoSsrc ?? 0) >>> 0;
            const screenSsrc = (data.screen_ssrc ?? data.screenSsrc ?? 0) >>> 0;

            if (!userId) {
                if (ssrc) userId = this.ssrcToUserId.get(ssrc) || "";
                if (!userId && videoSsrc) userId = this.ssrcToUserId.get(videoSsrc) || "";
                if (!userId && screenSsrc) userId = this.ssrcToUserId.get(screenSsrc) || "";
            }
            if (ssrc) this.ssrcToUserId.delete(ssrc);
            if (videoSsrc) this.ssrcToUserId.delete(videoSsrc);
            if (screenSsrc) this.ssrcToUserId.delete(screenSsrc);
            if (userId) this.participants.delete(userId);
            if (ssrc) this.clearPerStreamState(ssrc);
            if (videoSsrc && videoSsrc !== ssrc) this.clearPerStreamState(videoSsrc);
            if (screenSsrc && screenSsrc !== ssrc && screenSsrc !== videoSsrc) this.clearPerStreamState(screenSsrc);
            this.emit("participant-left", { userId, ssrc, videoSsrc, screenSsrc });
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
            this.emit("pli-requested", targetSsrc);
        }
    }

    private handleReceiverReport(msg: Buffer): void {
        if (msg.length < 25) return;
        const view = new DataView(msg.buffer, msg.byteOffset);
        const report = {
            ssrc: view.getUint32(1, false),
            reporterSsrc: view.getUint32(5, false),
            fractionLost: msg[9] / 255,
            totalLost: ((msg[10] << 16) | (msg[11] << 8) | msg[12]) >>> 0,
            highestSeq: view.getUint32(13, false),
            jitter: view.getUint32(17, false),
        };
        this.emit("receiver-report", report);
    }

    sendAudio(audioData: Buffer): void {
        if (!this.connected || !this.audioSsrc || this.localMuted) return;
        const counter = this.audioCounter++;
        const sequence = this.audioSequence++ & 0xffff;
        const timestamp = (((Date.now() - this.baseTimeMs) * 48) >>> 0);
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
        let counter: bigint;
        if (source === 'screen') {
            if (!this.screenSsrc || !this.localScreenSharing) return;
            targetSsrc = this.screenSsrc;
            sequence = this.screenSequence;
            counter = this.screenCounter;
        } else {
            if (!this.videoSsrc || !this.localVideoEnabled) return;
            targetSsrc = this.videoSsrc;
            sequence = this.videoSequence;
            counter = this.videoCounter;
        }
        const timestamp = (((Date.now() - this.baseTimeMs) * 90) >>> 0);
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
        if (packet.length > 1200) {
            console.warn(`[VoiceService] Packet exceeds MTU: ${packet.length}`);
            return;
        }
        this.send(packet);
    }

    setSpeaking(speaking: boolean): void {
        if (!this.connected || !this.audioSsrc) return;
        this.emit("local-speaking", speaking);
        this.send(Buffer.from(buildSpeakingPacket({
            ssrc: this.audioSsrc,
            video_ssrc: this.videoSsrc,
            screen_ssrc: this.screenSsrc,
            user_id: this.config.userId,
            room_id: this.config.roomId,
            speaking,
        })));
    }

    setMediaState(muted: boolean, videoEnabled: boolean, screenSharing: boolean): void {
        if (!this.connected || !this.audioSsrc) return;
        this.localMuted = muted;
        this.localVideoEnabled = videoEnabled;
        this.localScreenSharing = screenSharing;
        this.send(Buffer.from(buildMediaStatePacket({
            ssrc: this.audioSsrc,
            video_ssrc: this.videoSsrc,
            screen_ssrc: this.screenSsrc,
            user_id: this.config.userId,
            room_id: this.config.roomId,
            muted,
            video_enabled: videoEnabled,
            screen_sharing: screenSharing,
        })));
    }

    requestKeyframe(targetSsrc: number): void {
        if (!this.connected) return;
        if (this.pliTracker.shouldSendPli(targetSsrc)) {
            this.send(Buffer.from(buildPliPacket(targetSsrc)));
        }
    }

    setSubscriptions(ssrcs: number[]): void {
        this.currentSubscriptions = [...ssrcs];
        if (!this.connected) return;
        this.pushSubscriptions();
    }

    private pushSubscriptions(): void {
        if (!this.connected) return;
        this.send(Buffer.from(buildSubscribePacket(this.currentSubscriptions)));
    }

    private missedPongs = 0;
    private static readonly MAX_MISSED_PONGS = 5;

    private startPingInterval(intervalMs: number): void {
        this.missedPongs = 0;

        this.pingInterval = setInterval(() => {
            if (!this.connected) return;

            this.missedPongs++;

            if (this.missedPongs >= VoiceService.MAX_MISSED_PONGS) {
                this.missedPongs = 0;
                this.emit("error", new Error("Voice heartbeat timed out"));
                return;
            }

            const buf = Buffer.alloc(9);
            buf[0] = 0x05;
            buf.writeBigUInt64BE(BigInt(Date.now()), 1);
            this.send(buf);
        }, intervalMs);
    }

    private handlePong(msg: Buffer): void {
        this.missedPongs = 0;
        this.lastPongAt = Date.now();

        if (msg.length >= 9) {
            try {
                const view = new DataView(msg.buffer, msg.byteOffset, msg.byteLength);
                const sentTime = Number(view.getBigUint64(1, false));
                if (sentTime > 0 && sentTime < Date.now() + 60000) {
                    const rtt = Date.now() - sentTime;
                    this.stats.recordRtt(rtt);
                    this.emit("rtt", rtt);
                    return;
                }
            } catch {}
        }

        this.stats.recordRtt(0);
    }

    private startRRInterval(intervalMs: number): void {
        this.rrInterval = setInterval(() => {
            if (!this.connected || !this.audioSsrc) return;
            for (const [ssrc] of this.ssrcToUserId) {
                if (ssrc === this.audioSsrc || ssrc === this.videoSsrc || ssrc === this.screenSsrc) continue;
                const streamStats = this.stats.getStreamStats(ssrc);
                if (!streamStats) continue;
                const fractionLost = this.stats.getFractionLost(ssrc);
                this.send(Buffer.from(buildReceiverReport(
                    ssrc,
                    this.audioSsrc!,
                    fractionLost,
                    streamStats.packetsLost,
                    streamStats.highestSeq,
                    Math.floor(streamStats.jitterMs)
                )));
            }
        }, intervalMs);
    }

    private send(data: Buffer): void {
        if (!this.socket) return;
        this.socket.send(data, 0, data.length, this.config.endpoint.port, this.config.endpoint.host, (err) => {
            if (err) this.emit("error", err);
        });
    }

    isConnected(): boolean { return this.connected; }
    getSSRC(): number | undefined { return this.audioSsrc; }
    getVideoSSRC(): number | undefined { return this.videoSsrc; }
    getScreenSSRC(): number | undefined { return this.screenSsrc; }
    getSessionId(): number | undefined { return this.sessionId; }
    getParticipants(): ParticipantInfo[] { return Array.from(this.participants.values()); }
    getSsrcToUserIdMap(): Map<number, string> { return new Map(this.ssrcToUserId); }
    getStats() { return this.stats.getStats(); }
    getLocalQuality(): number { return this.localQuality; }
}
