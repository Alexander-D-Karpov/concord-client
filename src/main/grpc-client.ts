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
    private adminClient: any;
    private token?: string;
    private refreshTok?: string;
    private tokenExpiresAt?: number;
    private serverAddress: string;
    private isRefreshing = false;
    private dmClient: any;

    constructor(serverAddress: string) {
        this.serverAddress = serverAddress;
        this.initializeClients();
    }

    private initializeClients() {
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
                path.join(PROTO_PATH, 'dm/v1/dm.proto'),
                path.join(PROTO_PATH, 'admin/v1/admin.proto'),
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

        this.authClient = new protoDescriptor.concord.auth.v1.AuthService(this.serverAddress, credentials);
        this.usersClient = new protoDescriptor.concord.users.v1.UsersService(this.serverAddress, credentials);
        this.roomsClient = new protoDescriptor.concord.rooms.v1.RoomsService(this.serverAddress, credentials);
        this.chatClient = new protoDescriptor.concord.chat.v1.ChatService(this.serverAddress, credentials);
        this.streamClient = new protoDescriptor.concord.stream.v1.StreamService(this.serverAddress, credentials);
        this.callClient = new protoDescriptor.concord.call.v1.CallService(this.serverAddress, credentials);
        this.membershipClient = new protoDescriptor.concord.membership.v1.MembershipService(this.serverAddress, credentials);
        this.friendsClient = new protoDescriptor.concord.friends.v1.FriendsService(this.serverAddress, credentials);
        this.adminClient = new protoDescriptor.concord.admin.v1.AdminService(this.serverAddress, credentials);
        this.dmClient = new protoDescriptor.concord.dm.v1.DMService(this.serverAddress, credentials);
    }

    setTokens(access: string, refresh?: string, expiresIn?: number) {
        this.token = access;
        this.refreshTok = refresh;
        this.tokenExpiresAt = expiresIn && expiresIn > 120
            ? Date.now() + (expiresIn - 60) * 1000
            : undefined;
    }

    private getMetadata(): grpc.Metadata {
        const md = new grpc.Metadata();
        if (this.token) md.add('authorization', `Bearer ${this.token}`);
        return md;
    }

    private getOptions(timeoutSeconds = 30): grpc.CallOptions {
        return { deadline: Date.now() + timeoutSeconds * 1000 };
    }

    async ensureFreshToken(): Promise<boolean> {
        if (this.isRefreshing) return true;
        if (!this.refreshTok) return false;
        if (this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) return true;

        this.isRefreshing = true;
        try {
            const res = await this.refreshToken(this.refreshTok) as any;
            this.setTokens(res.access_token, res.refresh_token, res.expires_in);
            return true;
        } catch {
            this.token = undefined;
            this.refreshTok = undefined;
            this.tokenExpiresAt = undefined;
            return false;
        } finally {
            this.isRefreshing = false;
        }
    }

    private async withAuth<T>(fn: () => Promise<T>): Promise<T> {
        await this.ensureFreshToken();
        try {
            return await fn();
        } catch (err: any) {
            if (err?.code === 16 && this.refreshTok && !this.isRefreshing) {
                const refreshed = await this.ensureFreshToken();
                if (refreshed) return await fn();
            }
            throw err;
        }
    }

    private promisify<T>(client: any, method: string, request: any, useAuth = false, timeout = 30): Promise<T> {
        return new Promise((resolve, reject) => {
            const fn = client[method];
            if (typeof fn !== 'function') {
                reject(new Error(`Method ${method} not found on client`));
                return;
            }

            const args = useAuth
                ? [request, this.getMetadata(), this.getOptions(timeout)]
                : [request, this.getOptions(timeout)];

            fn.call(client, ...args, (err: Error | null, response: T) => {
                if (err) reject(err);
                else resolve(response);
            });
        });
    }

    // Auth
    async register(handle: string, password: string, displayName: string) {
        return this.promisify(this.authClient, 'Register', { handle, password, display_name: displayName });
    }

    async login(handle: string, password: string) {
        return this.promisify(this.authClient, 'LoginPassword', { handle, password });
    }

    async loginOAuth(provider: string, code: string, redirectUri: string) {
        return this.promisify(this.authClient, 'LoginOAuth', { provider, code, redirect_uri: redirectUri });
    }

    async oauthBegin(provider: string, redirectUri: string) {
        return this.promisify(this.authClient, 'OAuthBegin', { provider, redirect_uri: redirectUri });
    }

    async refreshToken(refreshToken: string) {
        return this.promisify(this.authClient, 'Refresh', { refresh_token: refreshToken });
    }

    async logout(refreshToken: string) {
        return this.promisify(this.authClient, 'Logout', { refresh_token: refreshToken }, true, 10);
    }

    // Users
    async getSelf() {
        return this.withAuth(() => this.promisify(this.usersClient, 'GetSelf', {}, true));
    }

    async getUser(userId: string) {
        return this.withAuth(() => this.promisify(this.usersClient, 'GetUser', { user_id: userId }, true));
    }

    async getUserByHandle(handle: string) {
        return this.withAuth(() => this.promisify(this.usersClient, 'GetUserByHandle', { handle }, true));
    }

    async searchUsers(query: string, limit = 20) {
        return this.withAuth(() => this.promisify(this.usersClient, 'SearchUsers', { query, limit }, true));
    }

    async listUsersByIds(userIds: string[]) {
        return this.withAuth(() => this.promisify(this.usersClient, 'ListUsersByIDs', { user_ids: userIds }, true));
    }

    async updateProfile(displayName?: string, avatarUrl?: string, bio?: string) {
        return this.withAuth(() => this.promisify(this.usersClient, 'UpdateProfile', { display_name: displayName, avatar_url: avatarUrl, bio }, true));
    }

    async updateStatus(status: string) {
        return this.withAuth(() => this.promisify(this.usersClient, 'UpdateStatus', { status }, true, 10));
    }

    // Rooms
    async getRooms() {
        return this.withAuth(() => this.promisify(this.roomsClient, 'ListRoomsForUser', {}, true));
    }

    async getRoom(roomId: string) {
        return this.withAuth(() => this.promisify(this.roomsClient, 'GetRoom', { room_id: roomId }, true));
    }

    async createRoom(name: string, region?: string, description?: string, isPrivate?: boolean) {
        return this.withAuth(() => this.promisify(this.roomsClient, 'CreateRoom', { name, region, description, is_private: isPrivate }, true));
    }

    async updateRoom(roomId: string, name?: string, description?: string, isPrivate?: boolean) {
        return this.withAuth(() => this.promisify(this.roomsClient, 'UpdateRoom', { room_id: roomId, name, description, is_private: isPrivate }, true));
    }

    async deleteRoom(roomId: string) {
        return this.withAuth(() => this.promisify(this.roomsClient, 'DeleteRoom', { room_id: roomId }, true));
    }

    async attachVoiceServer(roomId: string, voiceServerId: string) {
        return this.withAuth(() => this.promisify(this.roomsClient, 'AttachVoiceServer', { room_id: roomId, voice_server_id: voiceServerId }, true));
    }

    // Membership
    async getMembers(roomId: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'ListMembers', { room_id: roomId }, true));
    }

    async inviteMember(roomId: string, userId: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'Invite', { room_id: roomId, user_id: userId }, true));
    }

    async acceptRoomInvite(inviteId: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'AcceptRoomInvite', { invite_id: inviteId }, true));
    }

    async rejectRoomInvite(inviteId: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'RejectRoomInvite', { invite_id: inviteId }, true));
    }

    async cancelRoomInvite(inviteId: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'CancelRoomInvite', { invite_id: inviteId }, true));
    }

    async listRoomInvites() {
        return this.withAuth(() => this.promisify(this.membershipClient, 'ListRoomInvites', {}, true));
    }

    async removeMember(roomId: string, userId: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'Remove', { room_id: roomId, user_id: userId }, true));
    }

    async setMemberRole(roomId: string, userId: string, role: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'SetRole', { room_id: roomId, user_id: userId, role }, true));
    }

    async setMemberNickname(roomId: string, nickname: string) {
        return this.withAuth(() => this.promisify(this.membershipClient, 'SetNickname', { room_id: roomId, nickname }, true));
    }

    // Chat
    async getMessages(roomId: string, limit = 50, beforeId?: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'ListMessages', { room_id: roomId, limit, before: beforeId }, true));
    }

    async sendMessage(roomId: string, content: string, replyToId?: string, mentions?: string[], attachments?: any[]) {
        const request: any = { room_id: roomId, content };
        if (replyToId) request.reply_to_id = replyToId;
        if (mentions?.length) request.mention_user_ids = mentions;
        if (attachments?.length) {
            request.attachments = attachments.map(att => ({
                filename: att.filename,
                content_type: att.content_type,
                data: Buffer.from(att.data),
                width: att.width,
                height: att.height,
            }));
        }
        return this.withAuth(() => this.promisify(this.chatClient, 'SendMessage', request, true, attachments?.length ? 60 : 30));
    }

    async editMessage(messageId: string, content: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'EditMessage', { message_id: messageId, content }, true));
    }

    async deleteMessage(messageId: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'DeleteMessage', { message_id: messageId }, true));
    }

    async pinMessage(roomId: string, messageId: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'PinMessage', { room_id: roomId, message_id: messageId }, true));
    }

    async unpinMessage(roomId: string, messageId: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'UnpinMessage', { room_id: roomId, message_id: messageId }, true));
    }

    async listPinnedMessages(roomId: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'ListPinnedMessages', { room_id: roomId }, true));
    }

    async addReaction(messageId: string, emoji: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'AddReaction', { message_id: messageId, emoji }, true));
    }

    async removeReaction(messageId: string, emoji: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'RemoveReaction', { message_id: messageId, emoji }, true));
    }

    async searchMessages(roomId: string, query: string, limit = 50) {
        return this.withAuth(() => this.promisify(this.chatClient, 'SearchMessages', { room_id: roomId, query, limit }, true));
    }

    async getThread(messageId: string, limit = 50, cursor?: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'GetThread', { message_id: messageId, limit, before: cursor }, true));
    }

    // Stream
    startEventStream() {
        return this.streamClient.EventStream(this.getMetadata());
    }

    // Call/Voice
    async joinVoice(roomId: string, audioOnly = false) {
        return this.withAuth(() => this.promisify(this.callClient, 'JoinVoice', { room_id: roomId, audio_only: audioOnly }, true));
    }

    async leaveVoice(roomId: string) {
        return this.withAuth(() => this.promisify(this.callClient, 'LeaveVoice', { room_id: roomId }, true));
    }

    async setMediaPrefs(roomId: string, audioOnly: boolean, videoEnabled: boolean, muted: boolean, screenSharing: boolean) {
        return this.withAuth(() => this.promisify(this.callClient, 'SetMediaPrefs', {
            room_id: roomId,
            audio_only: audioOnly,
            video_enabled: videoEnabled,
            muted,
            screen_sharing: screenSharing
        }, true));
    }

    async markAsRead(roomId: string, messageId: string) {
        return this.withAuth(() => this.promisify(this.chatClient, 'MarkAsRead', { room_id: roomId, message_id: messageId }, true));
    }

    async getUnreadCounts() {
        return this.withAuth(() => this.promisify(this.chatClient, 'GetUnreadCounts', {}, true));
    }

    async markDMAsRead(channelId: string, messageId: string) {
        return this.withAuth(() => this.promisify(this.dmClient, 'MarkDMAsRead', { channel_id: channelId, message_id: messageId }, true));
    }

    async getVoiceStatus(roomId: string) {
        return this.withAuth(() => this.promisify(this.callClient, 'GetVoiceStatus', { room_id: roomId }, true));
    }

    // Friends
    async sendFriendRequest(userId: string) {
        return this.withAuth(() => this.promisify(this.friendsClient, 'SendFriendRequest', { user_id: userId }, true));
    }

    async acceptFriendRequest(requestId: string) {
        return this.withAuth(() => this.promisify(this.friendsClient, 'AcceptFriendRequest', { request_id: requestId }, true));
    }

    async rejectFriendRequest(requestId: string) {
        return this.withAuth(() => this.promisify(this.friendsClient, 'RejectFriendRequest', { request_id: requestId }, true));
    }

    async cancelFriendRequest(requestId: string) {
        return this.withAuth(() => this.promisify(this.friendsClient, 'CancelFriendRequest', { request_id: requestId }, true));
    }

    async removeFriend(userId: string) {
        return this.withAuth(() => this.promisify(this.friendsClient, 'RemoveFriend', { user_id: userId }, true));
    }

    async listFriends() {
        return this.withAuth(() => this.promisify(this.friendsClient, 'ListFriends', {}, true));
    }

    async listPendingRequests() {
        return this.withAuth(() => this.promisify(this.friendsClient, 'ListPendingRequests', {}, true));
    }

    async blockUser(userId: string) {
        return this.withAuth(() => this.promisify(this.friendsClient, 'BlockUser', { user_id: userId }, true));
    }

    async unblockUser(userId: string) {
        return this.withAuth(() => this.promisify(this.friendsClient, 'UnblockUser', { user_id: userId }, true));
    }

    async listBlockedUsers() {
        return this.withAuth(() => this.promisify(this.friendsClient, 'ListBlockedUsers', {}, true));
    }

    // Admin
    async kickUser(roomId: string, userId: string) {
        return this.withAuth(() => this.promisify(this.adminClient, 'Kick', { room_id: roomId, user_id: userId }, true));
    }

    async banUser(roomId: string, userId: string, durationSeconds: number) {
        return this.withAuth(() => this.promisify(this.adminClient, 'Ban', { room_id: roomId, user_id: userId, duration_seconds: durationSeconds }, true));
    }

    async muteUser(roomId: string, userId: string, muted: boolean) {
        return this.withAuth(() => this.promisify(this.adminClient, 'Mute', { room_id: roomId, user_id: userId, muted }, true));
    }

    // DM - using correct proto method names
    async getOrCreateDM(userId: string) {
        return this.withAuth(() => this.promisify(this.dmClient, 'CreateDM', { user_id: userId }, true));
    }

    async listDMs() {
        return this.withAuth(() => this.promisify(this.dmClient, 'ListDMChannels', {}, true));
    }

    async getDMChannel(channelId: string) {
        return this.withAuth(() => this.promisify(this.dmClient, 'GetDMChannel', { channel_id: channelId }, true));
    }

    async sendDMMessage(channelId: string, content: string, replyToId?: string) {
        const request: any = { channel_id: channelId, content };
        if (replyToId) request.reply_to_id = replyToId;
        return this.withAuth(() => this.promisify(this.dmClient, 'SendDM', request, true));
    }

    async editDMMessage(channelId: string, messageId: string, content: string) {
        return this.withAuth(() => this.promisify(this.dmClient, 'EditDM', { channel_id: channelId, message_id: messageId, content }, true));
    }

    async deleteDMMessage(channelId: string, messageId: string) {
        return this.withAuth(() => this.promisify(this.dmClient, 'DeleteDM', { channel_id: channelId, message_id: messageId }, true));
    }

    async listDMMessages(channelId: string, limit = 50, beforeId?: string) {
        return this.withAuth(() => this.promisify(this.dmClient, 'ListDMMessages', {
            channel_id: channelId,
            limit,
            before: beforeId
        }, true));
    }

    async joinDMCall(channelId: string, audioOnly = false) {
        return this.withAuth(() => this.promisify(this.dmClient, 'JoinDMCall', {
            channel_id: channelId,
            audio_only: audioOnly
        }, true));
    }

    async leaveDMCall(channelId: string) {
        return this.withAuth(() => this.promisify(this.dmClient, 'LeaveDMCall', { channel_id: channelId }, true));
    }

    async closeDM(channelId: string) {
        // Note: No backend support for closing DM channels - this is a no-op
        // DM channels persist once created
        return { success: true };
    }

    async startDMCall(channelId: string, audioOnly = false) {
        // Use JoinDMCall to start a call (first person to join starts it)
        return this.joinDMCall(channelId, audioOnly);
    }

    async endDMCall(channelId: string) {
        // Use LeaveDMCall - call ends when all participants leave
        return this.leaveDMCall(channelId);
    }

    async getDMCallStatus(channelId: string): Promise<{ active: boolean; participants: any[] }> {
        try {
            const status: any = await this.withAuth(() =>
                this.promisify(this.callClient, 'GetVoiceStatus', { room_id: channelId }, true)
            );
            const participants = status?.participants || [];
            return {
                active: participants.length > 0 || (status?.total_participants ?? 0) > 0,
                participants,
            };
        } catch (_err) {
            return { active: false, participants: [] };
        }
    }
}

export default ConcordClient;