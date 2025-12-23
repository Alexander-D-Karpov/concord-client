"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.encodeMediaHeader = encodeMediaHeader;
exports.decodeMediaHeader = decodeMediaHeader;
exports.encodeFragmentHeader = encodeFragmentHeader;
exports.decodeFragmentHeader = decodeFragmentHeader;
exports.buildHelloPacket = buildHelloPacket;
exports.buildPingPacket = buildPingPacket;
exports.buildByePacket = buildByePacket;
exports.buildSpeakingPacket = buildSpeakingPacket;
exports.buildMediaStatePacket = buildMediaStatePacket;
exports.buildNackPacket = buildNackPacket;
exports.parseNackPacket = parseNackPacket;
exports.buildPliPacket = buildPliPacket;
exports.buildReceiverReport = buildReceiverReport;
const constants_1 = require("./constants");
function encodeMediaHeader(header) {
    const buf = new Uint8Array(constants_1.MEDIA_HEADER_SIZE);
    const view = new DataView(buf.buffer);
    view.setUint8(0, header.type);
    view.setUint8(1, header.flags);
    view.setUint8(2, header.keyId);
    view.setUint8(3, header.codec);
    view.setUint16(4, header.sequence, false);
    view.setUint32(6, header.timestamp, false);
    view.setUint32(10, header.ssrc, false);
    view.setBigUint64(14, header.counter, false);
    view.setUint16(22, 0, false);
    return buf;
}
function decodeMediaHeader(data) {
    if (data.length < constants_1.MEDIA_HEADER_SIZE)
        return null;
    const view = new DataView(data.buffer, data.byteOffset);
    return {
        type: view.getUint8(0),
        flags: view.getUint8(1),
        keyId: view.getUint8(2),
        codec: view.getUint8(3),
        sequence: view.getUint16(4, false),
        timestamp: view.getUint32(6, false),
        ssrc: view.getUint32(10, false),
        counter: view.getBigUint64(14, false),
    };
}
function encodeFragmentHeader(header) {
    const buf = new Uint8Array(constants_1.FRAG_HEADER_SIZE);
    const view = new DataView(buf.buffer);
    view.setUint32(0, header.frameId, false);
    view.setUint16(4, header.fragIndex, false);
    view.setUint16(6, header.fragCount, false);
    view.setUint32(8, header.frameLength, false);
    return buf;
}
function decodeFragmentHeader(data) {
    if (data.length < constants_1.FRAG_HEADER_SIZE)
        return null;
    const view = new DataView(data.buffer, data.byteOffset);
    return {
        frameId: view.getUint32(0, false),
        fragIndex: view.getUint16(4, false),
        fragCount: view.getUint16(6, false),
        frameLength: view.getUint32(8, false),
    };
}
function buildHelloPacket(payload) {
    const json = JSON.stringify(payload);
    const jsonBytes = new TextEncoder().encode(json);
    const packet = new Uint8Array(1 + jsonBytes.length);
    packet[0] = constants_1.PacketType.HELLO;
    packet.set(jsonBytes, 1);
    return packet;
}
function buildPingPacket() {
    const packet = new Uint8Array(9);
    const view = new DataView(packet.buffer);
    packet[0] = constants_1.PacketType.PING;
    view.setBigUint64(1, BigInt(Date.now()), false);
    return packet;
}
function buildByePacket(ssrc) {
    const packet = new Uint8Array(5);
    const view = new DataView(packet.buffer);
    packet[0] = constants_1.PacketType.BYE;
    view.setUint32(1, ssrc, false);
    return packet;
}
function buildSpeakingPacket(payload) {
    const json = JSON.stringify(payload);
    const jsonBytes = new TextEncoder().encode(json);
    const packet = new Uint8Array(1 + jsonBytes.length);
    packet[0] = constants_1.PacketType.SPEAKING;
    packet.set(jsonBytes, 1);
    return packet;
}
function buildMediaStatePacket(payload) {
    const json = JSON.stringify(payload);
    const jsonBytes = new TextEncoder().encode(json);
    const packet = new Uint8Array(1 + jsonBytes.length);
    packet[0] = constants_1.PacketType.MEDIA_STATE;
    packet.set(jsonBytes, 1);
    return packet;
}
function buildNackPacket(ssrc, sequences) {
    const packet = new Uint8Array(1 + 4 + 2 + sequences.length * 2);
    const view = new DataView(packet.buffer);
    packet[0] = constants_1.PacketType.NACK;
    view.setUint32(1, ssrc, false);
    view.setUint16(5, sequences.length, false);
    for (let i = 0; i < sequences.length; i++) {
        view.setUint16(7 + i * 2, sequences[i], false);
    }
    return packet;
}
function parseNackPacket(data) {
    if (data.length < 7)
        return null;
    const view = new DataView(data.buffer, data.byteOffset);
    const ssrc = view.getUint32(1, false);
    const count = view.getUint16(5, false);
    if (data.length < 7 + count * 2)
        return null;
    const sequences = [];
    for (let i = 0; i < count; i++) {
        sequences.push(view.getUint16(7 + i * 2, false));
    }
    return { ssrc, sequences };
}
function buildPliPacket(ssrc) {
    const packet = new Uint8Array(5);
    const view = new DataView(packet.buffer);
    packet[0] = constants_1.PacketType.PLI;
    view.setUint32(1, ssrc, false);
    return packet;
}
function buildReceiverReport(ssrc, reporterSsrc, fractionLost, totalLost, highestSeq, jitter) {
    const packet = new Uint8Array(25);
    const view = new DataView(packet.buffer);
    packet[0] = constants_1.PacketType.RR;
    view.setUint32(1, ssrc, false);
    view.setUint32(5, reporterSsrc, false);
    view.setUint8(9, Math.floor(fractionLost * 255));
    view.setUint32(10, totalLost & 0xffffff, false);
    view.setUint32(13, highestSeq, false);
    view.setUint32(17, jitter, false);
    view.setUint32(21, 0, false);
    return packet;
}
