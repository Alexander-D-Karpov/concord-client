interface CachedPacket {
    data: Buffer;
    timestamp: number;
}

export class RetransmitCache {
    private packets = new Map<number, Map<number, CachedPacket>>(); // ssrc -> seq -> packet
    private maxAge: number;
    private maxSizePerSsrc: number;

    constructor(maxAgeMs = 500, maxSizePerSsrc = 500) {
        this.maxAge = maxAgeMs;
        this.maxSizePerSsrc = maxSizePerSsrc;
    }

    store(ssrc: number, sequence: number, data: Buffer): void {
        this.cleanupSsrc(ssrc);

        let m = this.packets.get(ssrc);
        if (!m) {
            m = new Map();
            this.packets.set(ssrc, m);
        }

        if (m.size >= this.maxSizePerSsrc) {
            const oldestKey = m.keys().next().value as number | undefined;
            if (oldestKey !== undefined) m.delete(oldestKey);
        }

        m.set(sequence & 0xffff, { data: Buffer.from(data), timestamp: Date.now() });
    }

    get(ssrc: number, sequence: number): Buffer | null {
        const m = this.packets.get(ssrc);
        if (!m) return null;

        const p = m.get(sequence & 0xffff);
        if (!p) return null;

        if (Date.now() - p.timestamp > this.maxAge) {
            m.delete(sequence & 0xffff);
            return null;
        }

        return p.data;
    }

    private cleanupSsrc(ssrc: number): void {
        const m = this.packets.get(ssrc);
        if (!m) return;

        const now = Date.now();
        for (const [seq, p] of m) {
            if (now - p.timestamp > this.maxAge) m.delete(seq);
        }
    }

    clearSsrc(ssrc: number): void {
        this.packets.delete(ssrc);
    }

    clear(): void {
        this.packets.clear();
    }
}

export class NackTracker {
    private lastNackTime = new Map<number, number>();
    private minInterval: number;

    constructor(minIntervalMs = 50) {
        this.minInterval = minIntervalMs;
    }

    shouldSendNack(ssrc: number): boolean {
        const now = Date.now();
        const last = this.lastNackTime.get(ssrc) || 0;
        if (now - last < this.minInterval) return false;
        this.lastNackTime.set(ssrc, now);
        return true;
    }

    clearSsrc(ssrc: number): void {
        this.lastNackTime.delete(ssrc);
    }

    clear(): void {
        this.lastNackTime.clear();
    }
}

export class PliTracker {
    private lastPliTime = new Map<number, number>();
    private minInterval: number;

    constructor(minIntervalMs = 500) {
        this.minInterval = minIntervalMs;
    }

    shouldSendPli(ssrc: number): boolean {
        const now = Date.now();
        const last = this.lastPliTime.get(ssrc) || 0;
        if (now - last < this.minInterval) return false;
        this.lastPliTime.set(ssrc, now);
        return true;
    }

    clearSsrc(ssrc: number): void {
        this.lastPliTime.delete(ssrc);
    }

    clear(): void {
        this.lastPliTime.clear();
    }
}
