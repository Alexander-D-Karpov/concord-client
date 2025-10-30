import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('concord', {
    getDefaultServerAddress: () => ipcRenderer.invoke('app:getDefaultServerAddress'),

    initializeClient: (accessToken: string, serverAddress?: string) =>
        ipcRenderer.invoke('client:initialize', { accessToken, serverAddress }),

    register: (handle: string, password: string, displayName: string, serverAddress?: string) =>
        ipcRenderer.invoke('auth:register', { handle, password, displayName, serverAddress }),

    login: (handle: string, password: string, serverAddress?: string) =>
        ipcRenderer.invoke('auth:login', { handle, password, serverAddress }),

    refreshToken: (refreshToken: string) =>
        ipcRenderer.invoke('auth:refresh', { refreshToken }),

    getSelf: () =>
        ipcRenderer.invoke('users:getSelf'),

    getUser: (userId: string) =>
        ipcRenderer.invoke('users:getUser', { userId }),

    searchUsers: (query: string, limit?: number) =>
        ipcRenderer.invoke('users:search', { query, limit }),

    updateProfile: (displayName?: string, avatarUrl?: string, bio?: string) =>
        ipcRenderer.invoke('users:updateProfile', { displayName, avatarUrl, bio }),

    updateStatus: (status: string) =>
        ipcRenderer.invoke('users:updateStatus', { status }),

    getRooms: () =>
        ipcRenderer.invoke('rooms:list'),

    createRoom: (name: string, region?: string, description?: string, isPrivate?: boolean) =>
        ipcRenderer.invoke('rooms:create', { name, region, description, isPrivate }),

    updateRoom: (roomId: string, name?: string, description?: string, isPrivate?: boolean) =>
        ipcRenderer.invoke('rooms:update', { roomId, name, description, isPrivate }),

    deleteRoom: (roomId: string) =>
        ipcRenderer.invoke('rooms:delete', { roomId }),

    getMembers: (roomId: string) =>
        ipcRenderer.invoke('rooms:getMembers', { roomId }),

    inviteMember: (roomId: string, userId: string) =>
        ipcRenderer.invoke('membership:invite', { roomId, userId }),

    removeMember: (roomId: string, userId: string) =>
        ipcRenderer.invoke('membership:remove', { roomId, userId }),

    setMemberRole: (roomId: string, userId: string, role: string) =>
        ipcRenderer.invoke('membership:setRole', { roomId, userId, role }),

    setMemberNickname: (roomId: string, nickname: string) =>
        ipcRenderer.invoke('membership:setNickname', { roomId, nickname }),

    getMessages: (roomId: string, limit?: number, beforeId?: string) =>
        ipcRenderer.invoke('chat:list', { roomId, limit, beforeId }),

    sendMessage: (roomId: string, content: string, replyToId?: string, mentions?: string[]) =>
        ipcRenderer.invoke('chat:send', { roomId, content, replyToId, mentions }),

    editMessage: (messageId: string, content: string) =>
        ipcRenderer.invoke('chat:edit', { messageId, content }),

    deleteMessage: (messageId: string) =>
        ipcRenderer.invoke('chat:delete', { messageId }),

    pinMessage: (roomId: string, messageId: string) =>
        ipcRenderer.invoke('chat:pin', { roomId, messageId }),

    unpinMessage: (roomId: string, messageId: string) =>
        ipcRenderer.invoke('chat:unpin', { roomId, messageId }),

    addReaction: (messageId: string, emoji: string) =>
        ipcRenderer.invoke('chat:addReaction', { messageId, emoji }),

    removeReaction: (messageId: string, emoji: string) =>
        ipcRenderer.invoke('chat:removeReaction', { messageId, emoji }),

    searchMessages: (roomId: string, query: string, limit?: number) =>
        ipcRenderer.invoke('chat:search', { roomId, query, limit }),

    uploadAttachment: (file: File) =>
        ipcRenderer.invoke('chat:uploadAttachment', { file }),

    startEventStream: () =>
        ipcRenderer.invoke('stream:start'),

    streamAck: (eventId: string) =>
        ipcRenderer.invoke('stream:ack', { eventId }),

    joinVoice: (roomId: string, audioOnly?: boolean) =>
        ipcRenderer.invoke('voice:join', { roomId, audioOnly }),

    leaveVoice: () =>
        ipcRenderer.invoke('voice:leave'),

    setMuted: (muted: boolean) =>
        ipcRenderer.invoke('voice:setMuted', { muted }),

    setVideoEnabled: (enabled: boolean) =>
        ipcRenderer.invoke('voice:setVideoEnabled', { enabled }),

    onVoiceSpeaking: (callback: (data: any) => void) => {
        ipcRenderer.on('voice:speaking', (_event, data) => callback(data));
    },

    onVoiceError: (callback: (error: string) => void) => {
        ipcRenderer.on('voice:error', (_event, error) => callback(error));
    },

    onVoiceReconnected: (callback: () => void) => {
        ipcRenderer.on('voice:reconnected', callback);
    },

    onVoiceVideoFrame: (callback: (data: any) => void) => {
        ipcRenderer.on('voice:video-frame', (_event, data) => callback(data));
    },
});