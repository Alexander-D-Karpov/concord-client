export const PROTOCOL_VERSION = 1;

export const AUTH_TAG_SIZE = 16;
export const MEDIA_HEADER_SIZE = 24;
export const FRAG_HEADER_SIZE = 12;
export const MTU = 1200;
export const MAX_FRAG_PAYLOAD = MTU - MEDIA_HEADER_SIZE - FRAG_HEADER_SIZE - AUTH_TAG_SIZE;

export const PacketType = {
    HELLO: 0x01,
    WELCOME: 0x02,
    AUDIO: 0x03,
    VIDEO: 0x04,
    PING: 0x05,
    PONG: 0x06,
    BYE: 0x07,
    SPEAKING: 0x08,
    MEDIA_STATE: 0x09,
    NACK: 0x0a,
    PLI: 0x0b,
    RR: 0x0c,
    PARTICIPANT_LEFT: 0x0d,
    SUBSCRIBE: 0x0e,
    QUALITY_PREF: 0x0f,
    PACKET_TYPE_QUALITY_REPORT: 0x10,
} as const;

export type PacketType = typeof PacketType[keyof typeof PacketType];

export const PacketFlags = {
    KEYFRAME: 0x01,
} as const;

export const CodecType = {
    OPUS: 1,
    H264: 2,
    VP8: 3,
} as const;

export type CodecType = typeof CodecType[keyof typeof CodecType];

export const QualityTier = {
    THUMBNAIL: 0,
    SMALL: 1,
    MEDIUM: 2,
    LARGE: 3,
} as const;

export const QualityTierBitrate: Record<number, { maxWidth: number; maxHeight: number; maxFps: number; bitrate: number }> = {
    [QualityTier.THUMBNAIL]: { maxWidth: 320, maxHeight: 180, maxFps: 15, bitrate: 150_000 },
    [QualityTier.SMALL]:     { maxWidth: 640, maxHeight: 360, maxFps: 24, bitrate: 500_000 },
    [QualityTier.MEDIUM]:    { maxWidth: 960, maxHeight: 540, maxFps: 30, bitrate: 1_500_000 },
    [QualityTier.LARGE]:     { maxWidth: 1280, maxHeight: 720, maxFps: 30, bitrate: 2_500_000 },
};

export const SYNC_DEAD_ZONE_US = 30_000;
export const SYNC_MAX_CORRECTION_US = 80_000;
export const AUDIO_CLOCK_HZ = 48_000;
export const VIDEO_CLOCK_HZ = 90_000;
export const KEYFRAME_INTERVAL_FRAMES = 90;
export const KEYFRAME_INTERVAL_SCREEN = 45;
export const MAX_QP = 36;

export const ConnectionQuality = {
    GOOD: 3,
    MEDIUM: 2,
    POOR: 1,
    UNKNOWN: 0,
} as const;

export type ConnectionQuality = typeof ConnectionQuality[keyof typeof ConnectionQuality];

export const PacketTypeQualityReport = 0x10;