import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import * as path from 'path';

const PROTO_PATH = path.join(__dirname, '../../proto');

class ConcordClient {
    private authClient: any;
    private usersClient: any;
    private roomsClient: any;
    private chatClient: any;
    private streamClient: any;
    private callClient: any;
    private membershipClient: any;
    private token?: string;
    private metadata?: grpc.Metadata;
    private serverAddress: string;

    constructor(serverAddress: string) {
        this.serverAddress = serverAddress;
        this.initializeClients();
    }

    private initializeClients() {
        console.log('[ConcordClient] Initializing clients for', this.serverAddress);

        const packageDefinition = protoLoader.loadSync(
            [
                path.join(PROTO_PATH, 'auth/v1/auth.proto'),
                path.join(PROTO_PATH, 'users/v1/users.proto'),
                path.join(PROTO_PATH, 'rooms/v1/rooms.proto'),
                path.join(PROTO_PATH, 'chat/v1/chat.proto'),
                path.join(PROTO_PATH, 'stream/v1/stream.proto'),
                path.join(PROTO_PATH, 'call/v1/call.proto'),
                path.join(PROTO_PATH, 'membership/v1/membership.proto'),
            ],
            {
                keepCase: true,
                longs: String,
                enums: String,
                defaults: true,
                oneofs: true,
                includeDirs: [PROTO_PATH],
            }
        );

        const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;

        const credentials = grpc.credentials.createInsecure();

        this.authClient = new protoDescriptor.concord.auth.v1.AuthService(
            this.serverAddress,
            credentials
        );

        this.usersClient = new protoDescriptor.concord.users.v1.UsersService(
            this.serverAddress,
            credentials
        );

        this.roomsClient = new protoDescriptor.concord.rooms.v1.RoomsService(
            this.serverAddress,
            credentials
        );

        this.chatClient = new protoDescriptor.concord.chat.v1.ChatService(
            this.serverAddress,
            credentials
        );

        this.streamClient = new protoDescriptor.concord.stream.v1.StreamService(
            this.serverAddress,
            credentials
        );

        this.callClient = new protoDescriptor.concord.call.v1.CallService(
            this.serverAddress,
            credentials
        );

        this.membershipClient = new protoDescriptor.concord.membership.v1.MembershipService(
            this.serverAddress,
            credentials
        );

        console.log('[ConcordClient] All clients initialized');
    }

    setToken(token: string) {
        this.token = token;
        this.metadata = new grpc.Metadata();
        this.metadata.add('authorization', `Bearer ${token}`);
        console.log('[ConcordClient] Token updated');
    }

    private getMetadata(): grpc.Metadata {
        if (!this.metadata) {
            this.metadata = new grpc.Metadata();
        }
        return this.metadata;
    }

    async register(handle: string, password: string, displayName: string) {
        return new Promise((resolve, reject) => {
            this.authClient.Register(
                { handle, password, display_name: displayName },
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async login(handle: string, password: string) {
        return new Promise((resolve, reject) => {
            this.authClient.LoginPassword(
                { handle, password },
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async refreshToken(refreshToken: string) {
        return new Promise((resolve, reject) => {
            this.authClient.Refresh(
                { refresh_token: refreshToken },
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async getSelf() {
        return new Promise((resolve, reject) => {
            this.usersClient.GetSelf(
                {},
                this.getMetadata(),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async getRooms() {
        return new Promise((resolve, reject) => {
            this.roomsClient.ListRoomsForUser(
                {},
                this.getMetadata(),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async createRoom(name: string, region?: string) {
        return new Promise((resolve, reject) => {
            this.roomsClient.CreateRoom(
                { name, region },
                this.getMetadata(),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async getMembers(roomId: string) {
        return new Promise((resolve, reject) => {
            this.membershipClient.ListMembers(
                { room_id: roomId },
                this.getMetadata(),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async getMessages(roomId: string, limit?: number, beforeId?: string) {
        return new Promise((resolve, reject) => {
            this.chatClient.ListMessages(
                {
                    room_id: roomId,
                    limit: limit || 50,
                    before_id: beforeId,
                },
                this.getMetadata(),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async sendMessage(roomId: string, content: string) {
        return new Promise((resolve, reject) => {
            this.chatClient.SendMessage(
                {
                    room_id: roomId,
                    content,
                },
                this.getMetadata(),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async startEventStream() {
        const stream = this.streamClient.EventStream(this.getMetadata());
        return stream;
    }

    async subscribeToRooms(roomIds: string[]) {
        return new Promise((resolve, reject) => {
            const stream = this.streamClient.EventStream(this.getMetadata());

            stream.write({
                payload: {
                    subscribe: {
                        room_ids: roomIds,
                    },
                },
            });

            resolve({ success: true });
        });
    }

    async unsubscribeFromRooms(roomIds: string[]) {
        return new Promise((resolve, reject) => {
            const stream = this.streamClient.EventStream(this.getMetadata());

            stream.write({
                payload: {
                    unsubscribe: {
                        room_ids: roomIds,
                    },
                },
            });

            resolve({ success: true });
        });
    }

    async joinVoice(roomId: string, audioOnly?: boolean) {
        console.log('[ConcordClient] Joining voice for room:', roomId);
        return new Promise((resolve, reject) => {
            this.callClient.JoinVoice(
                {
                    room_id: roomId,
                    audio_only: audioOnly || false,
                },
                this.getMetadata(),
                (err: Error | null, response: any) => {
                    if (err) {
                        console.error('[ConcordClient] JoinVoice error:', err);
                        reject(err);
                    } else {
                        console.log('[ConcordClient] JoinVoice success:', {
                            endpoint: response.endpoint,
                            serverId: response.server_id,
                            participants: response.participants?.length || 0,
                        });
                        resolve(response);
                    }
                }
            );
        });
    }
}

export default ConcordClient;