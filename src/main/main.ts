import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import ConcordClient from './grpc-client';
import { VoiceClient, VoiceConfig } from './voice-client';

let mainWindow: BrowserWindow | null = null;
let client: ConcordClient | null = null;
let voiceClient: VoiceClient | null = null;
let currentStream: any = null;
let streamInitialized = false;
let keepaliveInterval: NodeJS.Timeout | null = null;
let currentVoiceRoomId: string | null = null;

const LOG_IPC = true;
const LOG_STREAM_EVENTS = true;
const LOG_VERBOSE = true;

const ipcLog = (channel: string, direction: 'IN' | 'OUT', data?: any, error?: any) => {
    if (!LOG_IPC) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const arrow = direction === 'IN' ? '→' : '←';
    const color = direction === 'IN' ? '\x1b[36m' : '\x1b[32m';
    const reset = '\x1b[0m';
    const errorColor = '\x1b[31m';

    if (error) {
        console.log(`${errorColor}[IPC ${timestamp}] ${arrow} ${channel} ERROR:${reset}`, error?.message || error);
    } else if (LOG_VERBOSE && data !== undefined) {
        const preview = JSON.stringify(data, null, 2);
        console.log(`${color}[IPC ${timestamp}] ${arrow} ${channel}${reset}`, preview);
    } else {
        console.log(`${color}[IPC ${timestamp}] ${arrow} ${channel}${reset}`);
    }
};

const streamLog = (event: string, data?: any) => {
    if (!LOG_STREAM_EVENTS) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const color = '\x1b[35m';
    const reset = '\x1b[0m';

    if (LOG_VERBOSE && data) {
        console.log(`${color}[STREAM ${timestamp}] ${event}${reset}`, JSON.stringify(data).slice(0, 150));
    } else {
        console.log(`${color}[STREAM ${timestamp}] ${event}${reset}`);
    }
};

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        show: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#0f172a',
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }

    mainWindow.once('ready-to-show', () => mainWindow?.show());
    mainWindow.on('closed', () => { mainWindow = null; });
}

function assertClient(): ConcordClient {
    if (!client) throw new Error('Client not initialized');
    return client;
}

function startEventStream() {
    if (streamInitialized || currentStream || !client) return;

    streamInitialized = true;
    streamLog('STARTING');

    const stream = client.startEventStream();
    currentStream = stream;

    stream.on('data', (event: any) => {
        const oneofField = typeof event.payload === 'string' ? event.payload : undefined;

        const eventType =
            oneofField ||
            Object.keys(event || {}).find(
                k => !['event_id', 'created_at', 'payload'].includes(k)
            );

        streamLog(`EVENT: ${eventType || 'unknown'}`, event);
        mainWindow?.webContents.send('stream:event', event);
    });

    stream.on('error', async (error: any) => {
        streamLog('ERROR', error?.message || error);
        mainWindow?.webContents.send('stream:error', error.message || String(error));
        currentStream = null;
        streamInitialized = false;

        if (error.code === 16 && client) {
            const refreshed = await client.ensureFreshToken();
            if (refreshed) setTimeout(startEventStream, 2000);
        } else {
            setTimeout(startEventStream, 5000);
        }
    });

    stream.on('end', () => {
        streamLog('ENDED');
        mainWindow?.webContents.send('stream:end');
        currentStream = null;
        streamInitialized = false;
        setTimeout(startEventStream, 3000);
    });

    stream.write({ ack: { event_id: 'init' } });
    streamLog('INITIALIZED');

    if (keepaliveInterval) clearInterval(keepaliveInterval);
    keepaliveInterval = setInterval(() => {
        currentStream?.write({ payload: { ack: { event_id: '' } } });
    }, 30000);
}

type IpcHandler<T = any> = (event: IpcMainInvokeEvent, args: any) => Promise<T>;

function handleIpc<T>(channel: string, handler: IpcHandler<T>): void {
    ipcMain.handle(channel, async (event, args) => {
        ipcLog(channel, 'IN', args);
        try {
            const result = await handler(event, args);
            ipcLog(channel, 'OUT', result);
            return result;
        } catch (error: any) {
            ipcLog(channel, 'OUT', undefined, error);
            throw error;
        }
    });
}

