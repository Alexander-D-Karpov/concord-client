import { useEffect, useRef, useCallback } from 'react';
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
    const { isAuthenticated, tokens } = useAuthStore();

    const streamRef = useRef<{ active: boolean } | null>(null);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
    const reconnectAttemptsRef = useRef(0);
    const maxReconnectAttempts = 5;
    const initializingRef = useRef(false);

    const startStream = useCallback(async () => {
        if (!isAuthenticated || !tokens?.accessToken || streamRef.current || initializingRef.current) {
            return;
        }

        initializingRef.current = true;

        try {
            console.log('Starting event stream...');

            await window.concord.initializeClient(tokens.accessToken);

            const result = await window.concord.startEventStream?.();

            if (!result || !result.success) {
                throw new Error('Failed to initialize stream');
            }

            streamRef.current = { active: true };
            reconnectAttemptsRef.current = 0;

            if (rooms.length > 0) {
                await window.concord.subscribeToRooms?.(rooms.map(r => r.id));
            }
        } catch (err) {
            console.error('Failed to start event stream:', err);
            scheduleReconnect();
        } finally {
            initializingRef.current = false;
        }
    }, [isAuthenticated, tokens?.accessToken, rooms]);

    const stopStream = useCallback(() => {
        if (streamRef.current) {
            streamRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = undefined;
        }
        initializingRef.current = false;
    }, []);

    const scheduleReconnect = useCallback(() => {
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
            console.error('Max reconnect attempts reached');
            return;
        }

        reconnectAttemptsRef.current++;
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);

        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current})`);

        reconnectTimeoutRef.current = setTimeout(() => {
            stopStream();
            startStream();
        }, delay);
    }, [startStream, stopStream]);

    const handleEvent = useCallback((event: any) => {
        console.log('Received event:', event.payload?.constructor?.name);

        try {
            if (event.payload?.message_created) {
                const msg = mapMessage(event.payload.message_created.message);
                addMessage(msg.roomId, msg);
            }
            else if (event.payload?.message_edited) {
                const msg = mapMessage(event.payload.message_edited.message);
                updateMessage(msg.roomId, msg.id, msg.content);
            }
            else if (event.payload?.message_deleted) {
                const { room_id, message_id } = event.payload.message_deleted;
                deleteMessage(room_id, message_id);
            }
            else if (event.payload?.member_joined) {
                const member = mapMember(event.payload.member_joined.member);
                refreshRoomMembers(member.roomId);
            }
            else if (event.payload?.member_removed) {
                const { room_id } = event.payload.member_removed;
                refreshRoomMembers(room_id);
            }
            else if (event.payload?.voice_state_changed) {
                const { room_id, user_id, muted, video_enabled, speaking } = event.payload.voice_state_changed;
                window.dispatchEvent(new CustomEvent('voice-state', {
                    detail: { room_id, user_id, muted, video_enabled, speaking }
                }));
            }
            else if (event.payload?.role_changed) {
                const { room_id } = event.payload.role_changed;
                refreshRoomMembers(room_id);
            }
        } catch (err) {
            console.error('Failed to handle event:', err);
        }
    }, [addMessage, updateMessage, deleteMessage]);

    const refreshRoomMembers = useCallback(async (roomId: string) => {
        try {
            const res = await window.concord.getMembers(roomId);
            const members: Member[] = (res?.members || []).map(mapMember);
            setMembers(roomId, members);
        } catch (err) {
            console.error('Failed to refresh members:', err);
        }
    }, [setMembers]);

    useEffect(() => {
        if (isAuthenticated && tokens?.accessToken) {
            startStream();
        } else {
            stopStream();
        }

        return () => stopStream();
    }, [isAuthenticated, tokens?.accessToken, startStream, stopStream]);

    useEffect(() => {
        if (!streamRef.current || rooms.length === 0) return;

        const roomIds = rooms.map(r => r.id);
        window.concord.subscribeToRooms?.(roomIds).catch(console.error);
    }, [rooms]);

    return {
        connected: !!streamRef.current,
        reconnecting: reconnectAttemptsRef.current > 0,
    };
};