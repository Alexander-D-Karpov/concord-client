import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('concord', {
    login: (handle: string, password: string) =>
        ipcRenderer.invoke('auth:login', { handle, password }),

    getSelf: () => ipcRenderer.invoke('users:getSelf'),

    getRooms: () => ipcRenderer.invoke('rooms:list'),
    createRoom: (name: string) => ipcRenderer.invoke('rooms:create', { name }),

    getMessages: (roomId: string, limit?: number) =>
        ipcRenderer.invoke('chat:list', { roomId, limit }),

    sendMessage: (roomId: string, content: string) =>
        ipcRenderer.invoke('chat:send', { roomId, content }),
});
