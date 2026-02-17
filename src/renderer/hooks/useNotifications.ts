import { useCallback, useEffect } from 'react';
import { useNotificationStore } from './useNotificationStore';
import { useAuthStore } from './useAuthStore';
import { useRoomsStore } from './useRoomsStore';
import { useDMStore } from './useDMStore';

export function useNotifications() {
    const { user } = useAuthStore();
    const { currentRoomId } = useRoomsStore();
    const { currentChannelId } = useDMStore();
    const {
        settings,
        showToast,
        playSound,
        sendNativeNotification,
        addUnread,
        isMuted
    } = useNotificationStore();

    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, []);

    const notifyDM = useCallback((dm: {
        channelId: string;
        authorId: string;
        authorName: string;
        content: string;
    }) => {
        if (!settings.enabled) return;
        if (dm.authorId === user?.id) return;
        if (isMuted(dm.channelId)) return;

        const isFocused = document.hasFocus();
        const isCurrentChannel = currentChannelId === dm.channelId;

        // Add unread if we aren't looking at this specific channel
        if (!isFocused || !isCurrentChannel) {
            addUnread('dm', dm.channelId);
        }

        // Show toast if allowed
        if (settings.dmToast && (!isFocused || !isCurrentChannel)) {
            showToast({
                type: 'dm',
                title: dm.authorName,
                body: dm.content,
                avatarInitial: dm.authorName[0],
                channelId: dm.channelId,
            });
        }

        if (settings.dmSound) {
            playSound('dm');
        }

        // Native Notification: ONLY if window is NOT active
        if (settings.dmNative && !isFocused) {
            sendNativeNotification(dm.authorName, dm.content);
        }
    }, [settings, user, currentChannelId, showToast, playSound, sendNativeNotification, addUnread, isMuted]);

    const notifyMessage = useCallback((message: {
        roomId: string;
        roomName: string;
        authorId: string;
        authorName: string;
        content: string;
        mentions?: string[];
    }) => {
        if (!settings.enabled) return;
        if (message.authorId === user?.id) return;
        if (isMuted(message.roomId)) return;

        const isFocused = document.hasFocus();
        const isCurrentRoom = currentRoomId === message.roomId;
        const isMention = message.mentions?.includes(user?.id || '');

        if (isFocused && isCurrentRoom && !isMention) {
            return;
        }

        if (settings.mentionsOnly && !isMention) {
            if (!isFocused || !isCurrentRoom) addUnread('room', message.roomId);
            return;
        }

        if (!isFocused || !isCurrentRoom) {
            addUnread('room', message.roomId);
        }

        const type = isMention ? 'mention' : 'message';
        const title = isMention
            ? `${message.authorName} mentioned you in #${message.roomName}`
            : `#${message.roomName}`;
        const body = isMention
            ? message.content
            : `${message.authorName}: ${message.content}`;

        if (settings.toast && (!isFocused || !isCurrentRoom)) {
            showToast({
                type,
                title,
                body,
                avatarInitial: message.authorName[0],
                roomId: message.roomId,
            });
        }

        if (settings.sound && (!isFocused || !isCurrentRoom)) {
            playSound(type);
        }

        if (settings.native && !isFocused) {
            sendNativeNotification(title, body);
        }
    }, [settings, user, currentRoomId, showToast, playSound, sendNativeNotification, addUnread, isMuted]);

    const notifyFriendRequest = useCallback((request: { fromUserId: string; fromName: string }) => {
        if (!settings.enabled) return;
        showToast({ type: 'friend_request', title: 'Friend Request', body: `${request.fromName} sent you a friend request`, avatarInitial: request.fromName[0], userId: request.fromUserId });
        if(settings.sound) playSound('message');
        if (!document.hasFocus() && settings.native) sendNativeNotification('Friend Request', `${request.fromName} sent you a friend request`);
    }, [settings, showToast, playSound, sendNativeNotification]);

    const notifyCall = useCallback((call: { channelId: string; callerName: string }) => {
        if (!settings.enabled) return;
        showToast({ type: 'call', title: 'Incoming Call', body: `${call.callerName} is calling you`, avatarInitial: call.callerName[0], channelId: call.channelId });
        if(settings.sound) playSound('call');
        if (!document.hasFocus() && settings.native) sendNativeNotification('Incoming Call', `${call.callerName} is calling you`);
    }, [settings, showToast, playSound, sendNativeNotification]);

    return { notifyMessage, notifyDM, notifyFriendRequest, notifyCall };
}