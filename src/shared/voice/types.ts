import { CodecType, PacketType } from "./constants";

export interface CryptoConfig {
    aead: "aes-256-gcm";
    keyId: number;
    keyMaterial: Uint8Array;
}

export interface ParticipantInfo {
    userId: string;
    ssrc: number;
    videoSsrc?: number;
    screenSsrc?: number;
    muted: boolean;
    videoEnabled: boolean;
    screenSharing: boolean;
    displayName?: string;
    avatarUrl?: string;
    speaking?: boolean;
}

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

export interface WelcomePayload {
    sessionId?: number;
    ssrc?: number;
    videoSsrc?: number;
    screenSsrc?: number;
    participants?: any[];
}

export interface MediaHeader {
    type: number;
    flags: number;
    keyId: number;
    codec: number;
    sequence: number;
    timestamp: number;
    ssrc: number;
    counter: bigint;
}

export interface FragmentHeader {
    frameId: number;
    fragIndex: number;
    fragCount: number;
    frameLength: number;
}

export interface ParticipantLeftPayload {
    userId?: string;
    user_id?: string;
    ssrc?: number;
    audio_ssrc?: number;
    videoSsrc?: number;
    video_ssrc?: number;
}