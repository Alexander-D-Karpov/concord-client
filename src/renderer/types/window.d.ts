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
            getUser(userId: string): Promise<any>;
            searchUsers(query: string, limit?: number): Promise<{ users: any[] }>;
            updateProfile(displayName?: string, avatarUrl?: string, bio?: string): Promise<any>;
            updateStatus(status: string): Promise<any>;
            getRooms(): Promise<{ rooms: any[] }>;
            createRoom(name: string, region?: string, description?: string, isPrivate?: boolean): Promise<any>;
            updateRoom(roomId: string, name?: string, description?: string, isPrivate?: boolean): Promise<any>;
            deleteRoom(roomId: string): Promise<any>;
            getMembers(roomId: string): Promise<{ members: any[] }>;
            inviteMember(roomId: string, userId: string): Promise<any>;
            removeMember(roomId: string, userId: string): Promise<any>;
            setMemberRole(roomId: string, userId: string, role: string): Promise<any>;
            setMemberNickname(roomId: string, nickname: string): Promise<any>;
            getMessages(roomId: string, limit?: number, beforeId?: string): Promise<any>;
            sendMessage(roomId: string, content: string, replyToId?: string, mentions?: string[]): Promise<any>;
            editMessage(messageId: string, content: string): Promise<any>;
            deleteMessage(messageId: string): Promise<any>;
            pinMessage(roomId: string, messageId: string): Promise<any>;
            unpinMessage(roomId: string, messageId: string): Promise<any>;
            addReaction(messageId: string, emoji: string): Promise<any>;
            removeReaction(messageId: string, emoji: string): Promise<any>;
            searchMessages(roomId: string, query: string, limit?: number): Promise<any>;
            uploadAttachment(file: File): Promise<{ url: string; id: string }>;
            startEventStream?(): Promise<any>;
            streamAck?(eventId: string): Promise<void>;
            joinVoice(roomId: string, audioOnly?: boolean): Promise<any>;
            leaveVoice(): Promise<void>;
            setMuted?(muted: boolean): Promise<void>;
            setVideoEnabled?(enabled: boolean): Promise<void>;
            onVoiceSpeaking?(callback: (data: any) => void): void;
            onVoiceError?(callback: (error: string) => void): void;
            onVoiceReconnected?(callback: () => void): void;
            onVoiceVideoFrame?(callback: (data: any) => void): void;
        };
    }
}