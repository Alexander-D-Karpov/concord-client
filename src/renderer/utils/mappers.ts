import { tsToIso } from './format';
import type {
    Message, Member, Friend, FriendRequest, MessageReaction,
    Room, RoomInvite, DMMessage, MessageAttachment, User,
} from './types';

export { tsToIso };

export const mapAttachment = (a: any): MessageAttachment => ({
    id: a.id,
    url: a.url,
    filename: a.filename,
    contentType: a.content_type,
    size: a.size,
    width: a.width,
    height: a.height,
    createdAt: tsToIso(a.created_at),
});

export const mapReaction = (r: any): MessageReaction => ({
    id: r.id,
    messageId: r.message_id ?? r.messageId,
    userId: r.user_id ?? r.userId,
    emoji: r.emoji,
    createdAt: tsToIso(r.created_at ?? r.createdAt),
});

export const mapMessage = (m: any): Message => ({
    id: m.id,
    roomId: m.room_id,
    authorId: m.author_id,
    content: m.content,
    createdAt: tsToIso(m.created_at),
    editedAt: m.edited_at ? tsToIso(m.edited_at) : undefined,
    deleted: !!m.deleted,
    replyToId: m.reply_to_id,
    replyCount: m.reply_count || 0,
    attachments: (m.attachments || []).map(mapAttachment),
    mentions: m.mentions || [],
    reactions: (m.reactions || []).map(mapReaction),
    pinned: !!m.pinned,
});

export const mapMember = (m: any): Member => ({
    userId: m.user_id,
    roomId: m.room_id,
    role: m.role || 'member',
    joinedAt: tsToIso(m.joined_at),
    nickname: m.nickname,
    status: m.status || 'offline',
    lastReadMessageId: m.last_read_message_id ? String(m.last_read_message_id) : undefined,
});

export const mapRoom = (r: any): Room => ({
    id: r.id,
    name: r.name,
    createdBy: r.created_by,
    voiceServerId: r.voice_server_id,
    region: r.region,
    createdAt: tsToIso(r.created_at),
    description: r.description,
    isPrivate: r.is_private,
});

export const mapRoomInvite = (i: any): RoomInvite => ({
    id: i.id,
    roomId: i.room_id,
    roomName: i.room_name,
    inviterId: i.invited_by,
    inviterDisplayName: i.inviter_display_name || i.inviter_handle,
    inviterAvatarUrl: i.inviter_avatar_url,
    createdAt: tsToIso(i.created_at),
});

export const mapFriend = (f: any): Friend => ({
    userId: f.user_id,
    handle: f.handle,
    displayName: f.display_name,
    avatarUrl: f.avatar_url,
    status: f.status || 'offline',
    friendsSince: tsToIso(f.friends_since),
});

export const mapFriendRequest = (r: any): FriendRequest => ({
    id: r.id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    status: r.status === 'FRIEND_REQUEST_STATUS_PENDING' ? 'pending'
        : r.status === 'FRIEND_REQUEST_STATUS_ACCEPTED' ? 'accepted' : 'rejected',
    createdAt: tsToIso(r.created_at),
    updatedAt: tsToIso(r.updated_at),
    fromHandle: r.from_handle,
    fromDisplayName: r.from_display_name,
    fromAvatarUrl: r.from_avatar_url,
    toHandle: r.to_handle,
    toDisplayName: r.to_display_name,
    toAvatarUrl: r.to_avatar_url,
});

export const mapDMMessage = (m: any, channelId: string): DMMessage => ({
    id: m.id,
    channelId: m.channel_id || channelId,
    authorId: m.author_id,
    content: m.content,
    createdAt: tsToIso(m.created_at),
    editedAt: m.edited_at ? tsToIso(m.edited_at) : undefined,
    deleted: !!m.deleted,
    replyToId: m.reply_to_id,
    attachments: (m.attachments || []).map(mapAttachment),
    mentions: m.mentions || [],
    reactions: (m.reactions || []).map(mapReaction),
    pinned: !!m.pinned,
});

export const mapUserFromApi = (user: any): User => ({
    id: user.id,
    handle: user.handle,
    displayName: user.display_name || user.displayName || user.handle,
    avatarUrl: user.avatar_url || user.avatarUrl || '',
    avatarThumbnailUrl: user.avatar_thumbnail_url || user.avatarThumbnailUrl || '',
    status: user.status || 'offline',
    statusPreference: user.status_preference || user.statusPreference || undefined,
    bio: user.bio || '',
    createdAt: user.created_at || user.createdAt,
});