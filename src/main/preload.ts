import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, args?: any) => ipcRenderer.invoke(channel, args);

contextBridge.exposeInMainWorld('concord', {
    getDefaultServerAddress: () => invoke('app:getDefaultServerAddress'),
    initializeClient: (accessToken: string, serverAddress?: string, refreshToken?: string, expiresIn?: number) =>
        invoke('client:initialize', { accessToken, serverAddress, refreshToken, expiresIn }),
    getGPUInfo: () => invoke('app:getGPUInfo'),

    // Auth
    register: (handle: string, password: string, displayName: string, serverAddress?: string) =>
        invoke('auth:register', { handle, password, displayName, serverAddress }),
    login: (handle: string, password: string, serverAddress?: string) =>
        invoke('auth:login', { handle, password, serverAddress }),
    loginOAuth: (provider: string, code: string, redirectUri: string) =>
        invoke('auth:loginOAuth', { provider, code, redirectUri }),
    oauthBegin: (provider: string, redirectUri: string) =>
        invoke('auth:oauthBegin', { provider, redirectUri }),
    refreshToken: (refreshToken: string) => invoke('auth:refresh', { refreshToken }),
    logout: (refreshToken: string) => invoke('auth:logout', { refreshToken }),
    checkAuthStatus: () => invoke('auth:checkStatus'),

    // Users
    getSelf: () => invoke('users:getSelf'),
    getUser: (userId: string) => invoke('users:getUser', { userId }),
    getUserByHandle: (handle: string) => invoke('users:getByHandle', { handle }),
    searchUsers: (query: string, limit?: number) => invoke('users:search', { query, limit }),
    listUsersByIds: (userIds: string[]) => invoke('users:listByIds', { userIds }),
    updateProfile: (displayName?: string, avatarUrl?: string, bio?: string) =>
        invoke('users:updateProfile', { displayName, avatarUrl, bio }),
    updateStatus: (status: string) => invoke('users:updateStatus', { status }),
    uploadAvatar: (imageData: ArrayBuffer, filename: string) =>
        invoke('users:uploadAvatar', { imageData: Array.from(new Uint8Array(imageData)), filename }),
    deleteAvatar: (avatarId: string) => invoke('users:deleteAvatar', { avatarId }),
    getAvatarHistory: (userId: string) => invoke('users:getAvatarHistory', { userId }),

    // Rooms
    getRooms: () => invoke('rooms:list'),
    getRoom: (roomId: string) => invoke('rooms:get', { roomId }),
    createRoom: (name: string, region?: string, description?: string, isPrivate?: boolean) =>
        invoke('rooms:create', { name, region, description, isPrivate }),
    updateRoom: (roomId: string, name?: string, description?: string, isPrivate?: boolean) =>
        invoke('rooms:update', { roomId, name, description, isPrivate }),
    deleteRoom: (roomId: string) => invoke('rooms:delete', { roomId }),
    attachVoiceServer: (roomId: string, voiceServerId: string) =>
        invoke('rooms:attachVoiceServer', { roomId, voiceServerId }),

    // Membership
    getMembers: (roomId: string) => invoke('rooms:getMembers', { roomId }),
    inviteMember: (roomId: string, userId: string) => invoke('membership:invite', { roomId, userId }),
    acceptRoomInvite: (inviteId: string) => invoke('membership:acceptInvite', { inviteId }),
    rejectRoomInvite: (inviteId: string) => invoke('membership:rejectInvite', { inviteId }),
    cancelRoomInvite: (inviteId: string) => invoke('membership:cancelInvite', { inviteId }),
    listRoomInvites: () => invoke('membership:listInvites'),
    removeMember: (roomId: string, userId: string) => invoke('membership:remove', { roomId, userId }),
    setMemberRole: (roomId: string, userId: string, role: string) =>
        invoke('membership:setRole', { roomId, userId, role }),
    setMemberNickname: (roomId: string, nickname: string) =>
        invoke('membership:setNickname', { roomId, nickname }),

    // Chat
    getMessages: (roomId: string, limit?: number, beforeId?: string) =>
        invoke('chat:list', { roomId, limit, beforeId }),
    sendMessage: (roomId: string, content: string, replyToId?: string, mentions?: string[], attachments?: any[]) =>
        invoke('chat:send', { roomId, content, replyToId, mentions, attachments }),
    editMessage: (messageId: string, content: string) => invoke('chat:edit', { messageId, content }),
    deleteMessage: (messageId: string) => invoke('chat:delete', { messageId }),
    pinMessage: (roomId: string, messageId: string) => invoke('chat:pin', { roomId, messageId }),
    unpinMessage: (roomId: string, messageId: string) => invoke('chat:unpin', { roomId, messageId }),
    listPinnedMessages: (roomId: string) => invoke('chat:listPinned', { roomId }),
    addReaction: (messageId: string, emoji: string) => invoke('chat:addReaction', { messageId, emoji }),
    removeReaction: (messageId: string, emoji: string) => invoke('chat:removeReaction', { messageId, emoji }),
    searchMessages: (roomId: string, query: string, limit?: number) =>
        invoke('chat:search', { roomId, query, limit }),
    getThread: (messageId: string, limit?: number, cursor?: string) =>
        invoke('chat:getThread', { messageId, limit, cursor }),
    startTyping: (roomId: string) => invoke('chat:startTyping', { roomId }),
    stopTyping: (roomId: string) => invoke('chat:stopTyping', { roomId }),

    // Stream
    startEventStream: () => invoke('stream:start'),
    streamAck: (eventId: string) => invoke('stream:ack', { eventId }),
    onStreamEvent: (cb: (event: any) => void) => {
        const handler = (_e: any, ev: any) => cb(ev);
        ipcRenderer.on('stream:event', handler);
        return () => ipcRenderer.removeListener('stream:event', handler);
    },
    onStreamError: (cb: (err: string) => void) => {
        const handler = (_e: any, err: string) => cb(err);
        ipcRenderer.on('stream:error', handler);
        return () => ipcRenderer.removeListener('stream:error', handler);
    },
    onStreamEnd: (cb: () => void) => {
        const handler = () => cb();
        ipcRenderer.on('stream:end', handler);
        return () => ipcRenderer.removeListener('stream:end', handler);
    },

    // Voice
    joinVoice: (roomId: string, audioOnly?: boolean, isDM?: boolean) =>
        invoke('voice:join', { roomId, audioOnly, isDM }),
    leaveVoice: (roomId: string) => invoke('voice:leave', { roomId }),
    setMediaPrefs: (roomId: string, audioOnly: boolean, videoEnabled: boolean, muted: boolean, screenSharing: boolean) =>
        invoke('voice:setMediaPrefs', { roomId, audioOnly, videoEnabled, muted, screenSharing }),
    getVoiceStatus: (roomId: string) => invoke('voice:getStatus', { roomId }),
    getVoiceParticipants: () => invoke('voice:getParticipants'),
    sendVoiceAudio: (data: ArrayBuffer) => {
        ipcRenderer.send('voice:sendAudio', new Uint8Array(data));
        return Promise.resolve({ success: true });
    },
    sendVoiceVideo: (data: ArrayBuffer, isKeyframe: boolean, source: 'camera' | 'screen') => {
        ipcRenderer.send('voice:sendVideo', {
            data: Array.from(new Uint8Array(data)),
            isKeyframe,
            source
        });
        return Promise.resolve({ success: true });
    },
    updateVoiceSubscriptions: (ssrcs: number[]) => ipcRenderer.invoke('voice:subscriptions', ssrcs),
    setVoiceSpeaking: (speaking: boolean) => invoke('voice:setSpeaking', { speaking }),
    isVoiceConnected: () => invoke('voice:isConnected'),
    onVoiceParticipantLeft: (cb: (data: any) => void) => {
        const handler = (_e: any, data: any) => cb(data);
        ipcRenderer.on('voice:participant-left', handler);
        return () => ipcRenderer.removeListener('voice:participant-left', handler);
    },

    onVoiceMediaState: (cb: (data: any) => void) => {
        const handler = (_e: any, data: any) => cb(data);
        ipcRenderer.on('voice:media-state', handler);
        return () => ipcRenderer.removeListener('voice:media-state', handler);
    },

    setVoiceMediaState: (muted: boolean, videoEnabled: boolean, screenSharing: boolean) =>
        invoke('voice:setMediaState', { muted, videoEnabled, screenSharing }),

    // Voice events
    onVoiceSpeaking: (cb: (data: any) => void) => {
        const handler = (_e: any, data: any) => cb(data);
        ipcRenderer.on('voice:speaking', handler);
        return () => ipcRenderer.removeListener('voice:speaking', handler);
    },
    onVoiceParticipantJoined: (cb: (data: any) => void) => {
        const handler = (_e: any, data: any) => cb(data);
        ipcRenderer.on('voice:participant-joined', handler);
        return () => ipcRenderer.removeListener('voice:participant-joined', handler);
    },
    onVoiceError: (cb: (error: string) => void) => {
        const handler = (_e: any, error: string) => cb(error);
        ipcRenderer.on('voice:error', handler);
        return () => ipcRenderer.removeListener('voice:error', handler);
    },
    onVoiceReconnected: (cb: () => void) => {
        const handler = () => cb();
        ipcRenderer.on('voice:reconnected', handler);
        return () => ipcRenderer.removeListener('voice:reconnected', handler);
    },
    onVoiceDisconnected: (cb: () => void) => {
        const handler = () => cb();
        ipcRenderer.on('voice:disconnected', handler);
        return () => ipcRenderer.removeListener('voice:disconnected', handler);
    },
    onVoiceAudio: (cb: (data: any) => void) => {
        const handler = (_e: any, data: any) => cb(data);
        ipcRenderer.on('voice:audio', handler);
        return () => ipcRenderer.removeListener('voice:audio', handler);
    },
    onVoiceVideo: (cb: (data: any) => void) => {
        const handler = (_e: any, data: any) => cb(data);
        ipcRenderer.on('voice:video', handler);
        return () => ipcRenderer.removeListener('voice:video', handler);
    },
    onVoiceSyncDrift: (cb: (drift: number) => void) => {
        const handler = (_e: any, drift: number) => cb(drift);
        ipcRenderer.on('voice:sync-drift', handler);
        return () => ipcRenderer.removeListener('voice:sync-drift', handler);
    },
    onVoiceRTT: (cb: (rtt: number) => void) => {
        const handler = (_e: any, rtt: number) => cb(rtt);
        ipcRenderer.on('voice:rtt', handler);
        return () => ipcRenderer.removeListener('voice:rtt', handler);
    },
    onLocalSpeaking: (cb: (speaking: boolean) => void) => {
        const handler = (_e: any, speaking: boolean) => cb(speaking);
        ipcRenderer.on('voice:local-speaking', handler);
        return () => ipcRenderer.removeListener('voice:local-speaking', handler);
    },

    getScreenSources: () => invoke('screen:getSources'),

    // Friends
    sendFriendRequest: (userId: string) => invoke('friends:sendRequest', { userId }),
    acceptFriendRequest: (requestId: string) => invoke('friends:acceptRequest', { requestId }),
    rejectFriendRequest: (requestId: string) => invoke('friends:rejectRequest', { requestId }),
    cancelFriendRequest: (requestId: string) => invoke('friends:cancelRequest', { requestId }),
    removeFriend: (userId: string) => invoke('friends:remove', { userId }),
    listFriends: () => invoke('friends:list'),
    listPendingRequests: () => invoke('friends:listPending'),
    blockUser: (userId: string) => invoke('friends:block', { userId }),
    unblockUser: (userId: string) => invoke('friends:unblock', { userId }),
    listBlockedUsers: () => invoke('friends:listBlocked'),

    // Admin
    kickUser: (roomId: string, userId: string) => invoke('admin:kick', { roomId, userId }),
    banUser: (roomId: string, userId: string, durationSeconds: number) =>
        invoke('admin:ban', { roomId, userId, durationSeconds }),
    muteUser: (roomId: string, userId: string, muted: boolean) =>
        invoke('admin:mute', { roomId, userId, muted }),

    // Auth events
    onAuthExpired: (cb: () => void) => {
        const handler = () => cb();
        ipcRenderer.on('auth:expired', handler);
        return () => ipcRenderer.removeListener('auth:expired', handler);
    },

    // DM
    getOrCreateDM: (userId: string) => invoke('dm:getOrCreate', { userId }),
    listDMs: () => invoke('dm:list'),
    closeDM: (channelId: string) => invoke('dm:close', { channelId }),
    sendDMMessage: (channelId: string, content: string, attachments?: any[]) =>
        invoke('dm:sendMessage', { channelId, content, attachments }),
    listDMMessages: (channelId: string, limit?: number, beforeId?: string) =>
        invoke('dm:listMessages', { channelId, limit, beforeId }),
    startDMCall: (channelId: string, audioOnly?: boolean) =>
        invoke('dm:startCall', { channelId, audioOnly }),
    joinDMCall: (channelId: string, audioOnly?: boolean) =>
        invoke('dm:joinCall', { channelId, audioOnly }),
    leaveDMCall: (channelId: string) => invoke('dm:leaveCall', { channelId }),
    endDMCall: (channelId: string) => invoke('dm:endCall', { channelId }),
    getDMCallStatus: (channelId: string) => invoke('dm:callStatus', { channelId }),

    markAsRead: (roomId: string, messageId: string) => invoke('chat:markAsRead', { roomId, messageId }),
    markDMAsRead: (channelId: string, messageId: string) => invoke('dm:markAsRead', { channelId, messageId }),
    getUnreadCounts: () => invoke('chat:getUnreadCounts'),
    startDMTyping: (channelId: string) => invoke('dm:startTyping', { channelId }),
    stopDMTyping: (channelId: string) => invoke('dm:stopTyping', { channelId }),
});