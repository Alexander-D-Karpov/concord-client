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
    MTU,
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

    private audioSequence = 0;
    private videoSequence = 0;

    private audioTimestamp = 0; // 48kHz samples
    private videoTimestamp = 0; // 90kHz ticks

    private audioCounter = 0n;
    private videoCounter = 0n;

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

        if (this.socket && this.connected && this.audioSsrc) {
            const packet = buildByePacket(this.audioSsrc);
            this.send(Buffer.from(packet));
        }

        this.closeSocket();

        this.connected = false;
        this.connectingPromise = null;

        this.sessionId = undefined;
        this.audioSsrc = undefined;
        this.videoSsrc = undefined;

        this.participants.clear();
        this.ssrcToUserId.clear();

        this.replayFilters.clear();
        this.reassemblers.clear();

        this.retransmitCache.clear();
        this.nackTracker.clear();
        this.pliTracker.clear();
        this.stats.reset();

        this.seenFirstVideoFrom.clear();

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

            const participants = Array.isArray(welcome.participants) ? welcome.participants : [];
            const participantsCount = participants.length;

            console.log("[VoiceService] WELCOME received", {
                ssrc: this.audioSsrc ?? 0,
                video_ssrc: this.videoSsrc ?? 0,
                participants_count: participantsCount,
            });

            this.participants.clear();
            this.ssrcToUserId.clear();

            for (const raw of participants) {
                const userId = raw.userId ?? raw.user_id;
                if (!userId) continue;

                const audio = raw.ssrc ?? raw.audioSsrc ?? raw.audio_ssrc ?? 0;
                const video = raw.videoSsrc ?? raw.video_ssrc ?? 0;

                const p: ParticipantInfo = {
                    userId,
                    ssrc: audio >>> 0,
                    videoSsrc: (video >>> 0) || undefined,
                    muted: !!(raw.muted ?? false),
                    videoEnabled: !!(raw.videoEnabled ?? raw.video_enabled ?? false),
                    displayName: raw.displayName ?? raw.display_name,
                    avatarUrl: raw.avatarUrl ?? raw.avatar_url,
                };

                this.participants.set(userId, p);

                if (p.ssrc) this.ssrcToUserId.set(p.ssrc, userId);
                if (p.videoSsrc) this.ssrcToUserId.set(p.videoSsrc, userId);
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
        if (msg.length < MEDIA_HEADER_SIZE) return;

        const header = decodeMediaHeader(new Uint8Array(msg.buffer, msg.byteOffset, MEDIA_HEADER_SIZE));
        if (!header) return;

        const ssrc = header.ssrc >>> 0;
        const keyId = header.keyId & 0xff;
        const counter = header.counter;
        const isVideo = header.type === PacketType.VIDEO;

        const rk = this.replayKey(keyId, ssrc);
        let rf = this.replayFilters.get(rk);
        if (!rf) {
            rf = new ReplayFilter();
            this.replayFilters.set(rk, rf);
        }

        if (!rf.accept(counter)) return;

        const aad = Buffer.from(msg.buffer, msg.byteOffset, MEDIA_HEADER_SIZE);
        const ciphertext = Buffer.from(msg.buffer, msg.byteOffset + MEDIA_HEADER_SIZE);

        const plaintext = this.keyRing.open(aad, ciphertext, keyId, ssrc, counter);

        if (!plaintext) {
            this.decryptFail++;
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

        if (isVideo && !this.seenFirstVideoFrom.has(ssrc)) {
            this.seenFirstVideoFrom.add(ssrc);
            console.log("[VoiceService] first video packet received from ssrc=", ssrc);
        }

        const timestampHz = isVideo ? 90000 : 48000;
        this.stats.recordPacketReceived(ssrc, header.sequence, header.timestamp, timestampHz, msg.length);

        if (ssrc !== this.audioSsrc && ssrc !== this.videoSsrc) {
            const missing = this.stats.getMissingSequences(ssrc, 20);
            if (missing.length > 0 && this.nackTracker.shouldSendNack(ssrc)) {
                const nack = buildNackPacket(ssrc, missing);
                this.send(Buffer.from(nack));
            }
        }

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

            if (userId) {
                if (ssrc) this.ssrcToUserId.set(ssrc, userId);
                if (videoSsrc) this.ssrcToUserId.set(videoSsrc, userId);
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

            if (ssrc) this.ssrcToUserId.set(ssrc, userId);
            if (videoSsrc) this.ssrcToUserId.set(videoSsrc, userId);

            const existing = this.participants.get(userId);

            const next: ParticipantInfo = {
                userId,
                ssrc: ssrc || existing?.ssrc || 0,
                videoSsrc: videoSsrc || existing?.videoSsrc,
                muted: !!(data.muted ?? existing?.muted ?? false),
                videoEnabled: !!(data.videoEnabled ?? data.video_enabled ?? existing?.videoEnabled ?? false),
                displayName: existing?.displayName,
                avatarUrl: existing?.avatarUrl,
                speaking: existing?.speaking,
            };

            this.participants.set(userId, next);

            this.emit("media-state", {
                ssrc: next.ssrc,
                videoSsrc: next.videoSsrc,
                userId,
                muted: next.muted,
                videoEnabled: next.videoEnabled,
            });

            if (!existing) {
                this.emit("participant-joined", next);
            } else {
                this.emit("participant-updated", next);
            }
        } catch {}
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

        if (targetSsrc !== this.audioSsrc && targetSsrc !== this.videoSsrc) return;

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

        if (targetSsrc === this.videoSsrc) {
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

    sendVideo(videoData: Buffer, isKeyframe: boolean): void {
        if (!this.connected || !this.videoSsrc) return;

        const timestamp = this.videoTimestamp >>> 0;
        this.videoTimestamp = (this.videoTimestamp + 3000) >>> 0;

        const fragments = this.fragmenter.fragment(videoData, isKeyframe);
        for (const fragPayload of fragments) {
            this.sendVideoPacket(fragPayload, timestamp, isKeyframe);
        }
    }

    private sendVideoPacket(payload: Buffer, timestamp: number, isKeyframe: boolean): void {
        const counter = this.videoCounter++;
        const sequence = this.videoSequence++ & 0xffff;

        const header: MediaHeader = {
            type: PacketType.VIDEO,
            flags: isKeyframe ? PacketFlags.KEYFRAME : 0,
            keyId: this.config.crypto.keyId,
            codec: CodecType.H264,
            sequence,
            timestamp,
            ssrc: this.videoSsrc!,
            counter,
        };

        const headerBytes = Buffer.from(encodeMediaHeader(header));
        const enc = this.keyRing.seal(headerBytes, payload, header.keyId, header.ssrc, counter);

        const packet = Buffer.concat([headerBytes, enc]);
        this.retransmitCache.store(header.ssrc, sequence, packet);
        this.stats.recordPacketSent(packet.length);

        if (packet.length > MTU) return;

        this.send(packet);
    }

    setSpeaking(speaking: boolean): void {
        if (!this.connected || !this.audioSsrc) return;

        const payload = {
            ssrc: this.audioSsrc,
            video_ssrc: this.videoSsrc,
            user_id: this.config.userId,
            room_id: this.config.roomId,
            speaking,
        };

        const packet = buildSpeakingPacket(payload);
        this.send(Buffer.from(packet));
    }

    setMediaState(muted: boolean, videoEnabled: boolean): void {
        if (!this.connected || !this.audioSsrc) return;

        const payload = {
            ssrc: this.audioSsrc,
            video_ssrc: this.videoSsrc,
            user_id: this.config.userId,
            room_id: this.config.roomId,
            muted,
            video_enabled: videoEnabled,
        };

        const packet = buildMediaStatePacket(payload);
        this.send(Buffer.from(packet));
    }

    requestKeyframe(targetVideoSsrc: number): void {
        if (!this.connected) return;

        if (this.pliTracker.shouldSendPli(targetVideoSsrc)) {
            const packet = buildPliPacket(targetVideoSsrc);
            this.send(Buffer.from(packet));
        }
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
                if (ssrc === this.audioSsrc || ssrc === this.videoSsrc) continue;

                const streamStats = this.stats.getStreamStats(ssrc);
                if (!streamStats) continue;

                const fractionLost = this.stats.getFractionLost(ssrc);

                const packet = buildReceiverReport(
                    ssrc,
                    this.audioSsrc,
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
