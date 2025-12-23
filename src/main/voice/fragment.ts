import { FRAG_HEADER_SIZE, MAX_FRAG_PAYLOAD, MEDIA_HEADER_SIZE } from '../../shared/voice/constants';
import { encodeFragmentHeader, decodeFragmentHeader } from '../../shared/voice/protocol';
import type { FragmentHeader } from '../../shared/voice/types';

export interface Fragment {
    frameId: number;
    fragIndex: number;
    fragCount: number;
    frameLength: number;
    data: Buffer;
    receivedAt: number;
}

export interface ReassembledFrame {
    frameId: number;
    data: Buffer;
    isKeyframe: boolean;
}

export class Fragmenter {
    private nextFrameId = Math.floor(Math.random() * 0xffffffff);

    fragment(frameData: Buffer, isKeyframe: boolean): Buffer[] {
        const frameId = this.nextFrameId++;
        const frameLength = frameData.length;
        const fragCount = Math.ceil(frameLength / MAX_FRAG_PAYLOAD);
        const fragments: Buffer[] = [];

        for (let i = 0; i < fragCount; i++) {
            const start = i * MAX_FRAG_PAYLOAD;
            const end = Math.min(start + MAX_FRAG_PAYLOAD, frameLength);
            const fragData = frameData.subarray(start, end);

            const header = encodeFragmentHeader({
                frameId,
                fragIndex: i,
                fragCount,
                frameLength,
            });

            const fragment = Buffer.alloc(FRAG_HEADER_SIZE + fragData.length);
            Buffer.from(header).copy(fragment);
            fragData.copy(fragment, FRAG_HEADER_SIZE);

            fragments.push(fragment);
        }

        return fragments;
    }
}

export class Reassembler {
    private frames = new Map<number, Map<number, Fragment>>();
    private frameMeta = new Map<number, { fragCount: number; frameLength: number; isKeyframe: boolean }>();
    private maxAge: number;
    private maxFrames: number;

    constructor(maxAgeMs = 200, maxFrames = 30) {
        this.maxAge = maxAgeMs;
        this.maxFrames = maxFrames;
    }

    addFragment(payload: Buffer, isKeyframe: boolean): ReassembledFrame | null {
        if (payload.length < FRAG_HEADER_SIZE) {
            return null;
        }

        const header = decodeFragmentHeader(new Uint8Array(payload.buffer, payload.byteOffset, FRAG_HEADER_SIZE));
        if (!header) return null;

        const { frameId, fragIndex, fragCount, frameLength } = header;

        if (fragCount === 0 || fragIndex >= fragCount) {
            return null;
        }

        this.cleanup();

        if (!this.frames.has(frameId)) {
            if (this.frames.size >= this.maxFrames) {
                const oldestId = this.frames.keys().next().value as number | undefined;
                if (oldestId !== undefined) {
                    this.frames.delete(oldestId);
                    this.frameMeta.delete(oldestId);
                }
            }
            this.frames.set(frameId, new Map());
            this.frameMeta.set(frameId, { fragCount, frameLength, isKeyframe });
        }

        const frameFrags = this.frames.get(frameId)!;
        const fragData = payload.subarray(FRAG_HEADER_SIZE);

        frameFrags.set(fragIndex, {
            frameId,
            fragIndex,
            fragCount,
            frameLength,
            data: Buffer.from(fragData),
            receivedAt: Date.now(),
        });

        if (frameFrags.size === fragCount) {
            return this.assembleFrame(frameId);
        }

        return null;
    }

    private assembleFrame(frameId: number): ReassembledFrame | null {
        const frameFrags = this.frames.get(frameId);
        const meta = this.frameMeta.get(frameId);
        if (!frameFrags || !meta) return null;

        const { fragCount, frameLength, isKeyframe } = meta;
        const frameData = Buffer.alloc(frameLength);
        let offset = 0;

        for (let i = 0; i < fragCount; i++) {
            const frag = frameFrags.get(i);
            if (!frag) {
                this.frames.delete(frameId);
                this.frameMeta.delete(frameId);
                return null;
            }
            frag.data.copy(frameData, offset);
            offset += frag.data.length;
        }

        this.frames.delete(frameId);
        this.frameMeta.delete(frameId);

        return { frameId, data: frameData, isKeyframe };
    }

    private cleanup(): void {
        const now = Date.now();
        const toDelete: number[] = [];

        for (const [frameId, frags] of this.frames) {
            const anyFrag = frags.values().next().value;
            if (anyFrag && now - anyFrag.receivedAt > this.maxAge) {
                toDelete.push(frameId);
            }
        }

        for (const id of toDelete) {
            this.frames.delete(id);
            this.frameMeta.delete(id);
        }
    }
}