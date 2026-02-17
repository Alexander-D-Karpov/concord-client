import React, { useEffect } from 'react';
import { useDMCallStore } from '../hooks/useDMCallStore';
import { useNavigate } from 'react-router-dom';
import { useDMStore } from '../hooks/useDMStore';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useNotificationStore } from '../hooks/useNotificationStore';
import { useUsersStore } from '../hooks/useUsersStore';

const IncomingCallOverlay: React.FC = () => {
    const { incomingCall, joinCall, declineCall } = useDMCallStore();
    const navigate = useNavigate();
    const { setCurrentChannel } = useDMStore();
    const { setCurrentRoom } = useRoomsStore();
    const { playSound } = useNotificationStore();
    const { getUser, fetchUser } = useUsersStore();

    const callerId = incomingCall?.callerId;
    const callerUser = callerId ? getUser(callerId) : null;

    useEffect(() => {
        if (incomingCall) {
            playSound('call');
            const interval = setInterval(() => playSound('call'), 3000);
            return () => clearInterval(interval);
        }
    }, [incomingCall, playSound]);

    useEffect(() => {
        if (callerId && !callerUser) {
            fetchUser(callerId);
        }
    }, [callerId, callerUser, fetchUser]);

    useEffect(() => {
        if (!incomingCall) return;
        const timeout = setTimeout(() => {
            declineCall();
        }, 45_000);
        return () => clearTimeout(timeout);
    }, [incomingCall, declineCall]);

    if (!incomingCall) return null;

    const displayName = callerUser?.displayName || callerUser?.handle || incomingCall.callerName || 'Unknown';
    const avatarUrl = callerUser?.avatarUrl;
    const initial = displayName[0]?.toUpperCase() || '?';

    const handleAccept = async (audioOnly: boolean) => {
        const channelId = incomingCall.channelId;

        setCurrentRoom(null);
        setCurrentChannel(channelId);
        navigate('/');

        await joinCall(channelId, audioOnly);
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-dark-800 border border-dark-600 rounded-2xl shadow-2xl p-8 flex flex-col items-center space-y-6 animate-scale-in max-w-sm w-full">

                <div className="flex flex-col items-center">
                    <div className="relative mb-4">
                        <div className="w-24 h-24 bg-dark-700 rounded-full flex items-center justify-center animate-pulse ring-4 ring-dark-600 overflow-hidden">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-4xl text-white font-bold">{initial}</span>
                            )}
                        </div>
                        <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-green-500 rounded-full border-4 border-dark-800 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </div>
                    </div>
                    <h2 className="text-2xl font-bold text-white text-center break-words max-w-full">
                        {displayName}
                    </h2>
                    <p className="text-dark-400">Incoming call...</p>
                </div>

                <div className="flex items-center space-x-6 w-full justify-center">
                    <div className="flex flex-col items-center space-y-2">
                        <button
                            onClick={declineCall}
                            className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full transition shadow-lg flex items-center justify-center transform hover:scale-110"
                            title="Decline"
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                        <span className="text-xs text-dark-400">Decline</span>
                    </div>

                    <div className="flex flex-col items-center space-y-2">
                        <button
                            onClick={() => handleAccept(true)}
                            className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full transition shadow-lg flex items-center justify-center transform hover:scale-110"
                            title="Accept Audio"
                        >
                            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                        </button>
                        <span className="text-xs text-dark-400">Audio</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default IncomingCallOverlay;