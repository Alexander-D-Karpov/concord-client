type StreamEventHandler = (event: any) => void;

class StreamService {
    private active = false;
    private handlers: StreamEventHandler[] = [];

    isActive(): boolean {
        return this.active;
    }

    async start(): Promise<boolean> {
        if (this.active) {
            console.log('[StreamService] Already active');
            return true;
        }

        console.log('[StreamService] Starting stream...');

        try {
            const result = await window.concord.startEventStream?.();

            if (!result?.success) {
                throw new Error('Stream initialization failed');
            }

            this.active = true;
            console.log('[StreamService] Stream started successfully');
            return true;
        } catch (err) {
            console.error('[StreamService] Failed to start stream:', err);
            return false;
        }
    }

    stop(): void {
        console.log('[StreamService] Stopping stream');
        this.active = false;
        this.handlers = [];
    }

    addHandler(handler: StreamEventHandler): void {
        this.handlers.push(handler);
    }

    removeHandler(handler: StreamEventHandler): void {
        this.handlers = this.handlers.filter(h => h !== handler);
    }

    notifyHandlers(event: any): void {
        this.handlers.forEach(handler => {
            try {
                handler(event);
            } catch (err) {
                console.error('[StreamService] Handler error:', err);
            }
        });
    }
}

export const streamService = new StreamService();