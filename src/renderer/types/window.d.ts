export {};

declare global {
    interface Window {
        concord: {
            getDefaultServerAddress(): Promise<string>;
            initializeClient(
                accessToken: string,
                serverAddress?: string,
                refreshToken?: string,
                expiresIn?: number
            ): Promise<{ success: boolean }>;
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
            sendMessage(roomId: string, content: string, replyToId?: string, mentions?: string[], attachments?: Array<{
                filename: string;
                content_type: string;
                data: number[];
                width?: number;
                height?: number;
            }>): Promise<any>;
            editMessage(messageId: string, content: string): Promise<any>;
            deleteMessage(messageId: string): Promise<any>;
            pinMessage(roomId: string, messageId: string): Promise<any>;
            unpinMessage(roomId: string, messageId: string): Promise<any>;
            addReaction(messageId: string, emoji: string): Promise<any>;
            removeReaction(messageId: string, emoji: string): Promise<any>;
            searchMessages(roomId: string, query: string, limit?: number): Promise<any>;
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
            sendFriendRequest(userId: string): Promise<any>;
            acceptFriendRequest(requestId: string): Promise<any>;
            rejectFriendRequest(requestId: string): Promise<any>;
            cancelFriendRequest(requestId: string): Promise<any>;
            removeFriend(userId: string): Promise<any>;
            listFriends(): Promise<{ friends: any[] }>;
            listPendingRequests(): Promise<{ incoming: any[]; outgoing: any[] }>;
            blockUser(userId: string): Promise<any>;
            unblockUser(userId: string): Promise<any>;
            listBlockedUsers(): Promise<{ user_ids: string[] }>;
            getVoiceStatus(roomId: string): Promise<{ participants: any[]; total_participants: number }>;

            onStreamEvent?(cb: (event: any ) => void): () => void;
            onStreamError?(cb: (err: string) => void): () => void;
            onStreamEnd?(cb: () => void): () => void;

            logout(refreshToken: string): Promise<any>;
            getRoom(roomId: string): Promise<any>;
            getUserByHandle(handle: string): Promise<any>;
            listUsersByIds(userIds: string[]): Promise<{ users: any[] }>;
            listPinnedMessages(roomId: string): Promise<{ messages: any[] }>;
            getThread(messageId: string, limit?: number, cursor?: string): Promise<{ messages: any[]; next_cursor?: string; has_more: boolean }>;

            checkAuthStatus(): Promise<{ authenticated: boolean }>;
            onAuthExpired?(callback: () => void): () => void;
        };
    }
}
