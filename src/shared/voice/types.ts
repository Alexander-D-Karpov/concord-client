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
    quality?: number;
    rttMs?: number;
    packetLoss?: number;
    jitterMs?: number;
}

export interface WelcomePayload {
    protocol?: number;
    sessionId?: number;
    session_id?: number;
    roomId?: string;
    room_id?: string;
    userId?: string;
    user_id?: string;
    ssrc: number;
    videoSsrc?: number;
    video_ssrc?: number;
    screenSsrc?: number;
    screen_ssrc?: number;
    pingIntervalMs?: number;
    ping_interval_ms?: number;
    rrIntervalMs?: number;
    rr_interval_ms?: number;
    participants: ParticipantInfo[];
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
    user_id?: string;
    userId?: string;
    room_id?: string;
    roomId?: string;
    ssrc?: number;
    audio_ssrc?: number;
    video_ssrc?: number;
    videoSsrc?: number;
    screen_ssrc?: number;
    screenSsrc?: number;
}
