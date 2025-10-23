export interface User {
    id: string;
    handle: string;
    displayName: string;
    avatarUrl?: string;
    createdAt: string;
}

export interface Room {
    id: string;
    name: string;
    createdBy: string;
    voiceServerId?: string;
    region?: string;
    createdAt: string;
}

export interface Member {
    userId: string;
    roomId: string;
    role: 'member' | 'moderator' | 'admin';
    joinedAt: string;
}

export interface Message {
    id: string;
    roomId: string;
    authorId: string;
    content: string;
    createdAt: string;
    editedAt?: string;
    deleted?: boolean;
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