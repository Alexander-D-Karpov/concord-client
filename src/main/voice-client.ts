import * as dgram from 'dgram';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface VoiceConfig {
    endpoint: { host: string; port: number };
    serverId: string;
    voiceToken: string;
    codec: { audio: string; video?: string };
    crypto: {
        aead: string;
        key_id: Buffer;
        key_material: Buffer;
        nonce_base: Buffer;
    };
    participants: Array<{
        user_id: string;
        ssrc: number;
        muted: boolean;
        video_enabled: boolean;
    }>;
}

enum PacketType {
    HELLO = 0x01,
    WELCOME = 0x02,
    AUDIO = 0x03,
    VIDEO = 0x04,
    PING = 0x05,
    PONG = 0x06,
    BYE = 0x07,
    SPEAKING = 0x08,
}

export class VoiceClient extends EventEmitter {
    private socket?: dgram.Socket;
    private config: VoiceConfig;
    private endpoint: { host: string; port: number };
    private connected = false;
    private ssrc?: number;
    private audioSequence = 0;
    private audioTimestamp = 0;
    private heartbeatInterval?: NodeJS.Timeout;
    private speaking = false;

    constructor(config: VoiceConfig) {
        super();
        this.config = config;
        this.endpoint = this.parseEndpoint(config.endpoint);
    }

    private parseEndpoint(endpoint: { host: string; port: number }): { host: string; port: number } {
        let host = endpoint.host.replace(/^(udp|tcp):\/\//, '');
        let port = endpoint.port;
        const colonIndex = host.indexOf(':');
        if (colonIndex !== -1) {
            const p = parseInt(host.substring(colonIndex + 1), 10);
            if (!isNaN(p)) port = p;
            host = host.substring(0, colonIndex);
        }
        return { host, port };
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = dgram.createSocket('udp4');

            this.socket.on('error', (err) => {
                this.emit('error', err);
            });

            this.socket.on('message', (msg) => this.handleMessage(msg));

            this.socket.bind(() => {
                this.sendHello();

                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000);

                this.once('welcome', () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.startHeartbeat();
                    resolve();
                });
            });
        });
    }

    private sendHello(): void {
        const payload = Buffer.from(JSON.stringify({
            token: this.config.voiceToken,
            protocol: 1,
            codec: this.config.codec.audio,
        }));
        const packet = Buffer.concat([Buffer.from([PacketType.HELLO]), payload]);
        this.send(packet);
    }

    private handleMessage(msg: Buffer): void {
        if (msg.length < 1) return;
        const type = msg.readUInt8(0);

        switch (type) {
            case PacketType.WELCOME:
                try {
                    const welcome = JSON.parse(msg.slice(1).toString());
                    this.ssrc = welcome.ssrc;
                    this.emit('welcome', welcome);
                } catch {}
                break;
            case PacketType.PONG:
                break;
            case PacketType.SPEAKING:
                try {
                    this.emit('speaking', JSON.parse(msg.slice(1).toString()));
                } catch {}
                break;
            case PacketType.AUDIO:
                this.handleAudio(msg);
                break;
        }
    }

    private handleAudio(data: Buffer): void {
        if (data.length < 20) return;
        try {
            const sequence = data.readUInt16BE(2);
            const timestamp = data.readUInt32BE(4);
            const ssrc = data.readUInt32BE(8);
            const encrypted = data.slice(20);
            const decrypted = this.decrypt(encrypted, sequence, timestamp, ssrc);
            this.emit('audio', { ssrc, sequence, timestamp, data: decrypted });
        } catch {}
    }

    private decrypt(data: Buffer, sequence: number, timestamp: number, ssrc: number): Buffer {
        const { key_material } = this.config.crypto;
        const authTag = data.slice(-16);
        const encrypted = data.slice(0, -16);
        const nonce = Buffer.alloc(24);
        nonce.writeUInt32BE(ssrc, 0);
        nonce.writeUInt32BE(timestamp, 4);
        nonce.writeUInt16BE(sequence, 8);
        const decipher = crypto.createDecipheriv('chacha20-poly1305', key_material, nonce, { authTagLength: 16 });
        decipher.setAuthTag(authTag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }

    private encrypt(data: Buffer, sequence: number, timestamp: number): Buffer {
        const { key_material } = this.config.crypto;
        if (!this.ssrc) throw new Error('SSRC not assigned');
        const nonce = Buffer.alloc(24);
        nonce.writeUInt32BE(this.ssrc, 0);
        nonce.writeUInt32BE(timestamp, 4);
        nonce.writeUInt16BE(sequence, 8);
        const cipher = crypto.createCipheriv('chacha20-poly1305', key_material, nonce, { authTagLength: 16 });
        return Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
    }

    sendAudio(audioData: Buffer): void {
        if (!this.connected || !this.ssrc) return;

        const encrypted = this.encrypt(audioData, this.audioSequence, this.audioTimestamp);
        const header = Buffer.allocUnsafe(20);
        header.writeUInt8(PacketType.AUDIO, 0);
        header.writeUInt8(0, 1);
        header.writeUInt16BE(this.audioSequence, 2);
        header.writeUInt32BE(this.audioTimestamp, 4);
        header.writeUInt32BE(this.ssrc, 8);
        header.fill(0, 12, 20);

        this.send(Buffer.concat([header, encrypted]));
        this.audioSequence = (this.audioSequence + 1) & 0xFFFF;
        this.audioTimestamp += 960;
    }

    setSpeaking(speaking: boolean): void {
        if (this.speaking === speaking || !this.ssrc) return;
        this.speaking = speaking;
        const payload = Buffer.from(JSON.stringify({ ssrc: this.ssrc, speaking }));
        this.send(Buffer.concat([Buffer.from([PacketType.SPEAKING]), payload]));
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            const packet = Buffer.allocUnsafe(9);
            packet.writeUInt8(PacketType.PING, 0);
            packet.writeBigUInt64BE(BigInt(Date.now()), 1);
            this.send(packet);
        }, 15000);
    }

    disconnect(): void {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        if (this.socket && this.connected && this.ssrc) {
            const packet = Buffer.allocUnsafe(5);
            packet.writeUInt8(PacketType.BYE, 0);
            packet.writeUInt32BE(this.ssrc, 1);
            this.send(packet);
        }
        this.socket?.close();
        this.socket = undefined;
        this.connected = false;
        this.emit('disconnect');
    }

    private send(data: Buffer): void {
        this.socket?.send(data, 0, data.length, this.endpoint.port, this.endpoint.host);
    }
}