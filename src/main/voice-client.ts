import { EventEmitter } from "events";
import { VoiceService } from "./voice/voice-service";
import type { ParticipantInfo, CryptoConfig } from "../shared/voice/types";

export interface VoiceConfig {
    endpoint: { host: string; port: number };
    serverId: string;
    voiceToken: string;
    roomId: string;
    userId: string;
    codec: { audio: string; video?: string };
    crypto: CryptoConfig;
    participants: ParticipantInfo[];
}

export interface WelcomeParticipant {
    userId: string;
    audioSsrc: number;
    videoSsrc: number;
    muted: boolean;
    videoEnabled: boolean;
}

export class VoiceClient extends EventEmitter {
    private service: VoiceService;

    constructor(config: VoiceConfig) {
        super();

        this.service = new VoiceService({
            ...config,
            crypto: {
                aead: "aes-256-gcm",
                keyId: config.crypto.keyId & 0xff,
                keyMaterial: config.crypto.keyMaterial,
            },
        });

        this.setupEventForwarding();
    }

    private setupEventForwarding(): void {
        this.service.on("connected", (data) => this.emit("welcome", data));
        this.service.on("disconnected", () => this.emit("disconnect"));
        this.service.on("error", (err) => this.emit("error", err));

        this.service.on("audio", (data) => this.emit("audio", data));
        this.service.on("video", (data) => this.emit("video", data));

        this.service.on("speaking", (data) => this.emit("speaking", data));
        this.service.on("media-state", (data) => this.emit("media-state", data));

        this.service.on("participant-joined", (data) => this.emit("participant-joined", data));
        this.service.on("participant-updated", (data) => this.emit("participant-updated", data));
        this.service.on("participant-left", (data) => this.emit("participant-left", data));

        this.service.on("rtt", (rtt) => this.emit("rtt", rtt));
        this.service.on("pli-requested", () => this.emit("pli-requested"));
        this.service.on("decrypt-error", (data) => this.emit("decrypt-error", data));
    }

    async connect(): Promise<void> {
        return this.service.connect();
    }

    disconnect(): void {
        this.service.disconnect();
    }

    sendAudio(audioData: Buffer): void {
        this.service.sendAudio(audioData);
    }

    sendVideo(videoData: Buffer, isKeyframe: boolean): void {
        this.service.sendVideo(videoData, isKeyframe);
    }

    setSpeaking(speaking: boolean): void {
        this.service.setSpeaking(speaking);
    }

    setMediaState(muted: boolean, videoEnabled: boolean): void {
        this.service.setMediaState(muted, videoEnabled);
    }

    requestKeyframe(ssrc: number): void {
        this.service.requestKeyframe(ssrc);
    }

    isConnected(): boolean {
        return this.service.isConnected();
    }

    getSSRC(): number | undefined {
        return this.service.getSSRC();
    }

    getVideoSSRC(): number | undefined {
        return this.service.getVideoSSRC();
    }

    getSessionId(): number | undefined {
        return this.service.getSessionId();
    }

    getParticipants(): WelcomeParticipant[] {
        return this.service.getParticipants().map((p) => ({
            userId: p.userId,
            audioSsrc: p.ssrc || 0,
            videoSsrc: p.videoSsrc || 0,
            muted: p.muted,
            videoEnabled: p.videoEnabled,
        }));
    }

    getSsrcToUserIdMap(): Map<number, string> {
        return this.service.getSsrcToUserIdMap();
    }

    getStats() {
        return this.service.getStats();
    }
}
