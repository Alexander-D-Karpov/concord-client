import * as fs from 'fs';
import * as path from 'path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

const PROTO_ROOT = path.join(__dirname, '../../proto');

function findProtoFiles(root: string): string[] {
    const out: string[] = [];
    const stack = [root];
    while (stack.length) {
        const dir = stack.pop()!;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) stack.push(p);
            else if (ent.isFile() && p.endsWith('.proto')) out.push(p);
        }
    }
    return out;
}

const protoFiles = findProtoFiles(PROTO_ROOT);
const packageDefinition = protoLoader.loadSync(protoFiles, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT],
});
const protos = grpc.loadPackageDefinition(packageDefinition) as any;

function has(obj: any, pathStr: string) {
    return pathStr.split('.').every(k => (obj = obj?.[k]) !== undefined);
}
function get(obj: any, pathStr: string) {
    return pathStr.split('.').reduce((o, k) => o?.[k], obj);
}

export default class ConcordClient {
    private token: string | null = null;

    // per-service (split layout)
    private auth?: any;
    private users?: any;
    private rooms?: any;
    private chat?: any;
    private stream?: any;

    // monolith (legacy layout)
    private mono?: any;

    constructor(serverAddress = 'localhost:9090') {
        const creds = grpc.credentials.createInsecure();
        const root = protos.concord ?? protos; // package root

        // Try split services first
        if (has(root, 'auth.v1.AuthService'))   this.auth   = new root.auth.v1.AuthService(serverAddress, creds);
        if (has(root, 'users.v1.UsersService')) this.users  = new root.users.v1.UsersService(serverAddress, creds);
        if (has(root, 'rooms.v1.RoomsService')) this.rooms  = new root.rooms.v1.RoomsService(serverAddress, creds);
        if (has(root, 'chat.v1.ChatService'))   this.chat   = new root.chat.v1.ChatService(serverAddress, creds);
        if (has(root, 'stream.v1.StreamService')) this.stream = new root.stream.v1.StreamService(serverAddress, creds);

        // Fallback: monolithic service (ConcordService)
        if (has(root, 'ConcordService')) this.mono = new root.ConcordService(serverAddress, creds);

        if (!this.auth && !this.mono) {
            // Helpful log so you immediately see what was loaded
            console.error('[grpc] No AuthService or ConcordService found in descriptor.');
            console.error('[grpc] Available keys under protos.concord:', Object.keys(root || {}));
        }
    }

    setToken(token: string) { this.token = token; }
    private md(): grpc.Metadata {
        const m = new grpc.Metadata();
        if (this.token) m.add('authorization', `Bearer ${this.token}`);
        return m;
    }

    // ---------- Auth ----------
    login(handle: string, password: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.auth?.LoginPassword) {
                this.auth.LoginPassword({ handle, password }, (err: any, res: any) => err ? reject(err) : resolve(res));
            } else if (this.mono?.LoginPassword) {
                this.mono.LoginPassword({ handle, password }, (err: any, res: any) => err ? reject(err) : resolve(res));
            } else {
                reject(new Error('Login not implemented by server'));
            }
        });
    }

    // ---------- Users ----------
    getSelf(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.users?.GetSelf) {
                this.users.GetSelf({}, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else if (this.mono?.GetSelf) {
                this.mono.GetSelf({}, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else {
                const e: any = new Error('GetSelf not implemented by server');
                e.code = 12; // UNIMPLEMENTED
                reject(e);
            }
        });
    }

    // ---------- Rooms ----------
    getRooms(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.rooms?.ListRoomsForUser) {
                this.rooms.ListRoomsForUser({}, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else if (this.mono?.ListRoomsForUser) {
                this.mono.ListRoomsForUser({}, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else {
                reject(new Error('ListRoomsForUser not implemented by server'));
            }
        });
    }

    createRoom(name: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.rooms?.CreateRoom) {
                this.rooms.CreateRoom({ name }, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else if (this.mono?.CreateRoom) {
                this.mono.CreateRoom({ name }, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else {
                reject(new Error('CreateRoom not implemented by server'));
            }
        });
    }

    // ---------- Chat ----------
    sendMessage(room_id: string, content: string): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.chat?.SendMessage) {
                this.chat.SendMessage({ room_id, content }, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else if (this.mono?.SendMessage) {
                this.mono.SendMessage({ room_id, content }, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else {
                reject(new Error('SendMessage not implemented by server'));
            }
        });
    }

    getMessages(room_id: string, limit = 50): Promise<any> {
        return new Promise((resolve, reject) => {
            if (this.chat?.ListMessages) {
                this.chat.ListMessages({ room_id, limit }, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else if (this.mono?.ListMessages) {
                this.mono.ListMessages({ room_id, limit }, this.md(), (err: any, res: any) => err ? reject(err) : resolve(res));
            } else {
                reject(new Error('ListMessages not implemented by server'));
            }
        });
    }

    // ---------- Stream ----------
    eventStream() {
        if (this.stream?.EventStream) return this.stream.EventStream(this.md());
        if (this.mono?.EventStream)   return this.mono.EventStream(this.md());
        throw new Error('EventStream not implemented by server');
    }
}
