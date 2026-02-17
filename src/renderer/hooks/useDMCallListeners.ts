import { useEffect } from 'react';
import { useDMCallStore } from './useDMCallStore';
import { useAuthStore } from './useAuthStore';

export function useDMCallListeners() {
    const userId = useAuthStore(s => s.user?.id);

    useEffect(() => {
        if (!userId) return;

        const handleCallStarted = (e: CustomEvent) => {
            const { channel_id, caller_id, caller_name } = e.detail;

            if (caller_id === userId) return;

            const state = useDMCallStore.getState();
            if (state.active && state.channelId === channel_id) return;

            state.setIncomingCall({
                channelId: channel_id,
                callerName: caller_name || 'Someone',
                callerId: caller_id,
            });
        };

        const handleCallEnded = (e: CustomEvent) => {
            const { channel_id } = e.detail;
            const state = useDMCallStore.getState();

            // If we are in this call, reset it immediately.
            if (state.channelId === channel_id) {
                state.reset();
                window.concord.leaveVoice(channel_id).catch(() => {});
            }

            if (state.incomingCall?.channelId === channel_id) {
                state.setIncomingCall(null);
            }
        };

        const handleVoiceUserJoined = (e: CustomEvent) => {
            const { room_id, user_id } = e.detail;
            if (user_id === userId) return;

            const state = useDMCallStore.getState();
            if (state.channelId === room_id && state.outgoingCall) {
                state.promoteToActive();
            }
        };

        const handleVoiceUserLeft = (e: CustomEvent) => {
            const { room_id, user_id } = e.detail;
            if (user_id === userId) return;

            const state = useDMCallStore.getState();
            if (state.channelId === room_id) {
                // If the other user left, update participants list immediately
                const updatedParticipants = state.participants.filter(p => p.userId !== user_id);
                state.updateParticipants(updatedParticipants);

                // If it was ringing (outgoing) and they left (rejected/ended), cancel
                if (state.outgoingCall) {
                    state.cancelOutgoing();
                }
            }
        };

        const handleVoiceDisconnected = () => {
            useDMCallStore.getState().setVoiceConnected(false);
        };

        window.addEventListener('dm-call-started' as any, handleCallStarted);
        window.addEventListener('dm-call-ended' as any, handleCallEnded);
        window.addEventListener('voice-user-joined' as any, handleVoiceUserJoined);
        window.addEventListener('voice-user-left' as any, handleVoiceUserLeft);
        const unsub = window.concord.onVoiceDisconnected?.(handleVoiceDisconnected);

        return () => {
            window.removeEventListener('dm-call-started' as any, handleCallStarted);
            window.removeEventListener('dm-call-ended' as any, handleCallEnded);
            window.removeEventListener('voice-user-joined' as any, handleVoiceUserJoined);
            window.removeEventListener('voice-user-left' as any, handleVoiceUserLeft);
            unsub?.();
        };
    }, [userId]);
}