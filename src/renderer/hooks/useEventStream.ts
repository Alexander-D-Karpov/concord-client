import {useEffect, useCallback, useRef} from 'react';
import { useRoomsStore } from './useRoomsStore';
import { useMessagesStore } from './useMessagesStore';
import { useFriendsStore } from './useFriendsStore';
import { useUsersStore } from './useUsersStore';
import { useNotifications } from './useNotifications';
import { useNotificationStore } from './useNotificationStore';
import { useDMStore } from './useDMStore';
import { useTypingStore } from './useTypingStore';
import useAuthStore from './useAuthStore';
import { mapMessage, mapMember, mapRoom, mapRoomInvite, mapReaction } from '../utils/mappers';
import { tsToIso } from '../utils/format';
import type { DMMessage } from '../utils/types';

export const useEventStream = () => {
    const setMembers = useRoomsStore(s => s.setMembers);
    const updateRoomInStore = useRoomsStore(s => s.updateRoom);
    const updateMemberReadStatus = useRoomsStore(s => s.updateMemberReadStatus);

    const addMessage = useMessagesStore(s => s.addMessage);
    const updateMessage = useMessagesStore(s => s.updateMessage);
    const deleteMessage = useMessagesStore(s => s.deleteMessage);
    const addReaction = useMessagesStore(s => s.addReaction);
    const removeReaction = useMessagesStore(s => s.removeReaction);
    const setPinned = useMessagesStore(s => s.setPinned);

    const setUser = useUsersStore(s => s.setUser);
    const { notifyMessage, notifyDM, notifyFriendRequest, notifyCall } = useNotifications();
    const setUnread = useNotificationStore(s => s.setUnread);
    const setLastRead = useNotificationStore(s => s.setLastRead);
    const addDMMessage = useDMStore(s => s.addMessage);
    const setTyping = useTypingStore(s => s.setTyping);

    const refreshRoomMembers = useCallback(async (roomId: string) => {
        try {
            const res = await window.concord.getMembers(roomId);
            setMembers(roomId, (res?.members || []).map(mapMember));
        } catch {}
    }, [setMembers]);

    const upsertById = <T extends { id: string }>(items: T[], item: T): T[] => {
        const index = items.findIndex(x => x.id === item.id);
        if (index === -1) return [item, ...items];
        const next = [...items];
        next[index] = item;
        return next;
    };

    const upsertByUserId = <T extends { userId: string }>(items: T[], item: T): T[] => {
        const index = items.findIndex(x => x.userId === item.userId);
        if (index === -1) return [item, ...items];
        const next = [...items];
        next[index] = { ...next[index], ...item };
        return next;
    };

    const normalizeFriendRequestStatus = (status: unknown) => {
        if (status === 1 || status === 'FRIEND_REQUEST_STATUS_PENDING' || status === 'pending') return 'pending';
        if (status === 2 || status === 'FRIEND_REQUEST_STATUS_ACCEPTED' || status === 'accepted') return 'accepted';
        if (status === 3 || status === 'FRIEND_REQUEST_STATUS_REJECTED' || status === 'rejected') return 'rejected';
        return 'unknown';
    };

    const normalizeRoomInviteStatus = (status: unknown) => {
        if (status === 1 || status === 'ROOM_INVITE_STATUS_PENDING' || status === 'pending') return 'pending';
        if (status === 2 || status === 'ROOM_INVITE_STATUS_ACCEPTED' || status === 'accepted') return 'accepted';
        if (status === 3 || status === 'ROOM_INVITE_STATUS_REJECTED' || status === 'rejected') return 'rejected';
        return 'unknown';
    };

    const handleEvent = useCallback((p: any) => {
        if (!p) return;

        if (p.message_created?.message) {
            const msg = mapMessage(p.message_created.message);
            addMessage(msg.roomId, msg);
            const { fetchUser } = useUsersStore.getState();
            fetchUser(msg.authorId).then(() => {
                const author = useUsersStore.getState().getUser(msg.authorId);
                const room = useRoomsStore.getState().rooms.find(r => r.id === msg.roomId);
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
            const d = p.message_reaction_removed;
            removeReaction(d.room_id, d.message_id, d.reaction_id ? { id: d.reaction_id } : { userId: d.user_id });
            return;
        }

        if (p.message_pinned) { setPinned(p.message_pinned.room_id, p.message_pinned.message_id, true); return; }
        if (p.message_unpinned) { setPinned(p.message_unpinned.room_id, p.message_unpinned.message_id, false); return; }
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

            const auth = useAuthStore.getState();
            if (auth.user?.id === user_id) {
                auth.setUser({ id: user_id, status } as any);
            }

            useDMStore.setState((s) => ({
                channels: s.channels.map((ch) =>
                    ch.otherUserId === user_id
                        ? { ...ch, otherUserStatus: status }
                        : ch
                ),
            }));

            useFriendsStore.getState().updateFriendStatus(user_id, status);
            return;
        }

        if (p.profile_updated) {
            const { user_id, display_name, avatar_url, status } = p.profile_updated;

            setUser({
                id: user_id,
                displayName: display_name,
                avatarUrl: avatar_url,
                status,
            } as any);

            const auth = useAuthStore.getState();
            if (auth.user?.id === user_id) {
                auth.setUser({
                    id: user_id,
                    displayName: display_name,
                    avatarUrl: avatar_url,
                    status,
                } as any);
            }

            useDMStore.setState((s) => ({
                channels: s.channels.map((ch) =>
                    ch.otherUserId === user_id
                        ? {
                            ...ch,
                            otherUserDisplay: display_name || ch.otherUserDisplay,
                            otherUserAvatar: avatar_url || ch.otherUserAvatar,
                            otherUserStatus: status || ch.otherUserStatus,
                        }
                        : ch
                ),
            }));
            return;
        }

        if (p.friend_request_created?.request) {
            const req = p.friend_request_created.request;
            const me = useAuthStore.getState().user?.id;
            const status = normalizeFriendRequestStatus(req.status);

            const mappedReq = {
                id: req.id,
                fromUserId: req.from_user_id,
                toUserId: req.to_user_id,
                status,
                createdAt: tsToIso(req.created_at),
                updatedAt: tsToIso(req.updated_at),
                fromHandle: req.from_handle,
                fromDisplayName: req.from_display_name,
                fromAvatarUrl: req.from_avatar_url,
                toHandle: req.to_handle,
                toDisplayName: req.to_display_name,
                toAvatarUrl: req.to_avatar_url,
            };

            useFriendsStore.setState(state => ({
                incomingRequests: mappedReq.toUserId === me
                    ? upsertById(state.incomingRequests, mappedReq as any)
                    : state.incomingRequests,
                outgoingRequests: mappedReq.fromUserId === me
                    ? upsertById(state.outgoingRequests, mappedReq as any)
                    : state.outgoingRequests,
            }));

            notifyFriendRequest({
                fromUserId: req.from_user_id,
                fromName: req.from_display_name || req.from_handle,
            });
            return;
        }

        if (p.friend_request_updated?.request) {
            const req = p.friend_request_updated.request;
            const me = useAuthStore.getState().user?.id;
            const status = normalizeFriendRequestStatus(req.status);

            const mappedReq = {
                id: req.id,
                fromUserId: req.from_user_id,
                toUserId: req.to_user_id,
                status,
                createdAt: tsToIso(req.created_at),
                updatedAt: tsToIso(req.updated_at),
                fromHandle: req.from_handle,
                fromDisplayName: req.from_display_name,
                fromAvatarUrl: req.from_avatar_url,
                toHandle: req.to_handle,
                toDisplayName: req.to_display_name,
                toAvatarUrl: req.to_avatar_url,
            };

            useFriendsStore.setState(state => {
                const incomingRequests = state.incomingRequests.filter(r => r.id !== mappedReq.id);
                const outgoingRequests = state.outgoingRequests.filter(r => r.id !== mappedReq.id);

                if (mappedReq.status === 'pending') {
                    return {
                        incomingRequests: mappedReq.toUserId === me
                            ? upsertById(incomingRequests, mappedReq as any)
                            : incomingRequests,
                        outgoingRequests: mappedReq.fromUserId === me
                            ? upsertById(outgoingRequests, mappedReq as any)
                            : outgoingRequests,
                    };
                }

                if (mappedReq.status === 'accepted') {
                    const friend =
                        mappedReq.fromUserId === me
                            ? {
                                userId: mappedReq.toUserId,
                                handle: mappedReq.toHandle,
                                displayName: mappedReq.toDisplayName || mappedReq.toHandle,
                                avatarUrl: mappedReq.toAvatarUrl,
                                status: 'offline',
                                friendsSince: mappedReq.updatedAt,
                            }
                            : {
                                userId: mappedReq.fromUserId,
                                handle: mappedReq.fromHandle,
                                displayName: mappedReq.fromDisplayName || mappedReq.fromHandle,
                                avatarUrl: mappedReq.fromAvatarUrl,
                                status: 'offline',
                                friendsSince: mappedReq.updatedAt,
                            };

                    return {
                        incomingRequests,
                        outgoingRequests,
                        friends: upsertByUserId(state.friends, friend as any),
                    };
                }

                return {
                    incomingRequests,
                    outgoingRequests,
                };
            });

            return;
        }

        if (p.friend_removed) {
            useFriendsStore.setState(state => ({
                friends: state.friends.filter(f => f.userId !== p.friend_removed.user_id),
            }));
            return;
        }

        if (p.room_invite_created?.invite) {
            const invite = mapRoomInvite(p.room_invite_created.invite);
            useRoomsStore.setState(state => ({
                roomInvites: upsertById(state.roomInvites, invite as any),
            }));
            return;
        }

        if (p.room_invite_updated?.invite) {
            const raw = p.room_invite_updated.invite;
            const status = normalizeRoomInviteStatus(raw.status);

            if (status !== 'pending') {
                useRoomsStore.setState(state => ({
                    roomInvites: state.roomInvites.filter(inv => inv.id !== raw.id),
                }));
                return;
            }

            const invite = mapRoomInvite(raw);
            useRoomsStore.setState(state => ({
                roomInvites: upsertById(state.roomInvites, invite as any),
            }));
            return;
        }

        if (p.room_invite_received) {
            notifyMessage({
                roomId: '',
                roomName: 'System',
                authorId: '',
                authorName: 'Concord',
                content: `You were invited to ${p.room_invite_received.room_name}`,
            });
            return;
        }

        if (p.dm_message_created?.message) {
            const raw = p.dm_message_created.message;
            const channelId = raw.channel_id || p.dm_message_created.channel_id;
            const dmMsg: DMMessage = {
                id: raw.id, channelId, authorId: raw.author_id, content: raw.content,
                createdAt: tsToIso(raw.created_at), deleted: false,
                attachments: raw.attachments || [], mentions: [], reactions: [], pinned: false,
            };
            addDMMessage(channelId, dmMsg);
            const { fetchUser } = useUsersStore.getState();
            fetchUser(raw.author_id).then(() => {
                const author = useUsersStore.getState().getUser(raw.author_id);
                notifyDM({
                    channelId, authorId: raw.author_id,
                    authorName: author?.displayName || author?.handle || 'Unknown',
                    content: raw.content,
                });
            });
            return;
        }

        if (p.dm_call_started) {
            const caller = useUsersStore.getState().getUser(p.dm_call_started.caller_id);
            const callerName = caller?.displayName || caller?.handle || 'Unknown';
            window.dispatchEvent(new CustomEvent('dm-call-started', { detail: { ...p.dm_call_started, caller_name: callerName } }));
            notifyCall({ channelId: p.dm_call_started.channel_id, callerName });
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
                if (user_id) updateMemberReadStatus(room_id, user_id, message_id);
            }
            if (channel_id && message_id) setLastRead('dm', channel_id, message_id);
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
        addMessage,
        updateMessage,
        deleteMessage,
        addReaction,
        removeReaction,
        setPinned,
        refreshRoomMembers,
        updateRoomInStore,
        setUser,
        notifyMessage,
        notifyDM,
        notifyFriendRequest,
        notifyCall,
        setUnread,
        setLastRead,
        addDMMessage,
        setTyping,
        updateMemberReadStatus,
    ]);

    const handleEventRef = useRef(handleEvent);
    const seenEventIdsRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        handleEventRef.current = handleEvent;
    }, [handleEvent]);

    useEffect(() => {
        const onEvent = (event: any) => {
            const eventId = event?.event_id;
            if (eventId) {
                if (seenEventIdsRef.current.has(eventId)) return;
                seenEventIdsRef.current.add(eventId);

                if (seenEventIdsRef.current.size > 1000) {
                    const first = seenEventIdsRef.current.values().next().value;
                    if (first) seenEventIdsRef.current.delete(first);
                }
            }

            handleEventRef.current(event);
        };

        const unsubEvent = window.concord.onStreamEvent?.(onEvent);
        const unsubError = window.concord.onStreamError?.((err: string) => {
            console.error('[EventStream] Error:', err);
        });
        const unsubEnd = window.concord.onStreamEnd?.(() => {
            console.log('[EventStream] Ended');
        });

        return () => {
            unsubEvent?.();
            unsubError?.();
            unsubEnd?.();
        };
    }, []);
};