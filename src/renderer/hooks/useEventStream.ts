import { useEffect, useRef, useCallback, useState } from 'react';
import { useRoomsStore } from './useRoomsStore';
import { useMessagesStore } from './useMessagesStore';
import { useAuthStore } from './useAuthStore';
import { Message, Member } from '../types';

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
});

export const useEventStream = () => {
    const { rooms, setMembers } = useRoomsStore();
    const { addMessage, updateMessage, deleteMessage } = useMessagesStore();
    const { isAuthenticated, tokens, isInitializing } = useAuthStore();

    const [connected, setConnected] = useState(false);
    const [reconnecting, setReconnecting] = useState(false);

    const streamRef = useRef<{ active: boolean } | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const initializingRef = useRef(false);

    const sendAck = useCallback(async (eventId: string) => {
        try {
            await window.concord.streamAck?.(eventId);
        } catch (err) {
            console.error('[EventStream] Failed to send ack:', err);
        }
    }, []);

    const startStream = useCallback(async () => {
        if (!isAuthenticated || !tokens?.accessToken || streamRef.current || initializingRef.current || isInitializing) {
            return;
        }

        initializingRef.current = true;
        setReconnecting(true);

        try {
            console.log('[EventStream] Starting event stream...');

            await new Promise(resolve => setTimeout(resolve, 500));

            const result = await window.concord.startEventStream?.();

            if (!result || !result.success) {
                throw new Error('Failed to initialize stream');
            }

            streamRef.current = { active: true };
            reconnectAttemptsRef.current = 0;
            setConnected(true);
            setReconnecting(false);

            console.log('[EventStream] Stream started successfully');
        } catch (err) {
            console.error('[EventStream] Failed to start event stream:', err);
            streamRef.current = null;
            setConnected(false);
            scheduleReconnect();
        } finally {
            initializingRef.current = false;
        }
    }, [isAuthenticated, tokens?.accessToken, isInitializing]);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current = null;
            setConnected(false);
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }
        initializingRef.current = false;
        setReconnecting(false);
    }, []);

    const scheduleReconnect = useCallback(() => {
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.error('[EventStream] Max reconnect attempts reached');
            setReconnecting(false);
            return;
        }

        reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);

        console.log(`[EventStream] Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);
        setReconnecting(true);

        reconnectTimeoutRef.current = setTimeout(() => {
            stopStream();
            startStream();
        }, delay);
    }, [startStream, stopStream]);

    const handleEvent = useCallback((event: any) => {
        try {
            if (event.event_id) {
                sendAck(event.event_id);
            }

            const payload = event.payload;
            if (!payload) return;

            if (payload.message_created) {
                const msg = mapMessage(payload.message_created.message);
                addMessage(msg.roomId, msg);
            }
            else if (payload.message_edited) {
                const msg = mapMessage(payload.message_edited.message);
                updateMessage(msg.roomId, msg.id, msg.content);
            }
            else if (payload.message_deleted) {
                const { room_id, message_id } = payload.message_deleted;
                deleteMessage(room_id, message_id);
            }
            else if (payload.member_joined) {
                const member = mapMember(payload.member_joined.member);
                refreshRoomMembers(member.roomId);
            }
            else if (payload.member_removed) {
                const { room_id } = payload.member_removed;
                refreshRoomMembers(room_id);
            }
            else if (payload.voice_state_changed) {
                const { room_id, user_id, muted, video_enabled, speaking } = payload.voice_state_changed;
                window.dispatchEvent(new CustomEvent('voice-state', {
                    detail: { room_id, user_id, muted, video_enabled, speaking }
                }));
            }
            else if (payload.role_changed) {
                const { room_id } = payload.role_changed;
                refreshRoomMembers(room_id);
            }
        } catch (err) {
            console.error('[EventStream] Failed to handle event:', err);
        }
    }, [addMessage, updateMessage, deleteMessage, sendAck]);

    const refreshRoomMembers = useCallback(async (roomId: string) => {
        try {
            const res = await window.concord.getMembers(roomId);
            const members: Member[] = (res?.members || []).map(mapMember);
            setMembers(roomId, members);
        } catch (err) {
            console.error('[EventStream] Failed to refresh members:', err);
        }
    }, [setMembers]);

    useEffect(() => {
        if (isAuthenticated && tokens?.accessToken && !isInitializing) {
            const timer = setTimeout(() => {
                startStream();
            }, 1000);
            return () => clearTimeout(timer);
        } else {
            stopStream();
        }
    }, [isAuthenticated, tokens?.accessToken, isInitializing, startStream, stopStream]);

    useEffect(() => {
        const handleStreamEvent = (event: any) => handleEvent(event);
        const handleStreamError = () => {
            console.error('[EventStream] Stream error received');
            setConnected(false);
            scheduleReconnect();
        };
        const handleStreamEnd = () => {
            console.log('[EventStream] Stream ended');
            setConnected(false);
            streamRef.current = null;
            scheduleReconnect();
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('stream:event' as any, handleStreamEvent);
            window.addEventListener('stream:error' as any, handleStreamError);
            window.addEventListener('stream:end' as any, handleStreamEnd);

            return () => {
                window.removeEventListener('stream:event' as any, handleStreamEvent);
                window.removeEventListener('stream:error' as any, handleStreamError);
                window.removeEventListener('stream:end' as any, handleStreamEnd);
            };
        }
    }, [handleEvent, scheduleReconnect]);

    return {
        connected,
        reconnecting,
    };
};