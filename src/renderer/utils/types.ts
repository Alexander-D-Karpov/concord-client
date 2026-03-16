export type UserStatus = 'online' | 'offline' | 'idle' | 'dnd' | string;

export interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
    avatarThumbnailUrl?: string;
    createdAt?: string;
    status?: UserStatus;
    bio?: string;
    statusPreference?: string;
}

export interface AvatarEntry {
    id: string;
    userId: string;
    fullUrl: string;
    thumbnailUrl: string;
    originalFilename: string;
    createdAt: string;
}

export interface Room {
    id: string;
    name: string;
    createdBy: string;
    voiceServerId?: string;
    region?: string;
    createdAt: string;
    description?: string;
    isPrivate?: boolean;
}

export interface Member {
    userId: string;
    roomId: string;
    role: string;
    joinedAt: string;
    nickname?: string;
    status?: UserStatus;
    lastReadMessageId?: string;
}

export interface MessageAttachment {
    id: string;
    url: string;
    filename: string;
    contentType: string;
    size: number;
    width?: number;
    height?: number;
    createdAt: string;
}

export interface MessageReaction {
    id: string;
    messageId: string;
    userId: string;
    emoji: string;
    createdAt: string;
}

export interface Message {
    id: string;
    roomId: string;
    authorId: string;
    content: string;
    createdAt: string;
    editedAt?: string;
    deleted?: boolean;
    replyToId?: string;
    replyCount?: number;
    attachments?: MessageAttachment[];
    mentions?: string[];
    reactions?: MessageReaction[];
    pinned?: boolean;
}

export interface DMMessage {
    id: string;
    channelId: string;
    authorId: string;
    content: string;
    createdAt: string;
    editedAt?: string;
    deleted: boolean;
    replyToId?: string;
    attachments: MessageAttachment[];
    mentions?: string[];
    reactions?: MessageReaction[];
    pinned?: boolean;
}

export interface RoomInvite {
    id: string;
    roomId: string;
    roomName: string;
    inviterId: string;
    inviterDisplayName: string;
    inviterAvatarUrl?: string;
    createdAt: string;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export interface FriendRequest {
    id: string;
    fromUserId: string;
    toUserId: string;
    status: FriendRequestStatus;
    createdAt: string;
    updatedAt: string;
    fromHandle: string;
    fromDisplayName: string;
    fromAvatarUrl?: string;
    toHandle: string;
    toDisplayName: string;
    toAvatarUrl?: string;
}

export interface Friend {
    userId: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
    status: UserStatus;
    friendsSince: string;
}

export interface LoginResponse {
    access_token: string;
    refresh_token: string;
    expires_in: number;
}

export interface MarkAsReadResponse {
    last_read_message_id: string;
    unread_count: number;
}

export interface VoiceJoinResponse {
    success: boolean;
    ssrc: number;
    videoSsrc: number;
    screenSsrc: number;
    sessionId: number;
    participants: any[];
    participantCount: number;
}