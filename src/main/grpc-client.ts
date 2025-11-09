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
    private friendsClient: any;
    private token?: string;
    private refreshTok?: string;
    private tokenExpiresAt?: number;
    private serverAddress: string;
    private isRefreshing = false;

    constructor(serverAddress: string) {
        this.serverAddress = serverAddress;
        this.initializeClients();
    }

    setTokens(access: string, refresh?: string, expiresIn?: number) {
        this.token = access;
        this.refreshTok = refresh;
        if (expiresIn && expiresIn > 120) {
            this.tokenExpiresAt = Date.now() + (expiresIn - 60) * 1000;
        } else {
            this.tokenExpiresAt = undefined;
        }
        console.log('[ConcordClient] Token set');
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
                path.join(PROTO_PATH, 'friends/v1/friends.proto'),
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

        this.friendsClient = new protoDescriptor.concord.friends.v1.FriendsService(
            this.serverAddress,
            credentials
        );

        console.log('[ConcordClient] All clients initialized');
    }

    setToken(token: string) {
        this.token = token;
        console.log('[ConcordClient] Token set');
    }

    private getMetadata(): grpc.Metadata {
        const md = new grpc.Metadata();
        if (this.token) md.add('authorization', `Bearer ${this.token}`);
        return md;
    }

    private getOptions(timeoutSeconds: number = 30): grpc.CallOptions {
        return {
            deadline: Date.now() + timeoutSeconds * 1000
        };
    }

    async ensureFreshToken(): Promise<boolean> {
        if (this.isRefreshing) {
            console.log('[ConcordClient] Token refresh already in progress');
            return true;
        }

        if (!this.refreshTok) {
            console.log('[ConcordClient] No refresh token available');
            return false;
        }

        const needs = !this.tokenExpiresAt || Date.now() >= this.tokenExpiresAt;
        if (!needs) {
            return true;
        }

        this.isRefreshing = true;
        try {
            console.log('[ConcordClient] Refreshing token...');
            const res: any = await this.refreshToken(this.refreshTok);
            this.setTokens(res.access_token, res.refresh_token, res.expires_in);
            console.log('[ConcordClient] Token refreshed successfully');
            return true;
        } catch (err: any) {
            console.error('[ConcordClient] Token refresh failed:', err);

            if (err?.code === 16) {
                console.log('[ConcordClient] Invalid refresh token - clearing auth');
                this.token = undefined;
                this.refreshTok = undefined;
                this.tokenExpiresAt = undefined;
            }

            return false;
        } finally {
            this.isRefreshing = false;
        }
    }

    private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
        const refreshed = await this.ensureFreshToken();
        if (!refreshed) {
            throw new Error('Failed to refresh authentication token');
        }

        try {
            return await fn();
        } catch (err: any) {
            if (err?.code === 16 && this.refreshTok && !this.isRefreshing) {
                console.log('[ConcordClient] Got 401, attempting token refresh...');
                const refreshed = await this.ensureFreshToken();
                if (!refreshed) {
                    throw new Error('Authentication failed - please log in again');
                }
                return await fn();
            }
            throw err;
        }
    }

    async register(handle: string, password: string, displayName: string) {
        return new Promise((resolve, reject) => {
            this.authClient.Register(
                { handle, password, display_name: displayName },
                this.getOptions(30),
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
                this.getOptions(30),
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
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async logout(refreshToken: string) {
        return new Promise((resolve, reject) => {
            this.authClient.Logout(
                { refresh_token: refreshToken },
                this.getMetadata(),
                this.getOptions(10),
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
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async getUser(userId: string) {
        return new Promise((resolve, reject) => {
            this.usersClient.GetUser(
                { user_id: userId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async getUserByHandle(handle: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.usersClient.GetUserByHandle(
                { handle },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async searchUsers(query: string, limit?: number) {
        return new Promise((resolve, reject) => {
            this.usersClient.SearchUsers(
                { query, limit: limit || 20 },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async listUsersByIds(userIds: string[]) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.usersClient.ListUsersByIDs(
                { user_ids: userIds },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async updateProfile(displayName?: string, avatarUrl?: string, bio?: string) {
        return new Promise((resolve, reject) => {
            this.usersClient.UpdateProfile(
                {
                    display_name: displayName,
                    avatar_url: avatarUrl,
                    bio,
                },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async updateStatus(status: string) {
        return new Promise((resolve, reject) => {
            this.usersClient.UpdateStatus(
                { status },
                this.getMetadata(),
                this.getOptions(10),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async getRooms() {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.roomsClient.ListRoomsForUser(
                {},
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, resp: any) => {
                    if (err) reject(err);
                    else resolve(resp);
                }
            );
        }));
    }

    async getRoom(roomId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.roomsClient.GetRoom(
                { room_id: roomId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async createRoom(name: string, region?: string, description?: string, isPrivate?: boolean) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.roomsClient.CreateRoom(
                { name, region, description, is_private: isPrivate },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async updateRoom(roomId: string, name?: string, description?: string, isPrivate?: boolean) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.roomsClient.UpdateRoom(
                { room_id: roomId, name, description, is_private: isPrivate },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async deleteRoom(roomId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.roomsClient.DeleteRoom(
                { room_id: roomId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async getMembers(roomId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.membershipClient.ListMembers(
                { room_id: roomId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async inviteMember(roomId: string, userId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.membershipClient.Invite(
                { room_id: roomId, user_id: userId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async removeMember(roomId: string, userId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.membershipClient.Remove(
                { room_id: roomId, user_id: userId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async setMemberRole(roomId: string, userId: string, role: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.membershipClient.SetRole(
                { room_id: roomId, user_id: userId, role },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async setMemberNickname(roomId: string, nickname: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.membershipClient.SetNickname(
                { room_id: roomId, nickname },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async getMessages(roomId: string, limit?: number, beforeId?: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.ListMessages(
                {
                    room_id: roomId,
                    limit: limit || 50,
                    before_id: beforeId,
                },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async sendMessage(
        roomId: string,
        content: string,
        replyToId?: string,
        mentions?: string[],
        attachments?: Array<{
            filename: string;
            content_type: string;
            data: Uint8Array;
            width?: number;
            height?: number;
        }>
    ) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            const timeout = attachments && attachments.length > 0 ? 60 : 30;

            const request: any = {
                room_id: roomId,
                content,
            };

            if (replyToId) {
                request.reply_to_id = replyToId;
            }

            if (mentions && mentions.length > 0) {
                request.mention_user_ids = mentions;
            }

            if (attachments && attachments.length > 0) {
                request.attachments = attachments.map((att) => ({
                    filename: att.filename,
                    content_type: att.content_type,
                    data: Buffer.from(att.data),
                    width: att.width,
                    height: att.height,
                }));
            }

            console.log('[GrpcClient] Sending message:', {
                roomId,
                contentLength: content.length,
                hasReply: !!replyToId,
                mentionsCount: mentions?.length || 0,
                attachmentsCount: attachments?.length || 0,
            });

            this.chatClient.SendMessage(
                request,
                this.getMetadata(),
                this.getOptions(timeout),
                (err: Error | null, response: any) => {
                    if (err) {
                        console.error('[GrpcClient] SendMessage error:', {
                            code: (err as any).code,
                            message: err.message,
                            details: (err as any).details,
                        });
                        reject(err);
                    } else {
                        console.log('[GrpcClient] SendMessage success:', {
                            hasMessage: !!response?.message,
                            messageId: response?.message?.id,
                        });
                        resolve(response);
                    }
                }
            );
        }));
    }

    async editMessage(messageId: string, content: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.EditMessage(
                { message_id: messageId, content },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async deleteMessage(messageId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.DeleteMessage(
                { message_id: messageId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async pinMessage(roomId: string, messageId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.PinMessage(
                { room_id: roomId, message_id: messageId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async unpinMessage(roomId: string, messageId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.UnpinMessage(
                { room_id: roomId, message_id: messageId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async listPinnedMessages(roomId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.ListPinnedMessages(
                { room_id: roomId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async addReaction(messageId: string, emoji: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.AddReaction(
                { message_id: messageId, emoji },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async removeReaction(messageId: string, emoji: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.RemoveReaction(
                { message_id: messageId, emoji },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async searchMessages(roomId: string, query: string, limit?: number) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.SearchMessages(
                { room_id: roomId, query, limit: limit || 50 },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async getThread(messageId: string, limit?: number, cursor?: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.chatClient.GetThread(
                { message_id: messageId, limit: limit || 50, cursor },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    startEventStream() {
        console.log('[ConcordClient] Starting bidirectional event stream');
        const stream = this.streamClient.EventStream(this.getMetadata());
        return stream;
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
                this.getOptions(30),
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

    async leaveVoice(roomId: string) {
        return new Promise((resolve, reject) => {
            this.callClient.LeaveVoice(
                { room_id: roomId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }

    async sendFriendRequest(userId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.SendFriendRequest(
                { user_id: userId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async acceptFriendRequest(requestId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.AcceptFriendRequest(
                { request_id: requestId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async rejectFriendRequest(requestId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.RejectFriendRequest(
                { request_id: requestId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async cancelFriendRequest(requestId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.CancelFriendRequest(
                { request_id: requestId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async removeFriend(userId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.RemoveFriend(
                { user_id: userId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async listFriends() {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.ListFriends(
                {},
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async listPendingRequests() {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.ListPendingRequests(
                {},
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async blockUser(userId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.BlockUser(
                { user_id: userId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async unblockUser(userId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.UnblockUser(
                { user_id: userId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async listBlockedUsers() {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.friendsClient.ListBlockedUsers(
                {},
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async getVoiceStatus(roomId: string) {
        return this.withAuth(() => new Promise((resolve, reject) => {
            this.callClient.GetVoiceStatus(
                { room_id: roomId },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        }));
    }

    async setMediaPrefs(roomId: string, audioOnly: boolean, videoEnabled: boolean, muted: boolean) {
        return new Promise((resolve, reject) => {
            this.callClient.SetMediaPrefs(
                { room_id: roomId, audio_only: audioOnly, video_enabled: videoEnabled, muted },
                this.getMetadata(),
                this.getOptions(30),
                (err: Error | null, response: any) => {
                    if (err) reject(err);
                    else resolve(response);
                }
            );
        });
    }
}

export default ConcordClient;