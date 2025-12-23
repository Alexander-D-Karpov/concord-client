export {};

declare global {
    interface Window {
        concord: {
            getDefaultServerAddress(): Promise<string>;
            initializeClient(accessToken: string, serverAddress?: string, refreshToken?: string, expiresIn?: number): Promise<{ success: boolean }>;

            // Auth
            register(handle: string, password: string, displayName: string, serverAddress?: string): Promise<any>;
            login(handle: string, password: string, serverAddress?: string): Promise<any>;
            loginOAuth(provider: string, code: string, redirectUri: string): Promise<any>;
            oauthBegin(provider: string, redirectUri: string): Promise<{ auth_url: string; state: string }>;
            refreshToken(refreshToken: string): Promise<any>;
            logout(refreshToken: string): Promise<any>;
            checkAuthStatus(): Promise<{ authenticated: boolean }>;

            // Users
            getSelf(): Promise<any>;
            getUser(userId: string): Promise<any>;
            getUserByHandle(handle: string): Promise<any>;
            searchUsers(query: string, limit?: number): Promise<{ users: any[] }>;
            listUsersByIds(userIds: string[]): Promise<{ users: any[] }>;
            updateProfile(displayName?: string, avatarUrl?: string, bio?: string): Promise<any>;
            updateStatus(status: string): Promise<any>;

            // Rooms
            getRooms(): Promise<{ rooms: any[] }>;
            getRoom(roomId: string): Promise<any>;
            createRoom(name: string, region?: string, description?: string, isPrivate?: boolean): Promise<any>;
            updateRoom(roomId: string, name?: string, description?: string, isPrivate?: boolean): Promise<any>;
            deleteRoom(roomId: string): Promise<any>;
            attachVoiceServer(roomId: string, voiceServerId: string): Promise<any>;

            // Membership
            getMembers(roomId: string): Promise<{ members: any[] }>;
            inviteMember(roomId: string, userId: string): Promise<any>;
            acceptRoomInvite(inviteId: string): Promise<any>;
            rejectRoomInvite(inviteId: string): Promise<any>;
            cancelRoomInvite(inviteId: string): Promise<any>;
            listRoomInvites(): Promise<{ incoming: any[]; outgoing: any[] }>;
            removeMember(roomId: string, userId: string): Promise<any>;
            setMemberRole(roomId: string, userId: string, role: string): Promise<any>;
            setMemberNickname(roomId: string, nickname: string): Promise<any>;

            // Chat
            getMessages(roomId: string, limit?: number, beforeId?: string): Promise<any>;
            sendMessage(roomId: string, content: string, replyToId?: string, mentions?: string[], attachments?: any[]): Promise<any>;
            editMessage(messageId: string, content: string): Promise<any>;
            deleteMessage(messageId: string): Promise<any>;
            pinMessage(roomId: string, messageId: string): Promise<any>;
            unpinMessage(roomId: string, messageId: string): Promise<any>;
            listPinnedMessages(roomId: string): Promise<{ messages: any[] }>;
            addReaction(messageId: string, emoji: string): Promise<any>;
            removeReaction(messageId: string, emoji: string): Promise<any>;
            searchMessages(roomId: string, query: string, limit?: number): Promise<any>;
            getThread(messageId: string, limit?: number, cursor?: string): Promise<any>;

            // Stream
            startEventStream(): Promise<{ success: boolean }>;
            streamAck(eventId: string): Promise<{ success: boolean }>;
            onStreamEvent(cb: (event: any) => void): () => void;
            onStreamError(cb: (err: string) => void): () => void;
            onStreamEnd(cb: () => void): () => void;

            // Voice
            joinVoice: (roomId: string, audioOnly?: boolean) => Promise<any>;
            leaveVoice: (roomId: string) => Promise<any>;
            setMediaPrefs: (roomId: string, audioOnly: boolean, videoEnabled: boolean, muted: boolean) => Promise<any>;
            getVoiceStatus: (roomId: string) => Promise<any>;
            getVoiceParticipants: () => Promise<{ participants: any[] }>;
            sendVoiceAudio: (data: ArrayBuffer) => Promise<any>;
            sendVoiceVideo: (data: ArrayBuffer, isKeyframe: boolean) => Promise<any>;
            setVoiceSpeaking: (speaking: boolean) => Promise<any>;
            isVoiceConnected: () => Promise<{ connected: boolean }>;

            // Voice events
            onVoiceSpeaking?: (cb: (data: any) => void) => () => void;
            onVoiceParticipantJoined?: (cb: (data: any) => void) => () => void;
            onVoiceError?: (cb: (error: string) => void) => () => void;
            onVoiceReconnected?: (cb: () => void) => () => void;
            onVoiceDisconnected?: (cb: () => void) => () => void;
            onVoiceAudio?: (cb: (data: any) => void) => () => void;
            onVoiceVideo?: (cb: (data: any) => void) => () => void;
            onVoiceSyncDrift?: (cb: (drift: number) => void) => () => void;
            onVoiceRTT?: (cb: (rtt: number) => void) => () => void;
            onLocalSpeaking?: (cb: (speaking: boolean) => void) => () => void;
            onVoiceMediaState?: (cb: (data: any) => void) => () => void;
            setVoiceMediaState: (muted: boolean, videoEnabled: boolean) => Promise<any>;

            // Friends
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

            // Admin
            kickUser(roomId: string, userId: string): Promise<any>;
            banUser(roomId: string, userId: string, durationSeconds: number): Promise<any>;
            muteUser(roomId: string, userId: string, muted: boolean): Promise<any>;

            // Auth events
            onAuthExpired(cb: () => void): () => void;

            // DM
            getOrCreateDM(userId: string): Promise<any>;
            listDMs(): Promise<any>;
            closeDM(channelId: string): Promise<any>;
            sendDMMessage(channelId: string, content: string, attachments?: any[]): Promise<any>;
            listDMMessages(channelId: string, limit?: number, beforeId?: string): Promise<any>;
            startDMCall(channelId: string, audioOnly?: boolean): Promise<any>;
            joinDMCall(channelId: string, audioOnly?: boolean): Promise<any>;
            leaveDMCall(channelId: string): Promise<any>;
            endDMCall(channelId: string): Promise<any>;
            getDMCallStatus(channelId: string): Promise<any>;
        };
    }
}