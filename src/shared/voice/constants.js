"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_FRAG_PAYLOAD = exports.MTU = exports.AUTH_TAG_SIZE = exports.KEY_SIZE = exports.NONCE_BASE_SIZE = exports.NONCE_SIZE = exports.REPLAY_WINDOW_SIZE = exports.MAX_UDP_PAYLOAD = exports.FRAG_HEADER_SIZE = exports.MEDIA_HEADER_SIZE = exports.CodecType = exports.PacketFlags = exports.PacketType = exports.PROTOCOL_VERSION = void 0;
exports.PROTOCOL_VERSION = 1;
exports.PacketType = {
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
};
exports.PacketFlags = {
    MARKER: 0x01,
    KEYFRAME: 0x02,
    MUTED: 0x04,
    SPEAKING: 0x08,
};
exports.CodecType = {
    OPUS: 1,
    H264: 2,
    VP8: 3,
};
exports.MEDIA_HEADER_SIZE = 24;
exports.FRAG_HEADER_SIZE = 12;
exports.MAX_UDP_PAYLOAD = 1200;
exports.REPLAY_WINDOW_SIZE = 256;
exports.NONCE_SIZE = 12;
exports.NONCE_BASE_SIZE = 4;
exports.KEY_SIZE = 32;
exports.AUTH_TAG_SIZE = 16;
exports.MTU = 1200;
exports.MAX_FRAG_PAYLOAD = exports.MTU - exports.MEDIA_HEADER_SIZE - exports.AUTH_TAG_SIZE - 2;
