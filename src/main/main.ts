import { app, BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import ConcordClient from './grpc-client';
import { VoiceClient, VoiceConfig } from './voice-client';

let mainWindow: BrowserWindow | null = null;
let client: ConcordClient | null = null;
let voiceClient: VoiceClient | null = null;
let currentVoiceRoomId: string | null = null;
let currentUserId: string | null = null;
let currentStream: any = null;
let streamInitialized = false;
let keepaliveInterval: NodeJS.Timeout | null = null;
let currentVoiceAudioOnly: boolean | null = null;
let voiceJoinPromise: Promise<any> | null = null;
let voiceJoinKey: string | null = null;



const LOG_IPC = false;
const LOG_STREAM_EVENTS = false;
const LOG_VERBOSE = false;

function configureHardwareAcceleration() {
    app.commandLine.appendSwitch('ignore-gpu-blocklist');

    if (process.platform === 'linux') {
        app.commandLine.appendSwitch('disable-gpu-sandbox');
        app.commandLine.appendSwitch('use-angle', 'gl');
        app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder,VaapiVideoEncoder');
        app.commandLine.appendSwitch('use-gl', 'desktop');
    }

    if (process.platform === 'win32' || process.platform === 'darwin') {
        app.commandLine.appendSwitch('enable-gpu-rasterization');
        app.commandLine.appendSwitch('enable-accelerated-video-decode');
        app.commandLine.appendSwitch('enable-accelerated-video-encode');
        app.commandLine.appendSwitch('enable-features', 'PlatformHEVCEncoderSupport');
    }
}

configureHardwareAcceleration();

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
            backgroundThrottling: false,  // Critical for media apps
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

    mainWindow.webContents.on('render-process-gone', (_e, details) => {
        console.error('[Main] RENDERER GONE:', details); // reason, exitCode, etc
    });

    mainWindow.webContents.on('unresponsive', () => {
        console.error('[Main] Renderer unresponsive');
    });

    process.on('uncaughtException', (err) => {
        console.error('[Main] uncaughtException:', err);
    });
    process.on('unhandledRejection', (err) => {
        console.error('[Main] unhandledRejection:', err);
    });

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

function setupVoiceClientListeners() {
    if (!voiceClient) return;

    voiceClient.on('speaking', (data) => {
        mainWindow?.webContents.send('voice:speaking', data);
    });

    voiceClient.on('participant-joined', (data) => {
        console.log('[Main] Voice participant joined:', data);
        mainWindow?.webContents.send('voice:participant-joined', data);
    });

    voiceClient.on("participant-left", (data) => {
        mainWindow?.webContents.send("voice:participant-left", data);
    });

    voiceClient.on('media-state', (data) => {
        mainWindow?.webContents.send('voice:media-state', data);
    });

    voiceClient.on('local-speaking', (speaking) => {
        mainWindow?.webContents.send('voice:local-speaking', speaking);
    });

    voiceClient.on('decrypt-error', (data) => {
        console.error('[Main] Decrypt error:', data);
    });

    voiceClient.on('error', (err) => {
        console.error('[Main] Voice error:', err);
        mainWindow?.webContents.send('voice:error', err.message || String(err));
    });

    voiceClient.on('reconnected', () => {
        console.log('[Main] Voice reconnected');
        mainWindow?.webContents.send('voice:reconnected');
    });

    voiceClient.on('disconnect', () => {
        console.log('[Main] Voice disconnected');
        mainWindow?.webContents.send('voice:disconnected');
    });

    voiceClient.on('audio', (data) => {
        mainWindow?.webContents.send('voice:audio', {
            ssrc: data.ssrc,
            sequence: data.sequence,
            timestamp: data.timestamp,
            pts: data.pts,
            data: data.data, // Buffer is fine
        });
    });

    voiceClient.on('video', (data) => {
        mainWindow?.webContents.send('voice:video', {
            ssrc: data.ssrc,
            sequence: data.sequence,
            timestamp: data.timestamp,
            pts: data.pts,
            isKeyframe: data.isKeyframe,
            data: data.data, // Buffer
        });
    });


    voiceClient.on('rtt', (rtt) => {
        mainWindow?.webContents.send('voice:rtt', rtt);
    });
}

function setupIPC() {
    handleIpc('app:getDefaultServerAddress', async () => {
        return process.env.CONCORD_SERVER || 'localhost:9090';
    });

    handleIpc('app:getGPUInfo', async () => {
        const gpuInfo = (await app.getGPUInfo('complete')) as any;

        return {
            vendor: gpuInfo?.gpuDevice?.[0]?.vendorId ?? null,
            device: gpuInfo?.gpuDevice?.[0]?.deviceId ?? null,
            driver: gpuInfo?.gpuDevice?.[0]?.driverVersion ?? null,
        };
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

    handleIpc('auth:loginOAuth', async (_e, { provider, code, redirectUri }) => {
        const c = assertClient();
        const tokens = await c.loginOAuth(provider, code, redirectUri) as any;
        c.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
        if (!streamInitialized) setTimeout(startEventStream, 500);
        return tokens;
    });

    handleIpc('auth:oauthBegin', async (_e, { provider, redirectUri }) => {
        return assertClient().oauthBegin(provider, redirectUri);
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
    handleIpc('users:getSelf', async () => {
        const user = await assertClient().getSelf() as any;
        currentUserId = user?.id;
        return user;
    });
    handleIpc('users:getUser', async (_e, { userId }) => {
        if (!userId || typeof userId !== 'string') {
            throw new Error('users:getUser: userId is required');
        }
        return assertClient().getUser(userId);
    });
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
    handleIpc('rooms:attachVoiceServer', async (_e, { roomId, voiceServerId }) =>
        assertClient().attachVoiceServer(roomId, voiceServerId));

    // Membership
    handleIpc('membership:invite', async (_e, { roomId, userId }) => assertClient().inviteMember(roomId, userId));
    handleIpc('membership:acceptInvite', async (_e, { inviteId }) => assertClient().acceptRoomInvite(inviteId));
    handleIpc('membership:rejectInvite', async (_e, { inviteId }) => assertClient().rejectRoomInvite(inviteId));
    handleIpc('membership:cancelInvite', async (_e, { inviteId }) => assertClient().cancelRoomInvite(inviteId));
    handleIpc('membership:listInvites', async () => assertClient().listRoomInvites());
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

    handleIpc('screen:getSources', async () => {
        const { desktopCapturer } = require('electron');
        const sources = await desktopCapturer.getSources({
            types: ['window', 'screen'],
            thumbnailSize: { width: 150, height: 150 }
        });
        return sources.map((source: Electron.DesktopCapturerSource) => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL()
        }));
    });

    // Voice
    handleIpc("voice:join", async (_e, { roomId, audioOnly }) => {
        if (!currentUserId) {
            const self = (await assertClient().getSelf()) as any;
            currentUserId = self?.id;
        }
        if (!currentUserId) throw new Error("User ID not available");

        const joinKey = `${roomId}:${audioOnly ? 1 : 0}`;

        if (voiceClient && voiceClient.isConnected() && currentVoiceRoomId === roomId && currentVoiceAudioOnly === !!audioOnly) {
            const welcomeParticipants = voiceClient.getParticipants();
            return {
                success: true,
                ssrc: voiceClient.getSSRC(),
                videoSsrc: voiceClient.getVideoSSRC(),
                sessionId: voiceClient.getSessionId(),
                participants: welcomeParticipants,
                participantCount: welcomeParticipants.length,
            };
        }

        if (voiceJoinPromise && voiceJoinKey === joinKey) {
            return await voiceJoinPromise;
        }

        voiceJoinKey = joinKey;

        voiceJoinPromise = (async () => {
            if (voiceClient) {
                if (voiceClient.isConnected()) {
                    voiceClient.disconnect();
                }
                voiceClient.removeAllListeners();
                voiceClient = null;
            }

            if (currentVoiceRoomId && currentVoiceRoomId !== roomId) {
                try {
                    await assertClient().leaveVoice(currentVoiceRoomId);
                } catch {}
            }

            const response = (await assertClient().joinVoice(roomId, !!audioOnly)) as any;

            const toUint8Array = (data: any): Uint8Array => {
                if (data instanceof Uint8Array) return data;
                if (Buffer.isBuffer(data)) return new Uint8Array(data);
                if (Array.isArray(data)) return new Uint8Array(data);
                if (typeof data === "string") {
                    try {
                        return new Uint8Array(Buffer.from(data, "base64"));
                    } catch {
                        return new Uint8Array(Buffer.from(data));
                    }
                }
                if (data && typeof data === "object") {
                    if (data.type === "Buffer" && Array.isArray(data.data)) return new Uint8Array(data.data);
                    const values = Object.values(data);
                    if (values.every((v) => typeof v === "number")) return new Uint8Array(values as number[]);
                }
                return new Uint8Array(0);
            };

            const keyIdBytes = toUint8Array(response.crypto?.key_id ?? response.crypto?.keyId);
            const keyId = keyIdBytes.length ? keyIdBytes[0] : (typeof response.crypto?.key_id === "number" ? response.crypto.key_id : 0);

            const keyMaterial = toUint8Array(response.crypto?.key_material ?? response.crypto?.keyMaterial);

            let endpointHost = response.endpoint?.host || "localhost";
            let endpointPort = response.endpoint?.port || 7885;

            if (endpointHost.includes(':')) {
                const parts = endpointHost.split(':');
                endpointHost = parts[0];
                if (parts[1] && !response.endpoint?.port) {
                    endpointPort = parseInt(parts[1], 10);
                }
            }

            const config: VoiceConfig = {
                endpoint: {
                    host: endpointHost,
                    port: endpointPort,
                },
                serverId: response.server_id || "",
                voiceToken: response.voice_token || "",
                roomId,
                userId: currentUserId,
                codec: {
                    audio: response.codec?.audio || "opus",
                    video: audioOnly ? undefined : (response.codec?.video || "h264"),
                },
                crypto: {
                    aead: "aes-256-gcm",
                    keyId,
                    keyMaterial,
                },
                participants: [],
            };

            voiceClient = new VoiceClient(config);
            setupVoiceClientListeners();

            await voiceClient.connect();

            currentVoiceRoomId = roomId;
            currentVoiceAudioOnly = !!audioOnly;

            const welcomeParticipants = voiceClient.getParticipants();

            return {
                success: true,
                ssrc: voiceClient.getSSRC(),
                videoSsrc: voiceClient.getVideoSSRC(),
                sessionId: voiceClient.getSessionId(),
                participants: welcomeParticipants,
                participantCount: welcomeParticipants.length,
            };
        })();

        try {
            return await voiceJoinPromise;
        } finally {
            voiceJoinPromise = null;
            voiceJoinKey = null;
        }
    });

    handleIpc("voice:leave", async (_e, { roomId }) => {
        const targetRoom = roomId || currentVoiceRoomId;

        if (voiceClient) {
            voiceClient.disconnect();
            voiceClient.removeAllListeners();
            voiceClient = null;
        }

        if (targetRoom) {
            try {
                await assertClient().leaveVoice(targetRoom);
            } catch {}
        }

        currentVoiceRoomId = null;
        currentVoiceAudioOnly = null;

        return { success: true };
    });

    ipcMain.on('voice:sendAudio', (_e, data: Uint8Array) => {
        if (!voiceClient || !voiceClient.isConnected()) return;
        voiceClient.sendAudio(Buffer.from(data));
    });


    ipcMain.on(
        'voice:sendVideo',
        (_e, payload: { data: Uint8Array | ArrayBuffer; isKeyframe?: boolean }) => {
            if (!voiceClient || !voiceClient.isConnected()) return;

            const u8 =
                payload.data instanceof ArrayBuffer
                    ? new Uint8Array(payload.data)
                    : payload.data;

            voiceClient.sendVideo(Buffer.from(u8), !!payload.isKeyframe);
        }
    );

    handleIpc('voice:setSpeaking', async (_e, { speaking }) => {
        if (voiceClient?.isConnected()) {
            voiceClient.setSpeaking(speaking);
        }
        return { success: true };
    });

    handleIpc('voice:getStatus', async (_e, { roomId }) => assertClient().getVoiceStatus(roomId));

    handleIpc('voice:isConnected', async () => {
        return { connected: voiceClient?.isConnected() ?? false };
    });

    handleIpc('voice:getParticipants', async () => {
        if (!voiceClient || !currentVoiceRoomId) {
            return { participants: [] };
        }
        try {
            const status = await assertClient().getVoiceStatus(currentVoiceRoomId) as any;
            return { participants: status?.participants || [] };
        } catch (err) {
            console.error('[Main] Failed to get voice participants:', err);
            return { participants: [] };
        }
    });

    handleIpc('voice:setMediaState', async (_e, { muted, videoEnabled }) => {
        if (voiceClient?.isConnected()) {
            voiceClient.setMediaState(muted, videoEnabled);
        }
        return { success: true };
    });

    handleIpc('voice:setMediaPrefs', async (_e, { roomId, audioOnly, videoEnabled, muted }) => {
        if (voiceClient?.isConnected()) {
            voiceClient.setMediaState(muted, videoEnabled);
        }
        return assertClient().setMediaPrefs(roomId, audioOnly, videoEnabled, muted);
    });

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

    // DM
    handleIpc('dm:getOrCreate', async (_e, { userId }) => assertClient().getOrCreateDM(userId));
    handleIpc('dm:list', async () => assertClient().listDMs());
    handleIpc('dm:close', async (_e, { channelId }) => assertClient().closeDM(channelId));
    handleIpc('dm:sendMessage', async (_e, { channelId, content, attachments }) =>
        assertClient().sendDMMessage(channelId, content, attachments));
    handleIpc('dm:listMessages', async (_e, { channelId, limit, beforeId }) =>
        assertClient().listDMMessages(channelId, limit, beforeId));
    handleIpc('dm:startCall', async (_e, { channelId, audioOnly }) =>
        assertClient().startDMCall(channelId, audioOnly));
    handleIpc('dm:joinCall', async (_e, { channelId, audioOnly }) =>
        assertClient().joinDMCall(channelId, audioOnly));
    handleIpc('dm:leaveCall', async (_e, { channelId }) => assertClient().leaveDMCall(channelId));
    handleIpc('dm:endCall', async (_e, { channelId }) => assertClient().endDMCall(channelId));
    handleIpc('dm:callStatus', async (_e, { channelId }) => assertClient().getDMCallStatus(channelId));

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
    if (voiceClient) {
        voiceClient.disconnect();
        voiceClient.removeAllListeners();
        voiceClient = null;
    }
    streamInitialized = false;
});