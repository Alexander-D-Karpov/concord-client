import { EventEmitter } from 'events';

export interface VideoConstraints {
    width?: number;
    height?: number;
    frameRate?: number;
}

export class VideoManager extends EventEmitter {
    private enabled = false;

    async initialize(_constraints: VideoConstraints = {}): Promise<void> {
        this.emit('initialized');
    }

    setEnabled(enabled: boolean): void {
        this.enabled = enabled;
        this.emit('enabled', enabled);
    }

    renderFrame(_frameData: Buffer, ssrc: number): void {
        this.emit('remote-frame', { ssrc });
    }

    destroy(): void {
        this.removeAllListeners();
    }

    getStream(): undefined {
        return undefined;
    }
}