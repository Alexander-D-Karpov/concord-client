type VoiceEventCallback = (data: any) => void;

interface VoiceClientAPI {
    connect(roomId: string, audioOnly?: boolean): Promise<any>;
    disconnect(roomId: string): Promise<void>;
    sendAudio(data: ArrayBuffer): void;
    sendVideo(data: ArrayBuffer, isKeyframe: boolean): void;
    setSpeaking(speaking: boolean): Promise<void>;
    setMediaState(muted: boolean, videoEnabled: boolean): Promise<void>;
    isConnected(): Promise<boolean>;
    getParticipants(): Promise<any[]>;
    onSpeaking(cb: VoiceEventCallback): () => void;
    onParticipantJoined(cb: VoiceEventCallback): () => void;
    onMediaState(cb: VoiceEventCallback): () => void;
    onAudio(cb: VoiceEventCallback): () => void;
    onVideo(cb: VoiceEventCallback): () => void;
    onError(cb: VoiceEventCallback): () => void;
    onDisconnected(cb: () => void): () => void;
    onReconnected(cb: () => void): () => void;
    onRTT(cb: (rtt: number) => void): () => void;
    onLocalSpeaking(cb: (speaking: boolean) => void): () => void;
}

class VoiceClientWrapper implements VoiceClientAPI {
    async connect(roomId: string, audioOnly = false): Promise<any> {
        return window.concord.joinVoice(roomId, audioOnly);
    }

    async disconnect(roomId: string): Promise<void> {
        await window.concord.leaveVoice(roomId);
    }

    sendAudio(data: ArrayBuffer): void {
        window.concord.sendVoiceAudio(data);
    }

    sendVideo(data: ArrayBuffer, isKeyframe: boolean): void {
        window.concord.sendVoiceVideo(data, isKeyframe);
    }

    async setSpeaking(speaking: boolean): Promise<void> {
        await window.concord.setVoiceSpeaking(speaking);
    }

    async setMediaState(muted: boolean, videoEnabled: boolean): Promise<void> {
        await window.concord.setVoiceMediaState(muted, videoEnabled);
    }

    async isConnected(): Promise<boolean> {
        const result = await window.concord.isVoiceConnected();
        return result?.connected ?? false;
    }

    async getParticipants(): Promise<any[]> {
        const result = await window.concord.getVoiceParticipants();
        return result?.participants ?? [];
    }

    onSpeaking(cb: VoiceEventCallback): () => void {
        return window.concord.onVoiceSpeaking?.(cb) ?? (() => {});
    }

    onParticipantJoined(cb: VoiceEventCallback): () => void {
        return window.concord.onVoiceParticipantJoined?.(cb) ?? (() => {});
    }

    onMediaState(cb: VoiceEventCallback): () => void {
        return window.concord.onVoiceMediaState?.(cb) ?? (() => {});
    }

    onAudio(cb: VoiceEventCallback): () => void {
        return window.concord.onVoiceAudio?.(cb) ?? (() => {});
    }

    onVideo(cb: VoiceEventCallback): () => void {
        return window.concord.onVoiceVideo?.(cb) ?? (() => {});
    }

    onError(cb: VoiceEventCallback): () => void {
        return window.concord.onVoiceError?.(cb) ?? (() => {});
    }

    onDisconnected(cb: () => void): () => void {
        return window.concord.onVoiceDisconnected?.(cb) ?? (() => {});
    }

    onReconnected(cb: () => void): () => void {
        return window.concord.onVoiceReconnected?.(cb) ?? (() => {});
    }

    onRTT(cb: (rtt: number) => void): () => void {
        return window.concord.onVoiceRTT?.(cb) ?? (() => {});
    }

    onLocalSpeaking(cb: (speaking: boolean) => void): () => void {
        return window.concord.onLocalSpeaking?.(cb) ?? (() => {});
    }
}

export const voiceClient = new VoiceClientWrapper();
export type { VoiceClientAPI };