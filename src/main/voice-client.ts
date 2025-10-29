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

export enum PacketType {
    HELLO = 0x01,
    WELCOME = 0x02,
    AUDIO = 0x03,
    VIDEO = 0x04,
    PING = 0x05,
    PONG = 0x06,
    BYE = 0x07,
    SPEAKING = 0x08,
}

function parseEndpoint(endpoint: { host: string; port: number }): { host: string; port: number } {
    let host = endpoint.host.replace(/^(udp|tcp):\/\//, '');
    let port = endpoint.port;

    const colonIndex = host.indexOf(':');
    if (colonIndex !== -1) {
        const extractedPort = parseInt(host.substring(colonIndex + 1), 10);
        if (!isNaN(extractedPort)) {
            port = extractedPort;
        }
        host = host.substring(0, colonIndex);
    }

    console.log(`[VoiceClient] Parsed endpoint: ${host}:${port} from`, endpoint);
    return { host, port };
}

export class VoiceClient extends EventEmitter {
    private socket?: dgram.Socket;
    private config: VoiceConfig;
    private cleanEndpoint: { host: string; port: number };
    private connected = false;
    private ssrc?: number;
    private audioSequence = 0;
    private videoSequence = 0;
    private audioTimestamp = 0;
    private videoTimestamp = 0;
    private heartbeatInterval?: NodeJS.Timeout;
    private speaking = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private welcomeReceived = false;

    constructor(config: VoiceConfig) {
        super();
        this.config = config;
        this.cleanEndpoint = parseEndpoint(config.endpoint);
        console.log('[VoiceClient] Initialized with config', {
            endpoint: this.cleanEndpoint,
            serverId: config.serverId,
            codecAudio: config.codec.audio,
            participants: config.participants.length,
            voiceTokenPresent: !!config.voiceToken,
            voiceTokenLength: config.voiceToken?.length || 0,
        });

        if (!config.voiceToken || config.voiceToken.length === 0) {
            console.error('[VoiceClient] WARNING: No voice token provided!');
        }
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            console.log('[VoiceClient] Connecting to voice server...', this.cleanEndpoint);

            this.socket = dgram.createSocket('udp4');

            this.socket.on('error', (err) => {
                console.error('[VoiceClient] Socket error:', err);
                this.emit('error', err);

                if (!this.welcomeReceived && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    setTimeout(() => this.reconnect(), 1000 * this.reconnectAttempts);
                }
            });

            this.socket.on('message', (msg) => {
                try {
                    this.handleMessage(msg);
                } catch (err) {
                    console.error('[VoiceClient] Error handling message:', err);
                }
            });

            this.socket.bind(() => {
                const address = this.socket?.address();
                console.log('[VoiceClient] Socket bound to:', address);

                this.sendHello();

                const timeout = setTimeout(() => {
                    if (!this.welcomeReceived) {
                        console.error('[VoiceClient] Connection timeout - no WELCOME received');
                        console.log('[VoiceClient] Debug info:', {
                            endpoint: this.cleanEndpoint,
                            tokenPresent: !!this.config.voiceToken,
                            tokenLength: this.config.voiceToken?.length || 0,
                            tokenPreview: this.config.voiceToken ? this.config.voiceToken.substring(0, 30) + '...' : 'MISSING',
                            codec: this.config.codec.audio,
                        });
                        reject(new Error('Connection timeout: No WELCOME received from voice server'));
                    }
                }, 10000);

                this.once('welcome', () => {
                    clearTimeout(timeout);
                    this.welcomeReceived = true;
                    this.connected = true;
                    this.reconnectAttempts = 0;
                    this.startHeartbeat();
                    console.log('[VoiceClient] Successfully connected!');
                    resolve();
                });
            });
        });
    }

    private sendHello(): void {
        const hello = {
            token: this.config.voiceToken,
            protocol: 1,
            codec: this.config.codec.audio,
        };

        const payload = Buffer.from(JSON.stringify(hello));
        const packet = Buffer.allocUnsafe(1 + payload.length);
        packet.writeUInt8(PacketType.HELLO, 0);
        payload.copy(packet, 1);

        console.log('[VoiceClient] Sending HELLO packet', {
            to: this.cleanEndpoint,
            packetSize: packet.length,
            protocol: hello.protocol,
            codec: hello.codec,
            tokenPresent: !!hello.token,
            tokenLength: hello.token?.length || 0,
        });

        this.send(packet);
    }

    private handleMessage(msg: Buffer): void {
        if (msg.length < 1) return;

        const type = msg.readUInt8(0);
        console.log('[VoiceClient] Received packet type:', type, '(length:', msg.length, ')');

        switch (type) {
            case PacketType.WELCOME:
                this.handleWelcome(msg.slice(1));
                break;
            case PacketType.PONG:
                console.log('[VoiceClient] Received PONG');
                break;
            case PacketType.SPEAKING:
                this.handleSpeaking(msg.slice(1));
                break;
            case PacketType.AUDIO:
                this.handleAudio(msg);
                break;
            case PacketType.VIDEO:
                this.handleVideo(msg);
                break;
            default:
                console.log('[VoiceClient] Unknown packet type:', type);
        }
    }

    private async reconnect(): Promise<void> {
        console.log(`[VoiceClient] Reconnecting... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        try {
            this.disconnect();
            await this.connect();
            this.emit('reconnected');
        } catch (err) {
            console.error('[VoiceClient] Reconnection failed:', err);

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                setTimeout(() => this.reconnect(), 1000 * this.reconnectAttempts);
            } else {
                this.emit('reconnect-failed');
            }
        }
    }

    disconnect(): void {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = undefined;
        }

        if (this.socket && this.connected) {
            this.sendDisconnect();
        }

        if (this.socket) {
            this.socket.close();
            this.socket = undefined;
        }

        this.connected = false;
        this.welcomeReceived = false;
        this.emit('disconnect');
    }

    setSpeaking(speaking: boolean): void {
        if (this.speaking === speaking) return;
        this.speaking = speaking;
        this.sendSpeaking(speaking);
    }

    sendAudio(audioData: Buffer): void {
        if (!this.connected || !this.ssrc) return;

        const packet = this.createPacket(
            PacketType.AUDIO,
            this.audioSequence,
            this.audioTimestamp,
            audioData
        );

        this.audioSequence = (this.audioSequence + 1) & 0xFFFF;
        this.audioTimestamp += 960;

        this.send(packet);
    }

    sendVideo(videoData: Buffer, keyframe: boolean = false): void {
        if (!this.connected || !this.ssrc) return;

        const flags = keyframe ? 0x02 : 0x00;

        const packet = this.createPacket(
            PacketType.VIDEO,
            this.videoSequence,
            this.videoTimestamp,
            videoData,
            flags
        );

        this.videoSequence = (this.videoSequence + 1) & 0xFFFF;
        this.videoTimestamp += 3000;

        this.send(packet);
    }

    private createPacket(
        type: PacketType,
        sequence: number,
        timestamp: number,
        payload: Buffer,
        flags: number = 0
    ): Buffer {
        if (!this.ssrc) throw new Error('SSRC not assigned');

        const encrypted = this.encrypt(payload, sequence, timestamp);

        const header = Buffer.allocUnsafe(20);
        header.writeUInt8(type, 0);
        header.writeUInt8(flags, 1);
        header.writeUInt16BE(sequence, 2);
        header.writeUInt32BE(timestamp, 4);
        header.writeUInt32BE(this.ssrc, 8);
        header.fill(0, 12, 20);

        return Buffer.concat([header, encrypted]);
    }

    private encrypt(data: Buffer, sequence: number, timestamp: number): Buffer {
        const { key_material } = this.config.crypto;

        if (!this.ssrc) throw new Error('SSRC not assigned');

        const nonce = Buffer.alloc(24);
        nonce.writeUInt32BE(this.ssrc, 0);
        nonce.writeUInt32BE(timestamp, 4);
        nonce.writeUInt16BE(sequence, 8);

        const cipher = crypto.createCipheriv('chacha20-poly1305', key_material, nonce, {
            authTagLength: 16,
        });

        const encrypted = Buffer.concat([
            cipher.update(data),
            cipher.final(),
            cipher.getAuthTag(),
        ]);

        return encrypted;
    }

    private decrypt(data: Buffer, sequence: number, timestamp: number, ssrc: number): Buffer {
        const { key_material } = this.config.crypto;

        const authTag = data.slice(-16);
        const encrypted = data.slice(0, -16);

        const nonce = Buffer.alloc(24);
        nonce.writeUInt32BE(ssrc, 0);
        nonce.writeUInt32BE(timestamp, 4);
        nonce.writeUInt16BE(sequence, 8);

        const decipher = crypto.createDecipheriv('chacha20-poly1305', key_material, nonce, {
            authTagLength: 16,
        });

        decipher.setAuthTag(authTag);

        return Buffer.concat([
            decipher.update(encrypted),
            decipher.final(),
        ]);
    }

    private sendDisconnect(): void {
        if (!this.ssrc) return;

        const packet = Buffer.allocUnsafe(13);
        packet.writeUInt8(PacketType.BYE, 0);
        packet.writeUInt32BE(this.ssrc, 1);

        this.send(packet);
    }

    private sendSpeaking(speaking: boolean): void {
        if (!this.ssrc) return;

        const payload = JSON.stringify({
            ssrc: this.ssrc,
            speaking,
        });

        const buf = Buffer.from(payload);
        const packet = Buffer.allocUnsafe(1 + buf.length);
        packet.writeUInt8(PacketType.SPEAKING, 0);
        buf.copy(packet, 1);

        this.send(packet);
    }

    private sendHeartbeat(): void {
        const packet = Buffer.allocUnsafe(9);
        packet.writeUInt8(PacketType.PING, 0);
        packet.writeBigUInt64BE(BigInt(Date.now()), 1);

        this.send(packet);
    }

    private startHeartbeat(): void {
        this.heartbeatInterval = setInterval(() => {
            this.sendHeartbeat();
        }, 15000);
    }

    private handleWelcome(data: Buffer): void {
        try {
            const welcome = JSON.parse(data.toString());
            this.ssrc = welcome.ssrc;
            console.log('[VoiceClient] Received WELCOME, SSRC:', this.ssrc, 'participants:', welcome.participants?.length || 0);
            this.emit('welcome', welcome);
        } catch (err) {
            console.error('[VoiceClient] Failed to parse welcome:', err);
        }
    }

    private handleSpeaking(data: Buffer): void {
        try {
            const speaking = JSON.parse(data.toString());
            this.emit('speaking', speaking);
        } catch (err) {
            console.error('[VoiceClient] Failed to parse speaking:', err);
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

            this.emit('audio', {
                ssrc,
                sequence,
                timestamp,
                data: decrypted,
            });
        } catch (err) {
            console.error('[VoiceClient] Failed to handle audio:', err);
        }
    }

    private handleVideo(data: Buffer): void {
        if (data.length < 20) return;

        try {
            const flags = data.readUInt8(1);
            const sequence = data.readUInt16BE(2);
            const timestamp = data.readUInt32BE(4);
            const ssrc = data.readUInt32BE(8);
            const encrypted = data.slice(20);

            const decrypted = this.decrypt(encrypted, sequence, timestamp, ssrc);

            const keyframe = (flags & 0x02) !== 0;

            this.emit('video', {
                ssrc,
                sequence,
                timestamp,
                keyframe,
                data: decrypted,
            });
        } catch (err) {
            console.error('[VoiceClient] Failed to handle video:', err);
        }
    }

    private send(data: Buffer): void {
        if (!this.socket) {
            console.error('[VoiceClient] Cannot send: socket not initialized');
            return;
        }

        this.socket.send(
            data,
            0,
            data.length,
            this.cleanEndpoint.port,
            this.cleanEndpoint.host,
            (err) => {
                if (err) {
                    console.error('[VoiceClient] Failed to send packet:', err);
                }
            }
        );
    }

    getStats() {
        return {
            connected: this.connected,
            ssrc: this.ssrc,
            audioSequence: this.audioSequence,
            videoSequence: this.videoSequence,
            speaking: this.speaking,
            endpoint: this.cleanEndpoint,
        };
    }
}