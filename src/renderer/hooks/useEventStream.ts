import { useEffect, useCallback } from 'react';
import { useRoomsStore } from './useRoomsStore';
import { useMessagesStore } from './useMessagesStore';
import { useFriendsStore } from './useFriendsStore';
import { useUsersStore } from './useUsersStore';
import { useNotifications } from './useNotifications';
import { useNotificationStore } from './useNotificationStore';
import { useDMStore, DMMessage } from './useDMStore';
import { useTypingStore } from './useTypingStore';
import { Message, Member, MessageReaction, Room, RoomInvite } from '../types';

const tsToIso = (ts: any): string => {
    if (!ts) return '';
    const seconds = Number(ts.seconds ?? 0);
    const nanos = Number(ts.nanos ?? 0);
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
};

const mapMessage = (m: any): Message => ({
    id: m.id,
    roomId: m.room_id,
    authorId: m.author_id,
    content: m.content,
    createdAt: tsToIso(m.created_at),
    editedAt: m.edited_at ? tsToIso(m.edited_at) : undefined,
    deleted: !!m.deleted,
    replyToId: m.reply_to_id,
    replyCount: m.reply_count || 0,
    attachments: m.attachments?.map((a: any) => ({
        id: a.id,
        url: a.url,
        filename: a.filename,
        contentType: a.content_type,
        size: a.size,
        width: a.width,
        height: a.height,
        createdAt: tsToIso(a.created_at),
    })) || [],
    mentions: m.mentions || [],
    reactions: m.reactions?.map((r: any) => ({
        id: r.id,
        messageId: r.message_id,
        userId: r.user_id,
        emoji: r.emoji,
        createdAt: tsToIso(r.created_at),
    })) || [],
    pinned: !!m.pinned,
});

const mapMember = (m: any): Member => ({
    userId: m.user_id,
    roomId: m.room_id,
    role: m.role || 'member',
    joinedAt: tsToIso(m.joined_at),
    nickname: m.nickname,
    status: m.status || 'offline',
    lastReadMessageId: m.last_read_message_id ? String(m.last_read_message_id) : undefined,
});

const mapRoom = (r: any): Room => ({
    id: r.id,
    name: r.name,
    createdBy: r.created_by,
    voiceServerId: r.voice_server_id,
    region: r.region,
    createdAt: tsToIso(r.created_at),
    description: r.description,
    isPrivate: r.is_private,
});

const debounce = <T extends (...args: any[]) => any>(fn: T, ms: number) => {
    let timeoutId: NodeJS.Timeout | null = null;
    return (...args: Parameters<T>) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), ms);
    };
};

const mapReaction = (r: any): MessageReaction => ({
    id: r.id,
    messageId: r.message_id ?? r.messageId,
    userId: r.user_id ?? r.userId,
    emoji: r.emoji,
    createdAt: tsToIso(r.created_at ?? r.createdAt),
});

const mapRoomInvite = (i: any): RoomInvite => ({
    id: i.id,
    roomId: i.room_id,
    roomName: i.room_name,
    inviterId: i.invited_by,
    inviterDisplayName: i.inviter_display_name || i.inviter_handle,
    inviterAvatarUrl: i.inviter_avatar_url,
    createdAt: tsToIso(i.created_at),
});

