export interface StreamStats {
    ssrc: number;

    packetsReceived: number;
    packetsLost: number;

    bytesReceived: number;

    highestSeq: number;

    jitterMs: number;
    lastPacketTime: number;
}

type MissingEntry = { seq: number; addedAt: number };

class SeqGapTracker {
    private maxSeq: number | null = null;
    private missing = new Map<number, number>(); // seq -> addedAt
    private windowLimit: number;
    private graceMs: number;

    constructor(windowLimit = 256, graceMs = 35) {
        this.windowLimit = windowLimit;
        this.graceMs = graceMs;
    }

    note(seq: number): void {
        seq &= 0xffff;

        if (this.maxSeq === null) {
            this.maxSeq = seq;
            return;
        }

        const max = this.maxSeq;

        const forward = ((seq - max) & 0xffff) < 0x8000;
        if (forward && seq !== max) {
            let cur = (max + 1) & 0xffff;
            while (cur !== seq) {
                this.missing.set(cur, Date.now());
                cur = (cur + 1) & 0xffff;

                if (this.missing.size > this.windowLimit) {
                    const oldest = this.missing.keys().next().value as number | undefined;
                    if (oldest !== undefined) this.missing.delete(oldest);
                }
            }
            this.maxSeq = seq;
            return;
        }

        if (this.missing.has(seq)) this.missing.delete(seq);
    }

    getMissing(now = Date.now(), limit = 20): number[] {
        const out: number[] = [];
        const entries: MissingEntry[] = [];

        for (const [seq, addedAt] of this.missing) {
            entries.push({ seq, addedAt });
        }

        entries.sort((a, b) => a.addedAt - b.addedAt);

        for (const e of entries) {
            if (out.length >= limit) break;
            if (now - e.addedAt < this.graceMs) continue;
            out.push(e.seq);
        }

        return out;
    }

    clear(): void {
        this.maxSeq = null;
        this.missing.clear();
    }
}

export interface AggregateStats {
    totalPacketsReceived: number;
    totalPacketsSent: number;
    totalBytesReceived: number;
    totalBytesSent: number;
    rttMs: number;

    streams: Map<number, StreamStats>;
}

export class StatsCollector {
    private streams = new Map<number, StreamStats>();

    private totalReceived = 0;
    private totalSent = 0;
    private bytesReceived = 0;
    private bytesSent = 0;
    private lastRtt = 0;

    private gapTrackers = new Map<number, SeqGapTracker>();

    private lastArrivalMs = new Map<number, number>();
    private lastTransitMs = new Map<number, number>();

    recordPacketReceived(ssrc: number, seq: number, timestamp: number, timestampHz: number, size: number): void {
        this.totalReceived++;
        this.bytesReceived += size;

        let stats = this.streams.get(ssrc);
        if (!stats) {
            stats = {
                ssrc,
                packetsReceived: 0,
                packetsLost: 0,
                bytesReceived: 0,
                highestSeq: seq & 0xffff,
                jitterMs: 0,
                lastPacketTime: Date.now(),
            };
            this.streams.set(ssrc, stats);
            this.gapTrackers.set(ssrc, new SeqGapTracker());
        }

        stats.packetsReceived++;
        stats.bytesReceived += size;
        stats.lastPacketTime = Date.now();

        const gt = this.gapTrackers.get(ssrc);
        if (gt) {
            const beforeMissing = gt.getMissing(Date.now(), 4096).length;
            gt.note(seq);

            const afterMissing = gt.getMissing(Date.now(), 4096).length;
            // packetsLost is "observed gaps not yet filled"; keep it bounded and monotonic-ish for UI
            stats.packetsLost = Math.max(stats.packetsLost + (afterMissing - beforeMissing), 0);
        }

        const seq16 = seq & 0xffff;
        const forward = ((seq16 - stats.highestSeq) & 0xffff) < 0x8000;
        if (forward) stats.highestSeq = seq16;

        const arrivalMs = Date.now();
        const tsMs = timestampHz > 0 ? (timestamp / timestampHz) * 1000 : 0;
        const transitMs = arrivalMs - tsMs;

        const lastArrival = this.lastArrivalMs.get(ssrc);
        const lastTransit = this.lastTransitMs.get(ssrc);

        if (lastArrival !== undefined && lastTransit !== undefined) {
            const d = Math.abs(transitMs - lastTransit);
            stats.jitterMs = stats.jitterMs + (d - stats.jitterMs) / 16;
        }

        this.lastArrivalMs.set(ssrc, arrivalMs);
        this.lastTransitMs.set(ssrc, transitMs);
    }

    recordPacketSent(size: number): void {
        this.totalSent++;
        this.bytesSent += size;
    }

    recordRtt(rttMs: number): void {
        this.lastRtt = rttMs;
    }

    getMissingSequences(ssrc: number, limit = 20): number[] {
        const gt = this.gapTrackers.get(ssrc);
        if (!gt) return [];
        return gt.getMissing(Date.now(), limit);
    }

    clearSsrc(ssrc: number): void {
        this.streams.delete(ssrc);
        this.gapTrackers.delete(ssrc);
        this.lastArrivalMs.delete(ssrc);
        this.lastTransitMs.delete(ssrc);
        this.streams.delete(ssrc);
    }

    getStats(): AggregateStats {
        return {
            totalPacketsReceived: this.totalReceived,
            totalPacketsSent: this.totalSent,
            totalBytesReceived: this.bytesReceived,
            totalBytesSent: this.bytesSent,
            rttMs: this.lastRtt,
            streams: new Map(this.streams),
        };
    }

    getStreamStats(ssrc: number): StreamStats | undefined {
        return this.streams.get(ssrc);
    }

    getFractionLost(ssrc: number): number {
        const s = this.streams.get(ssrc);
        if (!s) return 0;
        const missing = this.getMissingSequences(ssrc, 4096).length;
        const total = s.packetsReceived + missing;
        if (total <= 0) return 0;
        return missing / total;
    }

    reset(): void {
        this.streams.clear();
        this.gapTrackers.clear();
        this.lastArrivalMs.clear();
        this.lastTransitMs.clear();

        this.totalReceived = 0;
        this.totalSent = 0;
        this.bytesReceived = 0;
        this.bytesSent = 0;
        this.lastRtt = 0;
    }
}
