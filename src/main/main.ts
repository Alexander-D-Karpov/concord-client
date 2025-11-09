import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import ConcordClient from './grpc-client';
import { VoiceClient, VoiceConfig } from './voice-client';
import { AudioManager } from './audio-manager';
import { VideoManager } from './video-manager';

let mainWindow: BrowserWindow | null = null;
let client: ConcordClient | null = null;
let voiceClient: VoiceClient | null = null;
let audioManager: AudioManager | null = null;
let videoManager: VideoManager | null = null;
let currentStream: any = null;
let streamRetryCount = 0;
let streamRetryTimeout: NodeJS.Timeout | null = null;
const MAX_STREAM_RETRIES = 5;
const BASE_RETRY_DELAY = 1000;
let streamInitialized = false;

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

    mainWindow.once('ready-to-show', () => {
        mainWindow?.show();
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function assertClient() {
    if (!client) throw new Error('Client not initialized');
    return client;
}

function clearStreamRetry() {
    if (streamRetryTimeout) {
        clearTimeout(streamRetryTimeout);
        streamRetryTimeout = null;
    }
}

let keepaliveInterval: NodeJS.Timeout | null = null;

function startEventStreamInternal() {
    if (streamInitialized || currentStream) {
        console.log('[Main] Stream already initialized');
        return;
    }

    const c = client;
    if (!c) {
        console.error('[Main] No client available for stream');
        return;
    }

    try {
        console.log('[Main] Starting internal event stream');
        streamInitialized = true;

        const stream = c.startEventStream();
        currentStream = stream;

        stream.on('data', (event: any) => {
            console.log('[Main] Stream event:', event?.event_id);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stream:event', event);
            }
        });

        stream.on('error', async (error: any) => {
            console.error('[Main] Stream error:', error);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stream:error', error.message || String(error));
            }

            currentStream = null;
            streamInitialized = false;

            if (error.code === 16) {
                console.log('[Main] Authentication error, attempting token refresh...');
                try {
                    await c.ensureFreshToken();
                    console.log('[Main] Token refreshed, retrying stream in 2s...');
                    setTimeout(() => {
                        if (client) startEventStreamInternal();
                    }, 2000);
                } catch (err) {
                    console.error('[Main] Token refresh failed, giving up on stream');
                }
            } else {
                setTimeout(() => {
                    if (client) startEventStreamInternal();
                }, 5000);
            }
        });

        stream.on('end', () => {
            console.log('[Main] Stream ended');
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('stream:end');
            }
            currentStream = null;
            streamInitialized = false;

            setTimeout(() => {
                if (client) startEventStreamInternal();
            }, 3000);
        });

        try {
            stream.write({ payload: { ack: { event_id: 'init' } } });
            console.log('[Main] Sent initial keepalive');
        } catch (err) {
            console.error('[Main] Failed to send initial keepalive:', err);
        }

        if (keepaliveInterval) {
            clearInterval(keepaliveInterval);
        }

        keepaliveInterval = setInterval(() => {
            if (currentStream) {
                try {
                    currentStream.write({ payload: { ack: { event_id: '' } } });
                } catch (err) {
                    console.error('[Main] Keepalive failed:', err);
                }
            }
        }, 30000);

        console.log('[Main] Event stream initialized');
    } catch (error: any) {
        console.error('[Main] Failed to start internal stream:', error);
        streamInitialized = false;
        currentStream = null;
    }
}

