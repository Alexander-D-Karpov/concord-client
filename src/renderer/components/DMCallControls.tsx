import React, { useEffect, useState } from 'react';
import { useDMCallStore } from '../hooks/useDMCallStore';

interface DMCallControlsProps {
    channelId: string;
    otherUserName: string;
}

const DMCallControls: React.FC<DMCallControlsProps> = ({ channelId, otherUserName }) => {
    const { active, connecting, outgoingCall, channelId: currentCallId, startCall, leaveCall, joinCall, participants } = useDMCallStore();
    const [remoteCallActive, setRemoteCallActive] = useState(false);

    const updateCallStatus = async () => {
        // Don't poll if we are actively in the call
        if (active && currentCallId === channelId) return;

        try {
            const status = await window.concord.getDMCallStatus(channelId);
            setRemoteCallActive(
                status?.active || (status?.participants && status.participants.length > 0)
            );
        } catch {
            setRemoteCallActive(false);
        }
    };

    useEffect(() => {
        if (active && currentCallId === channelId) {
            setRemoteCallActive(false);
            return;
        }

        updateCallStatus();

        const handleStarted = (e: CustomEvent) => {
            if (e.detail.channel_id === channelId) setRemoteCallActive(true);
        };

        // Listen for call ended event to immediately clear status
        const handleEnded = (e: CustomEvent) => {
            if (e.detail.channel_id === channelId) {
                setRemoteCallActive(false);
            }
        };

        const handleParticipantJoin = (e: CustomEvent) => {
            if (e.detail.room_id === channelId) setRemoteCallActive(true);
        };

        // Listen for user leaving. If participant count drops to 0 on server, call is inactive.
        const handleParticipantLeft = (e: CustomEvent) => {
            if (e.detail.room_id === channelId) {
                // Check if call is still valid on backend
                setTimeout(updateCallStatus, 200);
            }
        };

        window.addEventListener('dm-call-started' as any, handleStarted);
        window.addEventListener('dm-call-ended' as any, handleEnded);
        window.addEventListener('voice-user-joined' as any, handleParticipantJoin);
        window.addEventListener('voice-user-left' as any, handleParticipantLeft);

        return () => {
            window.removeEventListener('dm-call-started' as any, handleStarted);
            window.removeEventListener('dm-call-ended' as any, handleEnded);
            window.removeEventListener('voice-user-joined' as any, handleParticipantJoin);
            window.removeEventListener('voice-user-left' as any, handleParticipantLeft);
        };
    }, [channelId, active, currentCallId]);

    const handleStartOrJoin = async (audioOnly: boolean) => {
        try {
            if (remoteCallActive && currentCallId !== channelId) {
                await joinCall(channelId, audioOnly);
            } else {
                await startCall(channelId, audioOnly);
            }
        } catch (err) {
            console.error('Failed to call:', err);
        }
    };

    if ((connecting || outgoingCall) && currentCallId === channelId) {
        return (
            <div className="p-4 bg-dark-800 border-t border-dark-700">
                <div className="flex flex-col items-center justify-center space-y-3 py-2">
                    <div className="relative">
                        <div className="w-16 h-16 bg-dark-700 rounded-full flex items-center justify-center">
                            <span className="text-2xl text-white font-bold">{otherUserName[0]}</span>
                        </div>
                        <div className="absolute inset-0 rounded-full border-2 border-primary-500 animate-ping opacity-75"></div>
                    </div>
                    <div className="text-white font-medium">Calling {otherUserName}...</div>
                    <button
                        onClick={leaveCall}
                        className="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-full transition"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    if (active && currentCallId === channelId) {
        return (
            <div className="p-4 bg-green-900/20 border-t border-green-900/50">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                        <span className="text-green-100 font-medium">Connected</span>
                    </div>
                    <button
                        onClick={leaveCall}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition"
                    >
                        Disconnect
                    </button>
                </div>
            </div>
        );
    }

    // Only show "Call in progress" if remoteCallActive is true AND we aren't in it
    const showAsJoin = remoteCallActive && currentCallId !== channelId;

    return (
        <div className="p-4 bg-dark-800 border-t border-dark-700">
            {showAsJoin && (
                <div className="mb-3 p-2 bg-green-500/10 border border-green-500/30 rounded flex items-center justify-between">
                    <div className="flex items-center space-x-2 text-green-400">
                        <span className="relative flex h-3 w-3">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                        </span>
                        <span className="text-sm font-medium">Call in progress</span>
                    </div>
                </div>
            )}

            <div className="flex space-x-2">
                <button
                    onClick={() => handleStartOrJoin(true)}
                    className={`flex-1 px-4 py-2 ${showAsJoin ? 'bg-green-600 hover:bg-green-700' : 'bg-dark-700 hover:bg-dark-600'} text-white rounded-lg transition flex items-center justify-center space-x-2`}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>{showAsJoin ? 'Join Call' : 'Voice Call'}</span>
                </button>
                <button
                    onClick={() => handleStartOrJoin(false)}
                    className={`flex-1 px-4 py-2 ${showAsJoin ? 'bg-green-600 hover:bg-green-700' : 'bg-primary-600 hover:bg-primary-700'} text-white rounded-lg transition flex items-center justify-center space-x-2`}
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>{showAsJoin ? 'Join Video' : 'Video Call'}</span>
                </button>
            </div>
        </div>
    );
};

export default DMCallControls;