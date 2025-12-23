import {MEDIA_HEADER_SIZE, FRAG_HEADER_SIZE, PacketType, CodecType} from './constants';
import type { MediaHeader, FragmentHeader } from './types';

export function encodeMediaHeader(header: MediaHeader): Uint8Array {
    const buf = new ArrayBuffer(MEDIA_HEADER_SIZE);
    const view = new DataView(buf);

    view.setUint8(0, header.type);
    view.setUint8(1, header.flags);
    view.setUint8(2, header.keyId);
    view.setUint8(3, header.codec);
    view.setUint16(4, header.sequence, false);
    view.setUint32(6, header.timestamp, false);
    view.setUint32(10, header.ssrc, false);
    view.setBigUint64(14, header.counter, false);
    view.setUint16(22, 0, false);

    return new Uint8Array(buf);
}

export function decodeMediaHeader(data: Uint8Array): MediaHeader | null {
    if (data.length < MEDIA_HEADER_SIZE) return null;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
        type: view.getUint8(0) as PacketType,
        flags: view.getUint8(1),
        keyId: view.getUint8(2),
        codec: view.getUint8(3) as CodecType,
        sequence: view.getUint16(4, false),
        timestamp: view.getUint32(6, false),
        ssrc: view.getUint32(10, false),
        counter: view.getBigUint64(14, false),
    };
}

export function encodeFragmentHeader(header: FragmentHeader): Uint8Array {
    const buf = new ArrayBuffer(FRAG_HEADER_SIZE);
    const view = new DataView(buf);

    view.setUint32(0, header.frameId, false);
    view.setUint16(4, header.fragIndex, false);
    view.setUint16(6, header.fragCount, false);
    view.setUint32(8, header.frameLength, false);

    return new Uint8Array(buf);
}

export function decodeFragmentHeader(data: Uint8Array): FragmentHeader | null {
    if (data.length < FRAG_HEADER_SIZE) return null;

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    return {
        frameId: view.getUint32(0, false),
        fragIndex: view.getUint16(4, false),
        fragCount: view.getUint16(6, false),
        frameLength: view.getUint32(8, false),
    };
}

export function buildHelloPacket(payload: any): Uint8Array {
    const json = JSON.stringify(payload);
    const jsonBytes = new TextEncoder().encode(json);
    const packet = new Uint8Array(1 + jsonBytes.length);
    packet[0] = PacketType.HELLO;
    packet.set(jsonBytes, 1);
    return packet;
}

export function buildPingPacket(): Uint8Array {
    const packet = new Uint8Array(9);
    const view = new DataView(packet.buffer);
    packet[0] = PacketType.PING;
    view.setBigUint64(1, BigInt(Date.now()), false);
    return packet;
}

export function buildByePacket(ssrc: number): Uint8Array {
    const packet = new Uint8Array(5);
    const view = new DataView(packet.buffer);
    packet[0] = PacketType.BYE;
    view.setUint32(1, ssrc, false);
    return packet;
}

export function buildSpeakingPacket(payload: any): Uint8Array {
    const json = JSON.stringify(payload);
    const jsonBytes = new TextEncoder().encode(json);
    const packet = new Uint8Array(1 + jsonBytes.length);
    packet[0] = PacketType.SPEAKING;
    packet.set(jsonBytes, 1);
    return packet;
}

export function buildMediaStatePacket(payload: any): Uint8Array {
    const json = JSON.stringify(payload);
    const jsonBytes = new TextEncoder().encode(json);
    const packet = new Uint8Array(1 + jsonBytes.length);
    packet[0] = PacketType.MEDIA_STATE;
    packet.set(jsonBytes, 1);
    return packet;
}

export function buildNackPacket(ssrc: number, sequences: number[]): Uint8Array {
    const packet = new Uint8Array(7 + sequences.length * 2);
    const view = new DataView(packet.buffer);
    packet[0] = PacketType.NACK;
    view.setUint32(1, ssrc, false);
    view.setUint16(5, sequences.length, false);
    for (let i = 0; i < sequences.length; i++) {
        view.setUint16(7 + i * 2, sequences[i], false);
    }
    return packet;
}

export function buildPliPacket(ssrc: number): Uint8Array {
    const packet = new Uint8Array(5);
    const view = new DataView(packet.buffer);
    packet[0] = PacketType.PLI;
    view.setUint32(1, ssrc, false);
    return packet;
}

export function buildReceiverReport(
    targetSsrc: number,
    reporterSsrc: number,
    fractionLost: number,
    totalLost: number,
    highestSeq: number,
    jitter: number
): Uint8Array {
    const packet = new Uint8Array(25);
    const view = new DataView(packet.buffer);
    packet[0] = PacketType.RR;
    view.setUint32(1, targetSsrc, false);
    view.setUint32(5, reporterSsrc, false);
    view.setUint8(9, Math.floor(fractionLost * 255));
    view.setUint32(10, totalLost & 0xffffff, false);
    view.setUint32(13, highestSeq, false);
    view.setUint32(17, jitter, false);
    view.setUint32(21, 0, false);
    return packet;
}