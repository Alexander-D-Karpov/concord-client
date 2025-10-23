import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';
import ConcordClient from './grpc-client';

let mainWindow: BrowserWindow | null = null;
const client = new ConcordClient('localhost:9090');

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
        backgroundColor: '#0f172a',
    });

    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    // mainWindow.webContents.openDevTools();
}

app.whenReady().then(() => {
    // In dev, if main is reloaded, clear old handlers first
    ipcMain.removeHandler('auth:login');
    ipcMain.removeHandler('users:getSelf');
    ipcMain.removeHandler('rooms:list');
    ipcMain.removeHandler('rooms:create');
    ipcMain.removeHandler('chat:list');
    ipcMain.removeHandler('chat:send');

    // IPC API
    ipcMain.handle('auth:login', async (_e, { handle, password }) => {
        const token = await client.login(handle, password);
        client.setToken(token.access_token);
        return token;
    });

    ipcMain.handle('users:getSelf', () => client.getSelf());

    ipcMain.handle('rooms:list', () => client.getRooms());
    ipcMain.handle('rooms:create', (_e, { name }) => client.createRoom(name));

    ipcMain.handle('chat:list', (_e, { roomId, limit }) =>
        client.getMessages(roomId, limit ?? 50)
    );
    ipcMain.handle('chat:send', (_e, { roomId, content }) =>
        client.sendMessage(roomId, content)
    );

    createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
