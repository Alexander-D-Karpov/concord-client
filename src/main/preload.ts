import { contextBridge, ipcRenderer } from 'electron';

const invoke = (channel: string, args?: any) => ipcRenderer.invoke(channel, args);

contextBridge.exposeInMainWorld('concord', {
    getDefaultServerAddress: () => invoke('app:getDefaultServerAddress'),
    initializeClient: (accessToken: string, serverAddress?: string, refreshToken?: string, expiresIn?: number) =>
        invoke('client:initialize', { accessToken, serverAddress, refreshToken, expiresIn }),

    // Auth
    register: (handle: string, password: string, displayName: string, serverAddress?: string) =>
        invoke('auth:register', { handle, password, displayName, serverAddress }),
    login: (handle: string, password: string, serverAddress?: string) =>
        invoke('auth:login', { handle, password, serverAddress }),
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

    // Rooms
    getRooms: () => invoke('rooms:list'),
    getRoom: (roomId: string) => invoke('rooms:get', { roomId }),
    createRoom: (name: string, region?: string, description?: string, isPrivate?: boolean) =>
        invoke('rooms:create', { name, region, description, isPrivate }),
    updateRoom: (roomId: string, name?: string, description?: string, isPrivate?: boolean) =>
        invoke('rooms:update', { roomId, name, description, isPrivate }),
    deleteRoom: (roomId: string) => invoke('rooms:delete', { roomId }),

    // Membership
    getMembers: (roomId: string) => invoke('rooms:getMembers', { roomId }),
    inviteMember: (roomId: string, userId: string) => invoke('membership:invite', { roomId, userId }),
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
    joinVoice: (roomId: string, audioOnly?: boolean) => invoke('voice:join', { roomId, audioOnly }),
    leaveVoice: (roomId: string) => invoke('voice:leave', { roomId }),
    setMediaPrefs: (roomId: string, audioOnly: boolean, videoEnabled: boolean, muted: boolean) =>
        invoke('voice:setMediaPrefs', { roomId, audioOnly, videoEnabled, muted }),
    getVoiceStatus: (roomId: string) => invoke('voice:getStatus', { roomId }),
    onVoiceSpeaking: (cb: (data: any) => void) => {
        ipcRenderer.on('voice:speaking', (_e, data) => cb(data));
    },
    onVoiceError: (cb: (error: string) => void) => {
        ipcRenderer.on('voice:error', (_e, error) => cb(error));
    },
    onVoiceReconnected: (cb: () => void) => {
        ipcRenderer.on('voice:reconnected', cb);
    },

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
});