import { useEffect, useCallback } from 'react';
import { useRoomsStore } from './useRoomsStore';
import { useMessagesStore } from './useMessagesStore';
import { useFriendsStore } from './useFriendsStore';
import { Message, Member, MessageReaction } from '../types';

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
});

const mapReaction = (r: any): MessageReaction => ({
    id: r.id,
    messageId: r.message_id ?? r.messageId,
    userId: r.user_id ?? r.userId,
    emoji: r.emoji,
    createdAt: tsToIso(r.created_at ?? r.createdAt),
});

export const useEventStream = () => {
    const { setMembers } = useRoomsStore();
    const { addMessage, updateMessage, deleteMessage, addReaction, removeReaction } = useMessagesStore();
    const { loadFriends, loadPendingRequests } = useFriendsStore();

    const refreshRoomMembers = useCallback(async (roomId: string) => {
        try {
            console.log('[EventStream] Refreshing members for room:', roomId);
            const res = await window.concord.getMembers(roomId);
            const members: Member[] = (res?.members || []).map(mapMember);
            setMembers(roomId, members);
        } catch (err) {
            console.error('[EventStream] Failed to refresh members:', err);
        }
    }, [setMembers]);

    const handleEvent = useCallback((raw: any) => {
        console.log('[EventStream] Event received:', raw?.payload);

        try {
            const normalizeEvent = (ev: any) => {
                const payload = (typeof ev.payload === 'object' && ev.payload) ? ev.payload : {
                    message_created: ev.message_created,
                    message_edited: ev.message_edited,
                    message_deleted: ev.message_deleted,
                    message_reaction_added: ev.message_reaction_added,
                    message_reaction_removed: ev.message_reaction_removed,
                    message_pinned: ev.message_pinned,
                    message_unpinned: ev.message_unpinned,
                    member_joined: ev.member_joined,
                    member_removed: ev.member_removed,
                    member_nickname_changed: ev.member_nickname_changed,
                    voice_state_changed: ev.voice_state_changed,
                    role_changed: ev.role_changed,
                    user_status_changed: ev.user_status_changed,
                    voice_user_joined: ev.voice_user_joined,
                    voice_user_left: ev.voice_user_left,
                    room_updated: ev.room_updated,
                    friend_request_created: ev.friend_request_created,
                    friend_request_updated: ev.friend_request_updated,
                    ack: ev.ack,
                };

                return {
                    event_id: ev.event_id ?? ev.eventId,
                    created_at: ev.created_at ?? ev.createdAt,
                    payload,
                };
            };

            const event = normalizeEvent(raw);
            const p = event.payload;
            if (!p) return;

            if (p.message_created) {
                const msg = mapMessage(p.message_created.message);
                addMessage(msg.roomId, msg);
                return;
            }

            if (p.message_edited) {
                const msg = mapMessage(p.message_edited.message);
                updateMessage(msg.roomId, msg.id, msg.content);
                return;
            }

            if (p.message_deleted) {
                const { room_id, message_id } = p.message_deleted;
                deleteMessage(room_id, message_id);
                return;
            }

            if (p.message_reaction_added) {
                const { room_id, message_id, reaction } = p.message_reaction_added;
                if (reaction) {
                    addReaction(room_id, message_id, mapReaction(reaction));
                }
                return;
            }

            if (p.message_reaction_removed) {
                const { room_id, message_id, reaction } = p.message_reaction_removed;
                if (reaction?.id) {
                    removeReaction(room_id, message_id, { id: reaction.id });
                } else if (reaction) {
                    removeReaction(room_id, message_id, {
                        userId: reaction.user_id ?? reaction.userId,
                        emoji: reaction.emoji,
                    });
                }
                return;
            }

            if (p.member_joined) {
                const member = mapMember(p.member_joined.member);
                refreshRoomMembers(member.roomId);
                return;
            }

            if (p.member_removed) {
                const { room_id } = p.member_removed;
                refreshRoomMembers(room_id);
                return;
            }

            if (p.friend_request_created) {
                loadPendingRequests();
                return;
            }

            if (p.friend_request_updated) {
                loadPendingRequests();
                loadFriends();
                return;
            }
        } catch (err) {
            console.error('[EventStream] Failed to handle event:', err);
        }
    }, [addMessage, updateMessage, deleteMessage, addReaction, removeReaction, refreshRoomMembers, loadFriends, loadPendingRequests]);

    useEffect(() => {
        console.log('[EventStream] Setting up event listeners');

        const unsubEvent = window.concord.onStreamEvent?.((ev) => {
            handleEvent(ev);
        });

        const unsubError = window.concord.onStreamError?.((err) => {
            console.error('[EventStream] Stream error:', err);
        });

        const unsubEnd = window.concord.onStreamEnd?.(() => {
            console.log('[EventStream] Stream ended');
        });

        return () => {
            console.log('[EventStream] Cleaning up event listeners');
            unsubEvent?.();
            unsubError?.();
            unsubEnd?.();
        };
    }, [handleEvent]);
};