import { useEffect, useCallback } from 'react';
import { useRoomsStore } from './useRoomsStore';
import { useMessagesStore } from './useMessagesStore';
import { useFriendsStore } from './useFriendsStore';
import { useUsersStore } from './useUsersStore';
import { Message, Member, MessageReaction, Room } from '../types';

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

const mapReaction = (r: any): MessageReaction => ({
    id: r.id,
    messageId: r.message_id ?? r.messageId,
    userId: r.user_id ?? r.userId,
    emoji: r.emoji,
    createdAt: tsToIso(r.created_at ?? r.createdAt),
});

export const useEventStream = () => {
    const { setMembers, setRooms, rooms, updateRoom: updateRoomInStore } = useRoomsStore();
    const { addMessage, updateMessage, deleteMessage, addReaction, removeReaction, setPinned } = useMessagesStore();
    const { loadFriends, loadPendingRequests } = useFriendsStore();
    const { setUser } = useUsersStore();

    const refreshRoomMembers = useCallback(async (roomId: string) => {
        try {
            const res = await window.concord.getMembers(roomId);
            setMembers(roomId, (res?.members || []).map(mapMember));
        } catch {}
    }, [setMembers]);

    const handleEvent = useCallback((raw: any) => {
        if (!raw) return;

        const p = raw;

        // Message events
        if (p.message_created?.message) {
            const msg = mapMessage(p.message_created.message);
            addMessage(msg.roomId, msg);
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
            addReaction(
                p.message_reaction_added.room_id,
                p.message_reaction_added.message_id,
                mapReaction(p.message_reaction_added.reaction)
            );
            return;
        }

        if (p.message_reaction_removed) {
            const { room_id, message_id, reaction_id, user_id } = p.message_reaction_removed;
            removeReaction(
                room_id,
                message_id,
                reaction_id ? { id: reaction_id } : { userId: user_id }
            );
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

        // Member events
        if (p.member_joined?.member) {
            refreshRoomMembers(p.member_joined.member.room_id);
            return;
        }

        if (p.member_removed) {
            refreshRoomMembers(p.member_removed.room_id);
            return;
        }

        if (p.member_nickname_changed) {
            refreshRoomMembers(p.member_nickname_changed.room_id);
            return;
        }

        if (p.role_changed) {
            refreshRoomMembers(p.role_changed.room_id);
            return;
        }

        // Room events
        if (p.room_updated?.room) {
            const room = mapRoom(p.room_updated.room);
            updateRoomInStore(room);
            return;
        }

        // Voice events - dispatch as CustomEvents for useVoiceClient to handle
        if (p.voice_state_changed) {
            console.log('[EventStream] Voice state changed:', p.voice_state_changed);
            window.dispatchEvent(
                new CustomEvent('voice-state-changed', { detail: p.voice_state_changed })
            );
            return;
        }

        if (p.voice_user_joined) {
            console.log('[EventStream] Voice user joined:', p.voice_user_joined);
            window.dispatchEvent(
                new CustomEvent('voice-user-joined', { detail: p.voice_user_joined })
            );
            return;
        }

        if (p.voice_user_left) {
            console.log('[EventStream] Voice user left:', p.voice_user_left);
            window.dispatchEvent(
                new CustomEvent('voice-user-left', { detail: p.voice_user_left })
            );
            return;
        }

        // User events
        if (p.user_status_changed) {
            const { user_id, status } = p.user_status_changed;
            setUser({ id: user_id, status } as any);
            return;
        }

        if (p.profile_updated) {
            const { user_id, display_name, avatar_url, status, bio } = p.profile_updated;
            setUser({
                id: user_id,
                displayName: display_name,
                avatarUrl: avatar_url,
                status,
                bio,
            } as any);
            return;
        }

        // Friend events
        if (p.friend_request_created || p.friend_request_updated) {
            loadPendingRequests();
            loadFriends();
            return;
        }

        if (p.friend_removed) {
            loadFriends();
            return;
        }

        // Room invite events
        if (p.room_invite_received || p.room_invite_created || p.room_invite_updated) {
            // Could trigger a refresh of room invites if we had that in a store
            return;
        }

        // Log unhandled events for debugging
        const eventKeys = Object.keys(p).filter(k => !['event_id', 'created_at', 'payload'].includes(k));
        if (eventKeys.length > 0) {
            console.log('[EventStream] Unhandled event keys:', eventKeys);
        }
    }, [
        addMessage,
        updateMessage,
        deleteMessage,
        addReaction,
        removeReaction,
        setPinned,
        refreshRoomMembers,
        updateRoomInStore,
        setUser,
        loadFriends,
        loadPendingRequests,
    ]);

    useEffect(() => {
        console.log('[EventStream] Setting up event listeners');

        const unsubEvent = window.concord.onStreamEvent?.(handleEvent);
        const unsubError = window.concord.onStreamError?.((err: string) => {
            console.error('[EventStream] Error:', err);
        });
        const unsubEnd = window.concord.onStreamEnd?.(() => {
            console.log('[EventStream] Ended');
        });

        return () => {
            console.log('[EventStream] Cleaning up event listeners');
            unsubEvent?.();
            unsubError?.();
            unsubEnd?.();
        };
    }, [handleEvent]);
};