function setupIPC() {
    ipcMain.handle('client:initialize', async (_e, { accessToken, serverAddress, refreshToken, expiresIn }) => {
        try {
            console.log('[Main] Initializing client:', {
                hasAccessToken: !!accessToken,
                hasRefreshToken: !!refreshToken,
                serverAddress: serverAddress || 'default',
                expiresIn,
            });

            const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';
            if (!client) client = new ConcordClient(address);

            if (accessToken) {
                client.setTokens(accessToken, refreshToken, expiresIn);
            }

            if (accessToken && !streamInitialized) {
                const hasValidToken = await client.ensureFreshToken();
                if (hasValidToken) {
                    setTimeout(() => {
                        startEventStreamInternal();
                    }, 500);
                } else {
                    console.warn('[Main] Token not valid, skipping stream start');
                }
            }

            console.log('[Main] Client initialized successfully');
            return { success: true };
        } catch (error: any) {
            console.error('[Main] Failed to initialize client:', error);
            throw new Error(error?.message || 'Failed to initialize client');
        }
    });

    ipcMain.handle('auth:register', async (_e, { handle, password, displayName, serverAddress }) => {
        try {
            console.log('[Main] Registering user:', { handle, displayName });
            const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';

            if (!client) {
                client = new ConcordClient(address);
            }

            const tokens = await client.register(handle, password, displayName) as {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };

            client.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
            console.log('[Main] Registration successful');
            return tokens;
        } catch (error: any) {
            console.error('[Main] Registration failed:', error);
            throw new Error(error?.message || 'Registration failed');
        }
    });

    ipcMain.handle('auth:checkStatus', async () => {
        try {
            if (!client) {
                return { authenticated: false };
            }

            const canRefresh = await client.ensureFreshToken();
            return { authenticated: canRefresh };
        } catch (err) {
            return { authenticated: false };
        }
    });

    ipcMain.handle('auth:login', async (_e, { handle, password, serverAddress }) => {
        try {
            console.log('[Main] Logging in user:', { handle });
            const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';

            if (!client) {
                client = new ConcordClient(address);
            }

            const tokens = await client.login(handle, password) as {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };

            client.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);

            if (!streamInitialized) {
                setTimeout(() => {
                    startEventStreamInternal();
                }, 500);
            }

            console.log('[Main] Login successful');
            return tokens;
        } catch (error: any) {
            console.error('[Main] Login failed:', error);
            throw new Error(error?.message || 'Login failed');
        }
    });

    ipcMain.handle('auth:refresh', async (_e, { refreshToken }) => {
        try {
            console.log('[Main] Refreshing token');
            if (!client) throw new Error('Client not initialized');

            const tokens = await client.refreshToken(refreshToken) as {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };

            client.setTokens(tokens.access_token, tokens.refresh_token, tokens.expires_in);
            console.log('[Main] Token refresh successful');
            return tokens;
        } catch (error: any) {
            console.error('[Main] Token refresh failed:', error);
            throw new Error(error?.message || 'Token refresh failed');
        }
    });

    ipcMain.handle('users:getSelf', async () => {
        try {
            console.log('[Main] Getting self user');
            if (!client) throw new Error('Client not initialized');
            const result = await client.getSelf() as any;
            console.log('[Main] Got self user:', result?.id);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get self:', error);
            throw new Error(error?.message || 'Failed to get user');
        }
    });

    ipcMain.handle('users:getUser', async (_e, { userId }) => {
        try {
            console.log('[Main] Getting user:', userId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.getUser(userId) as any;
            console.log('[Main] Got user:', result?.id);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get user:', error);
            throw new Error(error?.message || 'Failed to get user');
        }
    });

    ipcMain.handle('users:search', async (_e, { query, limit }) => {
        try {
            console.log('[Main] Searching users:', { query, limit });
            if (!client) throw new Error('Client not initialized');
            const result = await client.searchUsers(query, limit) as any;
            console.log('[Main] Found users:', result?.users?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to search users:', error);
            throw new Error(error?.message || 'Failed to search users');
        }
    });

    ipcMain.handle('users:updateProfile', async (_e, { displayName, avatarUrl, bio }) => {
        try {
            console.log('[Main] Updating profile');
            if (!client) throw new Error('Client not initialized');
            const result = await client.updateProfile(displayName, avatarUrl, bio);
            console.log('[Main] Profile updated');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to update profile:', error);
            throw new Error(error?.message || 'Failed to update profile');
        }
    });

    ipcMain.handle('users:updateStatus', async (_e, { status }) => {
        try {
            console.log('[Main] Updating status:', status);
            if (!client) throw new Error('Client not initialized');
            const result = await client.updateStatus(status);
            console.log('[Main] Status updated');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to update status:', error);
            throw new Error(error?.message || 'Failed to update status');
        }
    });

    ipcMain.handle('rooms:list', async () => {
        const c = assertClient();
        try {
            console.log('[Main] Listing rooms');
            const result = await c.getRooms() as any;
            console.log('[Main] Got rooms:', result?.rooms?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to list rooms:', error);
            throw error;
        }
    });

    ipcMain.handle('rooms:create', async (_e, { name, region, description, isPrivate }) => {
        try {
            console.log('[Main] Creating room:', { name, region, isPrivate });
            if (!client) throw new Error('Client not initialized');
            const result = await client.createRoom(name, region, description, isPrivate) as any;
            console.log('[Main] Room created:', result?.id);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to create room:', error);
            throw new Error(error?.message || 'Failed to create room');
        }
    });

    ipcMain.handle('rooms:update', async (_e, { roomId, name, description, isPrivate }) => {
        try {
            console.log('[Main] Updating room:', roomId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.updateRoom(roomId, name, description, isPrivate);
            console.log('[Main] Room updated');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to update room:', error);
            throw new Error(error?.message || 'Failed to update room');
        }
    });

    ipcMain.handle('rooms:delete', async (_e, { roomId }) => {
        try {
            console.log('[Main] Deleting room:', roomId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.deleteRoom(roomId);
            console.log('[Main] Room deleted');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to delete room:', error);
            throw new Error(error?.message || 'Failed to delete room');
        }
    });

    ipcMain.handle('rooms:getMembers', async (_e, { roomId }) => {
        try {
            console.log('[Main] Getting members for room:', roomId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.getMembers(roomId) as any;
            console.log('[Main] Got members:', result?.members?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get members:', error);
            throw new Error(error?.message || 'Failed to get members');
        }
    });

    ipcMain.handle('membership:invite', async (_e, { roomId, userId }) => {
        try {
            console.log('[Main] Inviting member:', { roomId, userId });
            if (!client) throw new Error('Client not initialized');
            const result = await client.inviteMember(roomId, userId);
            console.log('[Main] Member invited');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to invite member:', error);
            throw new Error(error?.message || 'Failed to invite member');
        }
    });

    ipcMain.handle('membership:remove', async (_e, { roomId, userId }) => {
        try {
            console.log('[Main] Removing member:', { roomId, userId });
            if (!client) throw new Error('Client not initialized');
            const result = await client.removeMember(roomId, userId);
            console.log('[Main] Member removed');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to remove member:', error);
            throw new Error(error?.message || 'Failed to remove member');
        }
    });

    ipcMain.handle('membership:setRole', async (_e, { roomId, userId, role }) => {
        try {
            console.log('[Main] Setting member role:', { roomId, userId, role });
            if (!client) throw new Error('Client not initialized');
            const result = await client.setMemberRole(roomId, userId, role);
            console.log('[Main] Role set');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to set role:', error);
            throw new Error(error?.message || 'Failed to set role');
        }
    });

    ipcMain.handle('membership:setNickname', async (_e, { roomId, nickname }) => {
        try {
            console.log('[Main] Setting nickname:', { roomId, nickname });
            if (!client) throw new Error('Client not initialized');
            const result = await client.setMemberNickname(roomId, nickname);
            console.log('[Main] Nickname set');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to set nickname:', error);
            throw new Error(error?.message || 'Failed to set nickname');
        }
    });

    ipcMain.handle('chat:list', async (_e, { roomId, limit, beforeId }) => {
        try {
            console.log('[Main] Listing messages:', { roomId, limit, beforeId });
            if (!client) throw new Error('Client not initialized');
            const result = await client.getMessages(roomId, limit, beforeId) as any;
            console.log('[Main] Got messages:', result?.messages?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get messages:', error);
            throw new Error(error?.message || 'Failed to get messages');
        }
    });

    ipcMain.handle('chat:send', async (_e, { roomId, content, replyToId, mentions, attachments }) => {
        try {
            console.log('[Main] Sending message:', {
                roomId,
                contentLength: content?.length || 0,
                hasReply: !!replyToId,
                mentionsCount: mentions?.length || 0,
                attachmentsCount: attachments?.length || 0,
            });

            if (!client) throw new Error('Client not initialized');

            let processedAttachments;
            if (attachments && attachments.length > 0) {
                processedAttachments = attachments.map((att: any) => {
                    let data: Uint8Array;

                    if (att.data instanceof Uint8Array) {
                        data = att.data;
                    } else if (Array.isArray(att.data)) {
                        data = new Uint8Array(att.data);
                    } else if (Buffer.isBuffer(att.data)) {
                        data = new Uint8Array(att.data);
                    } else {
                        data = new Uint8Array(Object.values(att.data));
                    }

                    console.log('[Main] Processed attachment:', {
                        filename: att.filename,
                        size: data.length,
                    });

                    return {
                        filename: att.filename,
                        content_type: att.content_type,
                        data,
                        width: att.width,
                        height: att.height,
                    };
                });
            }

            const result = await client.sendMessage(roomId, content, replyToId, mentions, processedAttachments) as any;
            console.log('[Main] Message sent:', result?.message?.id);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to send message:', error);
            throw new Error(error?.message || 'Failed to send message');
        }
    });

    ipcMain.handle('chat:edit', async (_e, { messageId, content }) => {
        try {
            console.log('[Main] Editing message:', messageId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.editMessage(messageId, content);
            console.log('[Main] Message edited');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to edit message:', error);
            throw new Error(error?.message || 'Failed to edit message');
        }
    });

    ipcMain.handle('chat:delete', async (_e, { messageId }) => {
        try {
            console.log('[Main] Deleting message:', messageId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.deleteMessage(messageId);
            console.log('[Main] Message deleted');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to delete message:', error);
            throw new Error(error?.message || 'Failed to delete message');
        }
    });

    ipcMain.handle('chat:pin', async (_e, { roomId, messageId }) => {
        try {
            console.log('[Main] Pinning message:', { roomId, messageId });
            if (!client) throw new Error('Client not initialized');
            const result = await client.pinMessage(roomId, messageId);
            console.log('[Main] Message pinned');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to pin message:', error);
            throw new Error(error?.message || 'Failed to pin message');
        }
    });

    ipcMain.handle('chat:unpin', async (_e, { roomId, messageId }) => {
        try {
            console.log('[Main] Unpinning message:', { roomId, messageId });
            if (!client) throw new Error('Client not initialized');
            const result = await client.unpinMessage(roomId, messageId);
            console.log('[Main] Message unpinned');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to unpin message:', error);
            throw new Error(error?.message || 'Failed to unpin message');
        }
    });

    ipcMain.handle('chat:addReaction', async (_e, { messageId, emoji }) => {
        try {
            console.log('[Main] Adding reaction:', { messageId, emoji });
            if (!client) throw new Error('Client not initialized');
            const result = await client.addReaction(messageId, emoji);
            console.log('[Main] Reaction added');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to add reaction:', error);
            throw new Error(error?.message || 'Failed to add reaction');
        }
    });

    ipcMain.handle('chat:removeReaction', async (_e, { messageId, emoji }) => {
        try {
            console.log('[Main] Removing reaction:', { messageId, emoji });
            if (!client) throw new Error('Client not initialized');
            const result = await client.removeReaction(messageId, emoji);
            console.log('[Main] Reaction removed');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to remove reaction:', error);
            throw new Error(error?.message || 'Failed to remove reaction');
        }
    });

    ipcMain.handle('chat:search', async (_e, { roomId, query, limit }) => {
        try {
            console.log('[Main] Searching messages:', { roomId, query, limit });
            if (!client) throw new Error('Client not initialized');
            const result = await client.searchMessages(roomId, query, limit) as any;
            console.log('[Main] Found messages:', result?.messages?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to search messages:', error);
            throw new Error(error?.message || 'Failed to search messages');
        }
    });

    ipcMain.handle('friends:sendRequest', async (_e, { userId }) => {
        try {
            console.log('[Main] Sending friend request:', userId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.sendFriendRequest(userId);
            console.log('[Main] Friend request sent');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to send friend request:', error);
            throw new Error(error?.message || 'Failed to send friend request');
        }
    });

    ipcMain.handle('friends:acceptRequest', async (_e, { requestId }) => {
        try {
            console.log('[Main] Accepting friend request:', requestId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.acceptFriendRequest(requestId);
            console.log('[Main] Friend request accepted');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to accept friend request:', error);
            throw new Error(error?.message || 'Failed to accept friend request');
        }
    });

    ipcMain.handle('friends:rejectRequest', async (_e, { requestId }) => {
        try {
            console.log('[Main] Rejecting friend request:', requestId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.rejectFriendRequest(requestId);
            console.log('[Main] Friend request rejected');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to reject friend request:', error);
            throw new Error(error?.message || 'Failed to reject friend request');
        }
    });

    ipcMain.handle('friends:cancelRequest', async (_e, { requestId }) => {
        try {
            console.log('[Main] Canceling friend request:', requestId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.cancelFriendRequest(requestId);
            console.log('[Main] Friend request canceled');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to cancel friend request:', error);
            throw new Error(error?.message || 'Failed to cancel friend request');
        }
    });

    ipcMain.handle('friends:remove', async (_e, { userId }) => {
        try {
            console.log('[Main] Removing friend:', userId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.removeFriend(userId);
            console.log('[Main] Friend removed');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to remove friend:', error);
            throw new Error(error?.message || 'Failed to remove friend');
        }
    });

    ipcMain.handle('friends:list', async () => {
        try {
            console.log('[Main] Listing friends');
            if (!client) throw new Error('Client not initialized');
            const result = await client.listFriends() as any;
            console.log('[Main] Got friends:', result?.friends?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to list friends:', error);
            throw new Error(error?.message || 'Failed to list friends');
        }
    });

    ipcMain.handle('friends:listPending', async () => {
        try {
            console.log('[Main] Listing pending requests');
            if (!client) throw new Error('Client not initialized');
            const result = await client.listPendingRequests() as any;
            console.log('[Main] Got pending requests:', {
                incoming: result?.incoming?.length || 0,
                outgoing: result?.outgoing?.length || 0,
            });
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to list pending requests:', error);
            throw new Error(error?.message || 'Failed to list pending requests');
        }
    });

    ipcMain.handle('friends:block', async (_e, { userId }) => {
        try {
            console.log('[Main] Blocking user:', userId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.blockUser(userId);
            console.log('[Main] User blocked');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to block user:', error);
            throw new Error(error?.message || 'Failed to block user');
        }
    });

    ipcMain.handle('friends:unblock', async (_e, { userId }) => {
        try {
            console.log('[Main] Unblocking user:', userId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.unblockUser(userId);
            console.log('[Main] User unblocked');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to unblock user:', error);
            throw new Error(error?.message || 'Failed to unblock user');
        }
    });

    ipcMain.handle('friends:listBlocked', async () => {
        try {
            console.log('[Main] Listing blocked users');
            if (!client) throw new Error('Client not initialized');
            const result = await client.listBlockedUsers() as any;
            console.log('[Main] Got blocked users:', result?.user_ids?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to list blocked users:', error);
            throw new Error(error?.message || 'Failed to list blocked users');
        }
    });

    ipcMain.handle('voice:getStatus', async (_e, { roomId }) => {
        try {
            console.log('[Main] Getting voice status:', roomId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.getVoiceStatus(roomId) as any;
            console.log('[Main] Got voice status:', {
                participants: result?.participants?.length || 0,
            });
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get voice status:', error);
            throw new Error(error?.message || 'Failed to get voice status');
        }
    });

    ipcMain.handle('stream:start', async () => {
        console.log('[Main] Stream start requested');
        return { success: true };
    });

    ipcMain.handle('auth:logout', async (_e, { refreshToken }) => {
        try {
            console.log('[Main] Logging out');
            if (!client) throw new Error('Client not initialized');
            const result = await client.logout(refreshToken);
            console.log('[Main] Logout successful');
            return result;
        } catch (error: any) {
            console.error('[Main] Logout failed:', error);
            throw new Error(error?.message || 'Logout failed');
        }
    });

    ipcMain.handle('rooms:get', async (_e, { roomId }) => {
        try {
            console.log('[Main] Getting room:', roomId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.getRoom(roomId);
            console.log('[Main] Got room');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get room:', error);
            throw new Error(error?.message || 'Failed to get room');
        }
    });

    ipcMain.handle('users:getByHandle', async (_e, { handle }) => {
        try {
            console.log('[Main] Getting user by handle:', handle);
            if (!client) throw new Error('Client not initialized');
            const result = await client.getUserByHandle(handle);
            console.log('[Main] Got user');
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get user by handle:', error);
            throw new Error(error?.message || 'Failed to get user');
        }
    });

    ipcMain.handle('users:listByIds', async (_e, { userIds }) => {
        try {
            console.log('[Main] Listing users by IDs:', userIds.length);
            if (!client) throw new Error('Client not initialized');
            const result = await client.listUsersByIds(userIds) as any;
            console.log('[Main] Got users:', result?.users?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to list users by IDs:', error);
            throw new Error(error?.message || 'Failed to list users');
        }
    });

    ipcMain.handle('chat:listPinned', async (_e, { roomId }) => {
        try {
            console.log('[Main] Listing pinned messages:', roomId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.listPinnedMessages(roomId) as any;
            console.log('[Main] Got pinned messages:', result?.messages?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to list pinned messages:', error);
            throw new Error(error?.message || 'Failed to list pinned messages');
        }
    });

    ipcMain.handle('chat:getThread', async (_e, { messageId, limit, cursor }) => {
        try {
            console.log('[Main] Getting thread:', messageId);
            if (!client) throw new Error('Client not initialized');
            const result = await client.getThread(messageId, limit, cursor) as any;
            console.log('[Main] Got thread messages:', result?.messages?.length || 0);
            return result;
        } catch (error: any) {
            console.error('[Main] Failed to get thread:', error);
            throw new Error(error?.message || 'Failed to get thread');
        }
    });

    ipcMain.handle('stream:ack', async (_e, { eventId }) => {
        try {
            if (!currentStream) {
                console.warn('[Main] No active stream for acknowledgment');
                return { success: false };
            }

            currentStream.write({
                payload: {
                    ack: { event_id: eventId }
                }
            });

            return { success: true };
        } catch (error: any) {
            console.error('[Main] Failed to send acknowledgment:', error);
            throw new Error(error?.message || 'Failed to acknowledge event');
        }
    });

    ipcMain.handle('app:getDefaultServerAddress', () => {
        return process.env.CONCORD_SERVER || 'localhost:9090';
    });
}

function setupVoiceIPC() {
    ipcMain.handle('voice:join', async (_e, { roomId, audioOnly }) => {
        try {
            console.log('[Main] Joining voice:', { roomId, audioOnly });

            if (!client) throw new Error('Client not initialized');

            const response = await client.joinVoice(roomId, audioOnly) as any;

            console.log('[Main] JoinVoice response:', {
                hasEndpoint: !!response.endpoint,
                hasServerId: !!response.server_id,
                hasVoiceToken: !!response.voice_token,
                participantCount: response.participants?.length || 0,
            });

            const voiceConfig: VoiceConfig = {
                endpoint: response.endpoint,
                serverId: response.server_id,
                voiceToken: response.voice_token,
                codec: response.codec,
                crypto: response.crypto,
                participants: response.participants || [],
            };

            if (!audioManager) {
                audioManager = new AudioManager();
                await audioManager.initialize();
            }

            if (!audioOnly && !videoManager) {
                videoManager = new VideoManager();
                await videoManager.initialize({
                    width: 640,
                    height: 480,
                    frameRate: 30,
                });
            }

            voiceClient = new VoiceClient(voiceConfig);

            voiceClient.on('speaking', (data: any) => {
                mainWindow?.webContents.send('voice:speaking', data);
            });

            voiceClient.on('error', (err: Error) => {
                console.error('[Main] Voice client error:', err);
                mainWindow?.webContents.send('voice:error', err.message);
            });

            voiceClient.on('reconnected', () => {
                mainWindow?.webContents.send('voice:reconnected');
            });

            console.log('[Main] Connecting voice client...');
            await voiceClient.connect();
            console.log('[Main] Voice client connected!');

            return {
                success: true,
                participantCount: response.participants?.length || 0
            };
        } catch (error: any) {
            console.error('[Main] Failed to join voice:', error);
            throw new Error(error?.message || 'Failed to join voice');
        }
    });

    ipcMain.handle('voice:leave', async () => {
        try {
            console.log('[Main] Leaving voice');
            if (voiceClient) {
                voiceClient.disconnect();
                voiceClient = null;
            }

            if (audioManager) {
                audioManager.destroy();
                audioManager = null;
            }

            if (videoManager) {
                videoManager.destroy();
                videoManager = null;
            }

            console.log('[Main] Voice left successfully');
            return { success: true };
        } catch (error: any) {
            console.error('[Main] Failed to leave voice:', error);
            throw new Error(error?.message || 'Failed to leave voice');
        }
    });

    ipcMain.handle('voice:setMuted', async (_e, { muted }) => {
        try {
            console.log('[Main] Setting muted:', muted);
            audioManager?.setMuted(muted);
            voiceClient?.setSpeaking(!muted);
            return { success: true };
        } catch (error: any) {
            console.error('[Main] Failed to set mute state:', error);
            throw new Error(error?.message || 'Failed to set mute state');
        }
    });

    ipcMain.handle('voice:setVideoEnabled', async (_e, { enabled }) => {
        try {
            console.log('[Main] Setting video enabled:', enabled);
            if (enabled) {
                if (!videoManager) {
                    videoManager = new VideoManager();
                    await videoManager.initialize({
                        width: 640,
                        height: 480,
                        frameRate: 30,
                    });
                }
                videoManager.setEnabled(true);
            } else {
                if (videoManager) {
                    videoManager.setEnabled(false);
                    videoManager.destroy();
                    videoManager = null;
                }
            }
            console.log('[Main] Video state set successfully');
            return { success: true };
        } catch (error: any) {
            console.error('[Main] Failed to set video state:', error);
            throw new Error(error?.message || 'Failed to set video state');
        }
    });
}

app.on('web-contents-created', (_e, wc) => {
    wc.on('render-process-gone', (_e2, details) => {
        console.error('[Electron] render-process-gone:', details);
    });
    wc.on('preload-error', (_e2, path, error) => {
        console.error('[Electron] preload-error:', path, error);
    });
});

process.on('uncaughtException', (err) => {
    console.error('[Electron] uncaughtException:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('[Electron] unhandledRejection:', err);
});

let streamEventHandler: ((event: any) => void) | null = null;
let streamErrorHandler: ((error: string) => void) | null = null;
let streamEndHandler: (() => void) | null = null;

function setupStreamForwarding() {
    if (streamEventHandler) return;

    streamEventHandler = (event: any) => {
        console.log('[Main] Stream event received, forwarding to renderer');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stream:event', event);
        }
    };

    streamErrorHandler = (error: string) => {
        console.error('[Main] Stream error:', error);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stream:error', error);
        }
    };

    streamEndHandler = () => {
        console.log('[Main] Stream ended');
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('stream:end');
        }
    };

    console.log('[Main] Stream forwarding setup complete');
}

app.whenReady().then(() => {
    setupIPC();
    setupVoiceIPC();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    clearStreamRetry();

    if (keepaliveInterval) {
        clearInterval(keepaliveInterval);
        keepaliveInterval = null;
    }

    if (currentStream) {
        currentStream.end();
        currentStream = null;
    }

    streamInitialized = false;

    if (voiceClient) {
        voiceClient.disconnect();
    }
    if (audioManager) {
        audioManager.destroy();
    }
    if (videoManager) {
        videoManager.destroy();
    }
});