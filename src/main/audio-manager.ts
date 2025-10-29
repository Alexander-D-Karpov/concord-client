import { EventEmitter } from 'events';

export class AudioManager extends EventEmitter {
    private muted = false;

    async initialize(): Promise<void> {
        // Audio will be handled in renderer process
        this.emit('initialized');
    }

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.emit('muted', muted);
    }

    playAudio(_audioData: Buffer): void {
        // Forward to renderer
        this.emit('play-audio');
    }

    destroy(): void {
        this.removeAllListeners();
    }
}