export {};

declare global {
    interface Window {
        concord: {
            getDefaultServerAddress(): Promise<string>;
            initializeClient(accessToken: string, serverAddress?: string): Promise<{ success: boolean }>;
            register(handle: string, password: string, displayName: string, serverAddress?: string): Promise<any>;
            login(handle: string, password: string, serverAddress?: string): Promise<any>;
            refreshToken(refreshToken: string): Promise<any>;
            getSelf(): Promise<any>;
            getRooms(): Promise<{ rooms: any[] }>;
            createRoom(name: string, region?: string): Promise<any>;
            getMembers(roomId: string): Promise<{ members: any[] }>;
            getMessages(roomId: string, limit?: number, beforeId?: string): Promise<any>;
            sendMessage(roomId: string, content: string): Promise<any>;
            startEventStream?(): Promise<any>;
            subscribeToRooms?(roomIds: string[]): Promise<void>;
            unsubscribeFromRooms?(roomIds: string[]): Promise<void>;
            joinVoice(roomId: string, audioOnly?: boolean): Promise<any>;
            leaveVoice(): Promise<void>;
            setMuted?(muted: boolean): Promise<void>;
            setVideoEnabled?(enabled: boolean): Promise<void>;
            onVoiceSpeaking?(callback: (data: any) => void): void;
            onVoiceError?(callback: (error: string) => void): void;
            onVoiceReconnected?(callback: () => void): void;
            onVoiceVideoFrame?(callback: (data: any) => void): void;
        };
        electron?: {
            ipcRenderer: {
                on(channel: string, func: (...args: any[]) => void): void;
                removeListener(channel: string, func: (...args: any[]) => void): void;
            };
        };
    }
}