export const useEventStream = () => {
    const setMembers = useRoomsStore(state => state.setMembers);
    const updateRoomInStore = useRoomsStore(state => state.updateRoom);
    const updateMemberReadStatus = useRoomsStore(state => state.updateMemberReadStatus);
    const setRoomInvites = useRoomsStore(state => state.setRoomInvites);

    const addMessage = useMessagesStore(state => state.addMessage);
    const updateMessage = useMessagesStore(state => state.updateMessage);
    const deleteMessage = useMessagesStore(state => state.deleteMessage);
    const addReaction = useMessagesStore(state => state.addReaction);
    const removeReaction = useMessagesStore(state => state.removeReaction);
    const setPinned = useMessagesStore(state => state.setPinned);

    const loadFriends = useFriendsStore(state => state.loadFriends);
    const loadPendingRequests = useFriendsStore(state => state.loadPendingRequests);

    const setUser = useUsersStore(state => state.setUser);
    const getUser = useUsersStore(state => state.getUser);

    const { notifyMessage, notifyDM, notifyFriendRequest, notifyCall } = useNotifications();

    const setUnread = useNotificationStore(state => state.setUnread);
    const setLastRead = useNotificationStore(state => state.setLastRead);

    const addDMMessage = useDMStore(state => state.addMessage);
    const setTyping = useTypingStore(state => state.setTyping);

    const refreshRoomMembers = useCallback(async (roomId: string) => {
        try {
            const res = await window.concord.getMembers(roomId);
            setMembers(roomId, (res?.members || []).map(mapMember));
        } catch {}
    }, [setMembers]);

    const handleEvent = useCallback((raw: any) => {
        if (!raw) return;

        const p = raw;

        if (p.message_created?.message) {
            const msg = mapMessage(p.message_created.message);
            addMessage(msg.roomId, msg);

            const { fetchUser } = useUsersStore.getState();
            fetchUser(msg.authorId).then(() => {
                const author = useUsersStore.getState().getUser(msg.authorId);
                const currentRooms = useRoomsStore.getState().rooms;
                const room = currentRooms.find(r => r.id === msg.roomId);

                notifyMessage({
                    roomId: msg.roomId,
                    roomName: room?.name || 'Unknown',
                    authorId: msg.authorId,
                    authorName: author?.displayName || author?.handle || 'Unknown',
                    content: msg.content,
                    mentions: msg.mentions,
                });
            });
            return;
        }

        if (p.message_edited?.message) {
            const msg = mapMessage(p.message_edited.message);
            updateMessage(msg.roomId, msg.id, msg.content);
            return;
        }

        if (p.message_deleted) {
            deleteMessage(p.message_deleted.room_id, p.message_deleted.message_id);
            return;
        }

        if (p.message_reaction_added?.reaction) {
            addReaction(p.message_reaction_added.room_id, p.message_reaction_added.message_id, mapReaction(p.message_reaction_added.reaction));
            return;
        }

        if (p.message_reaction_removed) {
            const { room_id, message_id, reaction_id, user_id } = p.message_reaction_removed;
            removeReaction(room_id, message_id, reaction_id ? { id: reaction_id } : { userId: user_id });
            return;
        }

        if (p.message_pinned) {
            setPinned(p.message_pinned.room_id, p.message_pinned.message_id, true);
            return;
        }

        if (p.message_unpinned) {
            setPinned(p.message_unpinned.room_id, p.message_unpinned.message_id, false);
            return;
        }

        if (p.member_joined?.member) { refreshRoomMembers(p.member_joined.member.room_id); return; }
        if (p.member_removed) { refreshRoomMembers(p.member_removed.room_id); return; }
        if (p.member_nickname_changed) { refreshRoomMembers(p.member_nickname_changed.room_id); return; }
        if (p.role_changed) { refreshRoomMembers(p.role_changed.room_id); return; }
        if (p.room_updated?.room) { updateRoomInStore(mapRoom(p.room_updated.room)); return; }

        if (p.voice_state_changed) { window.dispatchEvent(new CustomEvent('voice-state-changed', { detail: p.voice_state_changed })); return; }
        if (p.voice_user_joined) { window.dispatchEvent(new CustomEvent('voice-user-joined', { detail: p.voice_user_joined })); return; }
        if (p.voice_user_left) { window.dispatchEvent(new CustomEvent('voice-user-left', { detail: p.voice_user_left })); return; }

        if (p.user_status_changed) {
            const { user_id, status } = p.user_status_changed;
            setUser({ id: user_id, status } as any);

            useDMStore.setState(state => ({
                channels: state.channels.map(ch =>
                    ch.otherUserId === user_id ? { ...ch, otherUserStatus: status } : ch
                )
            }));

            useFriendsStore.getState().updateFriendStatus(user_id, status);
            return;
        }

        if (p.profile_updated) {
            const { user_id, display_name, avatar_url, status, bio } = p.profile_updated;
            setUser({ id: user_id, displayName: display_name, avatarUrl: avatar_url, status, bio } as any);
            useDMStore.setState(state => ({
                channels: state.channels.map(ch =>
                    ch.otherUserId === user_id ? {
                        ...ch,
                        otherUserDisplay: display_name || ch.otherUserDisplay,
                        otherUserAvatar: avatar_url || ch.otherUserAvatar,
                        otherUserStatus: status || ch.otherUserStatus
                    } : ch
                )
            }));
            return;
        }

        if (p.friend_request_created?.request) {
            loadPendingRequests();
            const req = p.friend_request_created.request;
            notifyFriendRequest({ fromUserId: req.from_user_id, fromName: req.from_display_name || req.from_handle });
            return;
        }
        if (p.friend_request_updated) { loadPendingRequests(); loadFriends(); return; }
        if (p.friend_removed) { loadFriends(); return; }

        if (p.room_invite_received) {
            window.concord.listRoomInvites().then((res: { incoming: any; }) => {
                setRoomInvites((res.incoming || []).map(mapRoomInvite));
            });

            notifyMessage({
                roomId: '',
                roomName: 'System',
                authorId: '',
                authorName: 'Concord',
                content: `You were invited to ${p.room_invite_received.room_name} by ${p.room_invite_received.inviter_display_name}`
            });
            return;
        }

        if (p.room_invite_created?.invite) {
            window.concord.listRoomInvites().then((res: { incoming: any; }) => {
                setRoomInvites((res.incoming || []).map(mapRoomInvite));
            });
            return;
        }

        if (p.room_invite_updated?.invite) {
            window.concord.listRoomInvites().then((res: { incoming: any; }) => {
                setRoomInvites((res.incoming || []).map(mapRoomInvite));
            });
            return;
        }

        if (p.dm_message_created?.message) {
            const msg = p.dm_message_created.message;
            const channelId = msg.channel_id || p.dm_message_created.channel_id;

            const dmMessage: DMMessage = {
                id: msg.id,
                channelId: channelId,
                authorId: msg.author_id,
                content: msg.content,
                createdAt: tsToIso(msg.created_at),
                deleted: false,
                attachments: msg.attachments || []
            };
            addDMMessage(channelId, dmMessage);

            const { fetchUser } = useUsersStore.getState();
            fetchUser(msg.author_id).then(() => {
                const author = useUsersStore.getState().getUser(msg.author_id);
                notifyDM({
                    channelId: channelId,
                    authorId: msg.author_id,
                    authorName: author?.displayName || author?.handle || 'Unknown',
                    content: msg.content,
                });
            });
            return;
        }

        if (p.dm_call_started) {
            const { channel_id, caller_id } = p.dm_call_started;
            const caller = getUser(caller_id);
            const callerName = caller?.displayName || caller?.handle || 'Unknown';

            window.dispatchEvent(new CustomEvent('dm-call-started', {
                detail: { ...p.dm_call_started, caller_name: callerName }
            }));

            notifyCall({
                channelId: channel_id,
                callerName: callerName,
            });
            return;
        }

        if (p.dm_call_ended) {
            window.dispatchEvent(new CustomEvent('dm-call-ended', { detail: p.dm_call_ended }));
            return;
        }

        if (p.unread_count_updated) {
            const { room_id, channel_id, unread_count, last_message_id } = p.unread_count_updated;
            if (room_id) {
                setUnread('room', room_id, unread_count || 0);
                if (last_message_id) setLastRead('room', room_id, last_message_id);
            } else if (channel_id) {
                setUnread('dm', channel_id, unread_count || 0);
                if (last_message_id) setLastRead('dm', channel_id, last_message_id);
            }
            return;
        }

        if (p.message_read) {
            const { room_id, channel_id, message_id, user_id } = p.message_read;
            if (room_id && message_id) {
                setLastRead('room', room_id, message_id);
                // Update local member state for read tracking
                if (user_id) {
                    updateMemberReadStatus(room_id, user_id, message_id);
                }
            }
            if (channel_id && message_id) {
                setLastRead('dm', channel_id, message_id);
            }
            return;
        }

        if (p.typing_started) {
            const { user_id, room_id, channel_id } = p.typing_started;
            if (room_id) setTyping(room_id, user_id, true);
            if (channel_id) setTyping(channel_id, user_id, true);
            return;
        }

        if (p.typing_stopped) {
            const { user_id, room_id, channel_id } = p.typing_stopped;
            if (room_id) setTyping(room_id, user_id, false);
            if (channel_id) setTyping(channel_id, user_id, false);
            return;
        }

    }, [
        addMessage, updateMessage, deleteMessage, addReaction, removeReaction, setPinned,
        refreshRoomMembers, updateRoomInStore, setUser, getUser, loadFriends, loadPendingRequests,
        notifyMessage, notifyDM, notifyFriendRequest, notifyCall, setUnread, setLastRead, addDMMessage,
        setRoomInvites, setTyping, updateMemberReadStatus
    ]);

    useEffect(() => {
        const unsubEvent = window.concord.onStreamEvent?.(handleEvent);
        const unsubError = window.concord.onStreamError?.((err: string) => { console.error('[EventStream] Error:', err); });
        const unsubEnd = window.concord.onStreamEnd?.(() => { console.log('[EventStream] Ended'); });

        return () => { unsubEvent?.(); unsubError?.(); unsubEnd?.(); };
    }, [handleEvent]);
};