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