function setupIPC() {
    handleIpc('app:getDefaultServerAddress', async () => {
        return process.env.CONCORD_SERVER || 'localhost:9090';
    });

    handleIpc('client:initialize', async (_e, { accessToken, serverAddress, refreshToken, expiresIn }) => {
        const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';
        if (!client) client = new ConcordClient(address);
        if (accessToken) {
            client.setTokens(accessToken, refreshToken, expiresIn);
            if (!streamInitialized) {
                const valid = await client.ensureFreshToken();
                if (valid) setTimeout(startEventStream, 500);
            }
        }
        return { success: true };
    });

    // Auth
    handleIpc('auth:register', async (_e, { handle, password, displayName, serverAddress }) => {
        const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';
        if (!client) client = new ConcordClient(address);
        const tokens = await client.register(handle, password, displayName) as any;
        client.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
        return tokens;
    });

    handleIpc('auth:login', async (_e, { handle, password, serverAddress }) => {
        const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';
        if (!client) client = new ConcordClient(address);
        const tokens = await client.login(handle, password) as any;
        client.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
        if (!streamInitialized) setTimeout(startEventStream, 500);
        return tokens;
    });

    handleIpc('auth:refresh', async (_e, { refreshToken }) => {
        const c = assertClient();
        const tokens = await c.refreshToken(refreshToken) as any;
        c.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
        return tokens;
    });

    handleIpc('auth:logout', async (_e, { refreshToken }) => {
        return assertClient().logout(refreshToken);
    });

    handleIpc('auth:checkStatus', async () => {
        if (!client) return { authenticated: false };
        return { authenticated: await client.ensureFreshToken() };
    });

    // Users
    handleIpc('users:getSelf', async () => assertClient().getSelf());
    handleIpc('users:getUser', async (_e, { userId }) => assertClient().getUser(userId));
    handleIpc('users:getByHandle', async (_e, { handle }) => assertClient().getUserByHandle(handle));
    handleIpc('users:search', async (_e, { query, limit }) => assertClient().searchUsers(query, limit));
    handleIpc('users:listByIds', async (_e, { userIds }) => assertClient().listUsersByIds(userIds));
    handleIpc('users:updateProfile', async (_e, { displayName, avatarUrl, bio }) =>
        assertClient().updateProfile(displayName, avatarUrl, bio));
    handleIpc('users:updateStatus', async (_e, { status }) => assertClient().updateStatus(status));

    // Rooms
    handleIpc('rooms:list', async () => assertClient().getRooms());
    handleIpc('rooms:get', async (_e, { roomId }) => assertClient().getRoom(roomId));
    handleIpc('rooms:create', async (_e, { name, region, description, isPrivate }) =>
        assertClient().createRoom(name, region, description, isPrivate));
    handleIpc('rooms:update', async (_e, { roomId, name, description, isPrivate }) =>
        assertClient().updateRoom(roomId, name, description, isPrivate));
    handleIpc('rooms:delete', async (_e, { roomId }) => assertClient().deleteRoom(roomId));
    handleIpc('rooms:getMembers', async (_e, { roomId }) => assertClient().getMembers(roomId));

    // Membership
    handleIpc('membership:invite', async (_e, { roomId, userId }) => assertClient().inviteMember(roomId, userId));
    handleIpc('membership:remove', async (_e, { roomId, userId }) => assertClient().removeMember(roomId, userId));
    handleIpc('membership:setRole', async (_e, { roomId, userId, role }) =>
        assertClient().setMemberRole(roomId, userId, role));
    handleIpc('membership:setNickname', async (_e, { roomId, nickname }) =>
        assertClient().setMemberNickname(roomId, nickname));

    // Chat
    handleIpc('chat:list', async (_e, { roomId, limit, beforeId }) =>
        assertClient().getMessages(roomId, limit, beforeId));
    handleIpc('chat:send', async (_e, { roomId, content, replyToId, mentions, attachments }) => {
        let processedAttachments;
        if (attachments?.length) {
            processedAttachments = attachments.map((att: any) => ({
                filename: att.filename,
                content_type: att.content_type,
                data: Array.isArray(att.data) ? new Uint8Array(att.data) : new Uint8Array(Object.values(att.data)),
                width: att.width,
                height: att.height,
            }));
        }
        return assertClient().sendMessage(roomId, content, replyToId, mentions, processedAttachments);
    });
    handleIpc('chat:edit', async (_e, { messageId, content }) => assertClient().editMessage(messageId, content));
    handleIpc('chat:delete', async (_e, { messageId }) => assertClient().deleteMessage(messageId));
    handleIpc('chat:pin', async (_e, { roomId, messageId }) => assertClient().pinMessage(roomId, messageId));
    handleIpc('chat:unpin', async (_e, { roomId, messageId }) => assertClient().unpinMessage(roomId, messageId));
    handleIpc('chat:listPinned', async (_e, { roomId }) => assertClient().listPinnedMessages(roomId));
    handleIpc('chat:addReaction', async (_e, { messageId, emoji }) => assertClient().addReaction(messageId, emoji));
    handleIpc('chat:removeReaction', async (_e, { messageId, emoji }) =>
        assertClient().removeReaction(messageId, emoji));
    handleIpc('chat:search', async (_e, { roomId, query, limit }) =>
        assertClient().searchMessages(roomId, query, limit));
    handleIpc('chat:getThread', async (_e, { messageId, limit, cursor }) =>
        assertClient().getThread(messageId, limit, cursor));

    // Stream
    handleIpc('stream:start', async () => ({ success: true }));
    handleIpc('stream:ack', async (_e, { eventId }) => {
        currentStream?.write({ payload: { ack: { event_id: eventId } } });
        return { success: true };
    });

    // Voice
    handleIpc('voice:join', async (_e, { roomId, audioOnly }) => {
        const response = await assertClient().joinVoice(roomId, audioOnly) as any;

        const config: VoiceConfig = {
            endpoint: response.endpoint,
            serverId: response.server_id,
            voiceToken: response.voice_token,
            codec: response.codec,
            crypto: response.crypto,
            participants: response.participants || [],
        };

        voiceClient = new VoiceClient(config);
        voiceClient.on('speaking', (data) => {
            streamLog('VOICE:speaking', data);
            mainWindow?.webContents.send('voice:speaking', data);
        });
        voiceClient.on('error', (err) => {
            streamLog('VOICE:error', err.message);
            mainWindow?.webContents.send('voice:error', err.message);
        });
        voiceClient.on('reconnected', () => {
            streamLog('VOICE:reconnected');
            mainWindow?.webContents.send('voice:reconnected');
        });

        await voiceClient.connect();
        currentVoiceRoomId = roomId;

        return { success: true, participantCount: response.participants?.length || 0 };
    });

    handleIpc('voice:leave', async (_e, { roomId }) => {
        if (voiceClient) {
            voiceClient.disconnect();
            voiceClient = null;
        }
        if (roomId || currentVoiceRoomId) {
            await assertClient().leaveVoice(roomId || currentVoiceRoomId!);
        }
        currentVoiceRoomId = null;
        return { success: true };
    });

    handleIpc('voice:setMediaPrefs', async (_e, { roomId, audioOnly, videoEnabled, muted }) =>
        assertClient().setMediaPrefs(roomId, audioOnly, videoEnabled, muted));

    handleIpc('voice:getStatus', async (_e, { roomId }) => assertClient().getVoiceStatus(roomId));

    // Friends
    handleIpc('friends:sendRequest', async (_e, { userId }) => assertClient().sendFriendRequest(userId));
    handleIpc('friends:acceptRequest', async (_e, { requestId }) => assertClient().acceptFriendRequest(requestId));
    handleIpc('friends:rejectRequest', async (_e, { requestId }) => assertClient().rejectFriendRequest(requestId));
    handleIpc('friends:cancelRequest', async (_e, { requestId }) => assertClient().cancelFriendRequest(requestId));
    handleIpc('friends:remove', async (_e, { userId }) => assertClient().removeFriend(userId));
    handleIpc('friends:list', async () => assertClient().listFriends());
    handleIpc('friends:listPending', async () => assertClient().listPendingRequests());
    handleIpc('friends:block', async (_e, { userId }) => assertClient().blockUser(userId));
    handleIpc('friends:unblock', async (_e, { userId }) => assertClient().unblockUser(userId));
    handleIpc('friends:listBlocked', async () => assertClient().listBlockedUsers());

    // Admin
    handleIpc('admin:kick', async (_e, { roomId, userId }) => assertClient().kickUser(roomId, userId));
    handleIpc('admin:ban', async (_e, { roomId, userId, durationSeconds }) =>
        assertClient().banUser(roomId, userId, durationSeconds));
    handleIpc('admin:mute', async (_e, { roomId, userId, muted }) =>
        assertClient().muteUser(roomId, userId, muted));

    console.log('\x1b[33m[IPC] All handlers registered\x1b[0m');
}

app.whenReady().then(() => {
    console.log('\x1b[33m[APP] Starting Concord Client...\x1b[0m');
    setupIPC();
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
    console.log('\x1b[33m[APP] Shutting down...\x1b[0m');
    if (keepaliveInterval) clearInterval(keepaliveInterval);
    if (currentStream) { currentStream.end(); currentStream = null; }
    if (voiceClient) voiceClient.disconnect();
    streamInitialized = false;
});