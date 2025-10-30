export type UserStatus = 'online' | 'offline' | 'away' | 'busy';

export interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
    createdAt: string;
    status?: UserStatus;
    bio?: string;
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
    role: 'member' | 'moderator' | 'admin';
    joinedAt: string;
    nickname?: string;
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

export interface VoiceState {
    userId: string;
    roomId: string;
    muted: boolean;
    videoEnabled: boolean;
    speaking: boolean;
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}