import * as crypto from "crypto";

const NONCE_SIZE = 12;
const NONCE_BASE_SIZE = 4;
const KEY_SIZE = 32;
const AUTH_TAG_SIZE = 16;
const REPLAY_WINDOW = 256;
const DEBUG_CRYPTO = false;

type NonceBaseKey = string;

function nbKey(keyId: number, ssrc: number): NonceBaseKey {
    return `${keyId & 0xff}:${ssrc >>> 0}`;
}

function hkdfNonceBase(
    keyMaterial: Buffer,
    roomId: string,
    ssrc: number,
    keyId: number
): Buffer {
    const info = Buffer.concat([
        Buffer.from("nonce-base\0", "utf8"),
        Buffer.from(roomId, "utf8"),
        Buffer.from([keyId & 0xff]),
        Buffer.alloc(4),
    ]);
    info.writeUInt32BE(ssrc >>> 0, info.length - 4);

    const ab = crypto.hkdfSync("sha256", keyMaterial, Buffer.alloc(0), info, NONCE_BASE_SIZE);
    return Buffer.from(ab);
}

export class KeyRing {
    private readonly roomId: string;
    private keys = new Map<number, Buffer>();
    private nonceBaseCache = new Map<NonceBaseKey, Buffer>();

    constructor(roomId: string) {
        this.roomId = roomId;
        if (DEBUG_CRYPTO) console.log(`[KeyRing] Created for room: ${roomId}`);
    }

    setKey(keyId: number, keyMaterial: Uint8Array): void {
        const km = Buffer.from(keyMaterial);
        if (km.length !== KEY_SIZE) {
            throw new Error(`Invalid key size: ${km.length}, expected ${KEY_SIZE}`);
        }
        this.keys.set(keyId & 0xff, km);
        if (DEBUG_CRYPTO) {
            console.log(`[KeyRing] Set key: keyId=${keyId & 0xff}, keyLen=${km.length}`);
        }
        for (const k of Array.from(this.nonceBaseCache.keys())) {
            if (k.startsWith(`${keyId & 0xff}:`)) this.nonceBaseCache.delete(k);
        }
    }

    getKeyMaterial(keyId: number): Buffer {
        const km = this.keys.get(keyId & 0xff);
        if (!km) {
            throw new Error(`No key for keyId=${keyId & 0xff}`);
        }
        return km;
    }

    getNonceBase(keyId: number, ssrc: number): Buffer {
        const key = nbKey(keyId, ssrc);
        let nb = this.nonceBaseCache.get(key);
        if (!nb) {
            const km = this.getKeyMaterial(keyId);
            nb = hkdfNonceBase(km, this.roomId, ssrc, keyId);
            this.nonceBaseCache.set(key, nb);
        }
        return nb;
    }

    private deriveNonce(nonceBase: Buffer, counter: bigint): Buffer {
        const nonce = Buffer.alloc(NONCE_SIZE);
        nonceBase.copy(nonce, 0);
        nonce.writeBigUInt64BE(counter, NONCE_BASE_SIZE);
        return nonce;
    }

    seal(aad: Buffer, plaintext: Buffer, keyId: number, ssrc: number, counter: bigint): Buffer {
        const km = this.getKeyMaterial(keyId);
        const nonceBase = this.getNonceBase(keyId, ssrc);
        const nonce = this.deriveNonce(nonceBase, counter);

        const cipher = crypto.createCipheriv("aes-256-gcm", km, nonce);
        cipher.setAAD(aad);

        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
        const tag = cipher.getAuthTag();

        return Buffer.concat([encrypted, tag]);
    }

    open(aad: Buffer, ciphertext: Buffer, keyId: number, ssrc: number, counter: bigint): Buffer | null {
        if (ciphertext.length < AUTH_TAG_SIZE) {
            if (DEBUG_CRYPTO) console.log(`[KeyRing] Ciphertext too short: ${ciphertext.length}`);
            return null;
        }

        let km: Buffer;
        try {
            km = this.getKeyMaterial(keyId);
        } catch (e) {
            if (DEBUG_CRYPTO) console.error(`[KeyRing] No key for keyId=${keyId & 0xff}`);
            return null;
        }

        const nonceBase = this.getNonceBase(keyId, ssrc);
        const nonce = this.deriveNonce(nonceBase, counter);

        const enc = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_SIZE);
        const tag = ciphertext.subarray(ciphertext.length - AUTH_TAG_SIZE);

        try {
            const decipher = crypto.createDecipheriv("aes-256-gcm", km, nonce);
            decipher.setAAD(aad);
            decipher.setAuthTag(tag);
            return Buffer.concat([decipher.update(enc), decipher.final()]);
        } catch (e) {
            if (DEBUG_CRYPTO) {
                console.error(`[KeyRing] Decrypt failed: keyId=${keyId}, ssrc=${ssrc}, counter=${counter}`);
            }
            return null;
        }
    }
}

export class ReplayFilter {
    private max: bigint = 0n;
    private bitmap: bigint[] = [0n, 0n, 0n, 0n];
    private inited = false;

    accept(counter: bigint): boolean {
        if (!this.inited) {
            this.inited = true;
            this.max = counter;
            this.bitmap[0] = 1n;
            return true;
        }

        if (counter > this.max) {
            const shift = counter - this.max;
            this.shiftWindow(shift);
            this.max = counter;
            this.bitmap[0] |= 1n;
            return true;
        }

        const diff = this.max - counter;
        if (diff >= BigInt(REPLAY_WINDOW)) return false;

        const word = Number(diff / 64n);
        const bit = Number(diff % 64n);
        const mask = 1n << BigInt(bit);

        if ((this.bitmap[word] & mask) !== 0n) return false;

        this.bitmap[word] |= mask;
        return true;
    }

    private shiftWindow(shift: bigint): void {
        if (shift >= BigInt(REPLAY_WINDOW)) {
            this.bitmap = [0n, 0n, 0n, 0n];
            return;
        }

        const whole = Number(shift / 64n);
        const bits = Number(shift % 64n);

        if (whole > 0) {
            for (let i = this.bitmap.length - 1; i >= 0; i--) {
                const src = i - whole;
                this.bitmap[i] = src >= 0 ? this.bitmap[src] : 0n;
            }
        }

        if (bits === 0) return;

        for (let i = this.bitmap.length - 1; i >= 0; i--) {
            const carry = i > 0 ? this.bitmap[i - 1] << BigInt(64 - bits) : 0n;
            this.bitmap[i] = (this.bitmap[i] >> BigInt(bits)) | carry;
        }
    }
}