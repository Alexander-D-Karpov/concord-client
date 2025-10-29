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

    getRooms: () =>
        ipcRenderer.invoke('rooms:list'),

    createRoom: (name: string, region?: string) =>
        ipcRenderer.invoke('rooms:create', { name, region }),

    getMembers: (roomId: string) =>
        ipcRenderer.invoke('rooms:getMembers', { roomId }),

    getMessages: (roomId: string, limit?: number, beforeId?: string) =>
        ipcRenderer.invoke('chat:list', { roomId, limit, beforeId }),

    sendMessage: (roomId: string, content: string) =>
        ipcRenderer.invoke('chat:send', { roomId, content }),

    startEventStream: () =>
        ipcRenderer.invoke('stream:start'),

    subscribeToRooms: (roomIds: string[]) =>
        ipcRenderer.invoke('stream:subscribe', { roomIds }),

    unsubscribeFromRooms: (roomIds: string[]) =>
        ipcRenderer.invoke('stream:unsubscribe', { roomIds }),

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