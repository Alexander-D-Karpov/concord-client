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

function setupIPC() {
    ipcMain.handle('client:initialize', async (_e, { accessToken, serverAddress }) => {
        try {
            const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';

            if (!client) {
                client = new ConcordClient(address);
            }
            if (accessToken) {
                client.setToken(accessToken);
            }
            return { success: true };
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to initialize client');
        }
    });

    ipcMain.handle('auth:register', async (_e, { handle, password, displayName, serverAddress }) => {
        try {
            const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';

            if (!client) {
                client = new ConcordClient(address);
            }
            const tokens = await client.register(handle, password, displayName) as {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };
            client.setToken(tokens.access_token);
            return tokens;
        } catch (error: any) {
            throw new Error(error?.message || 'Registration failed');
        }
    });

    ipcMain.handle('auth:login', async (_e, { handle, password, serverAddress }) => {
        try {
            const address = serverAddress || process.env.CONCORD_SERVER || 'localhost:9090';

            if (!client) {
                client = new ConcordClient(address);
            }
            const tokens = await client.login(handle, password) as {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };
            client.setToken(tokens.access_token);
            return tokens;
        } catch (error: any) {
            throw new Error(error?.message || 'Login failed');
        }
    });

    ipcMain.handle('auth:refresh', async (_e, { refreshToken }) => {
        try {
            if (!client) throw new Error('Client not initialized');

            const tokens = await client.refreshToken(refreshToken) as {
                access_token: string;
                refresh_token: string;
                expires_in: number;
            };
            client.setToken(tokens.access_token);
            return tokens;
        } catch (error: any) {
            throw new Error(error?.message || 'Token refresh failed');
        }
    });

    ipcMain.handle('users:getSelf', async () => {
        try {
            if (!client) throw new Error('Client not initialized');
            return await client.getSelf();
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to get user');
        }
    });

    ipcMain.handle('rooms:list', async () => {
        try {
            if (!client) throw new Error('Client not initialized');
            return await client.getRooms();
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to get rooms');
        }
    });

    ipcMain.handle('rooms:create', async (_e, { name, region }) => {
        try {
            if (!client) throw new Error('Client not initialized');
            return await client.createRoom(name, region);
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to create room');
        }
    });

    ipcMain.handle('rooms:getMembers', async (_e, { roomId }) => {
        try {
            if (!client) throw new Error('Client not initialized');
            return await client.getMembers(roomId);
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to get members');
        }
    });

    ipcMain.handle('chat:list', async (_e, { roomId, limit, beforeId }) => {
        try {
            if (!client) throw new Error('Client not initialized');
            return await client.getMessages(roomId, limit, beforeId);
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to get messages');
        }
    });

    ipcMain.handle('chat:send', async (_e, { roomId, content }) => {
        try {
            if (!client) throw new Error('Client not initialized');
            return await client.sendMessage(roomId, content);
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to send message');
        }
    });

    ipcMain.handle('stream:start', async () => {
        try {
            if (!client) throw new Error('Client not initialized');
            const stream = await client.startEventStream();

            stream.on('data', (event: any) => {
                mainWindow?.webContents.send('stream:event', event);
            });

            stream.on('error', (error: Error) => {
                console.error('Stream error:', error);
                mainWindow?.webContents.send('stream:error', error.message);
            });

            stream.on('end', () => {
                console.log('Stream ended');
                mainWindow?.webContents.send('stream:end');
            });

            return { success: true };
        } catch (error: any) {
            console.error('Failed to start stream:', error);
            throw new Error(error?.message || 'Failed to start stream');
        }
    });

    ipcMain.handle('stream:subscribe', async (_e, { roomIds }) => {
        try {
            if (!client) throw new Error('Client not initialized');
            await client.subscribeToRooms(roomIds);
            return { success: true };
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to subscribe');
        }
    });

    ipcMain.handle('stream:unsubscribe', async (_e, { roomIds }) => {
        try {
            if (!client) throw new Error('Client not initialized');
            await client.unsubscribeFromRooms(roomIds);
            return { success: true };
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to unsubscribe');
        }
    });

    ipcMain.handle('app:getDefaultServerAddress', () => {
        return process.env.CONCORD_SERVER || 'localhost:9090';
    });
}

function setupVoiceIPC() {
    ipcMain.handle('voice:join', async (_e, { roomId, audioOnly }) => {
        try {
            console.log('[Main] Joining voice...', { roomId, audioOnly });

            if (!client) throw new Error('Client not initialized');

            const response = await client.joinVoice(roomId, audioOnly) as any;

            console.log('[Main] JoinVoice response fields:', {
                hasEndpoint: !!response.endpoint,
                hasServerId: !!response.server_id,
                hasVoiceToken: !!response.voice_token,
                hasCodec: !!response.codec,
                hasCrypto: !!response.crypto,
                voiceTokenLength: response.voice_token?.length || 0,
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

            return { success: true };
        } catch (error: any) {
            console.error('[Main] Failed to join voice:', error);
            throw new Error(error?.message || 'Failed to join voice');
        }
    });

    ipcMain.handle('voice:leave', async () => {
        try {
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

            return { success: true };
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to leave voice');
        }
    });

    ipcMain.handle('voice:setMuted', async (_e, { muted }) => {
        try {
            audioManager?.setMuted(muted);
            voiceClient?.setSpeaking(!muted);
            return { success: true };
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to set mute state');
        }
    });

    ipcMain.handle('voice:setVideoEnabled', async (_e, { enabled }) => {
        try {
            if (enabled && !videoManager) {
                videoManager = new VideoManager();
                await videoManager.initialize({
                    width: 640,
                    height: 480,
                    frameRate: 30,
                });
            }

            videoManager?.setEnabled(enabled);
            return { success: true };
        } catch (error: any) {
            throw new Error(error?.message || 'Failed to set video state');
        }
    });
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