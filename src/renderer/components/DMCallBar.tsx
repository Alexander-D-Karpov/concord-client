import React, { useEffect, useState } from 'react';
import { useDMCallStore } from '../hooks/useDMCallStore';

interface DMCallBarProps {
    channelId: string;
    otherUserName: string;
    onStartCall: (audioOnly: boolean) => void;
}

const DMCallBar: React.FC<DMCallBarProps> = ({ channelId, otherUserName, onStartCall }) => {
    const {
        active,
        connecting,
        outgoingCall,
        channelId: activeCallChannelId,
        leaveCall,
    } = useDMCallStore();

    const [remoteCallActive, setRemoteCallActive] = useState(false);

    const isCurrentCall = activeCallChannelId === channelId;
    const isConnectingThisCall = (connecting || outgoingCall) && isCurrentCall;
    const isActiveThisCall = active && isCurrentCall;

    useEffect(() => {
        let cancelled = false;

        const bootstrap = async () => {
            if (isActiveThisCall) {
                setRemoteCallActive(false);
                return;
            }

            try {
                const status = await window.concord.getDMCallStatus(channelId);
                if (!cancelled) {
                    setRemoteCallActive(Boolean(status?.active || status?.participants?.length > 0));
                }
            } catch {
                if (!cancelled) {
                    setRemoteCallActive(false);
                }
            }
        };

        void bootstrap();

        const handleCallStarted = ((event: Event) => {
            const detail = (event as CustomEvent<{ channel_id?: string }>).detail;
            if (detail?.channel_id === channelId) {
                setRemoteCallActive(true);
            }
        }) as EventListener;

        const handleCallEnded = ((event: Event) => {
            const detail = (event as CustomEvent<{ channel_id?: string }>).detail;
            if (detail?.channel_id === channelId) {
                setRemoteCallActive(false);
            }
        }) as EventListener;

        window.addEventListener('dm-call-started', handleCallStarted);
        window.addEventListener('dm-call-ended', handleCallEnded);

        return () => {
            cancelled = true;
            window.removeEventListener('dm-call-started', handleCallStarted);
            window.removeEventListener('dm-call-ended', handleCallEnded);
        };
    }, [channelId, isActiveThisCall]);

    if (isActiveThisCall) {
        return null;
    }

    if (isConnectingThisCall) {
        return (
            <div className="flex items-center justify-between border-t border-gray-200 bg-primary-600/10 px-4 py-2 dark:border-dark-700">
                <div className="flex items-center gap-2 min-w-0">
                    <div className="relative flex h-2.5 w-2.5 flex-shrink-0 items-center justify-center">
                        <span className="absolute h-2.5 w-2.5 rounded-full bg-primary-500/40 animate-ping" />
                        <span className="relative h-2 w-2 rounded-full bg-primary-500" />
                    </div>
                    <span className="truncate text-sm font-medium text-primary-500">
                        Calling {otherUserName}...
                    </span>
                </div>

                <button
                    type="button"
                    onClick={leaveCall}
                    className="ml-3 inline-flex h-8 items-center justify-center rounded-lg bg-red-600 px-3 text-sm font-medium text-white transition hover:bg-red-700"
                >
                    Cancel
                </button>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-end gap-2 border-t border-gray-200 bg-white/70 px-4 py-2 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-900/70">
            {remoteCallActive && (
                <div className="mr-auto flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-2.5 py-1">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    <span className="text-xs font-semibold text-green-500">Call active</span>
                </div>
            )}

            <button
                type="button"
                onClick={() => onStartCall(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:text-dark-400 dark:hover:bg-dark-700 dark:hover:text-white"
                title={`Start voice call with ${otherUserName}`}
                aria-label={`Start voice call with ${otherUserName}`}
            >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                </svg>
            </button>

            <button
                type="button"
                onClick={() => onStartCall(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:text-dark-400 dark:hover:bg-dark-700 dark:hover:text-white"
                title={`Start video call with ${otherUserName}`}
                aria-label={`Start video call with ${otherUserName}`}
            >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                </svg>
            </button>
        </div>
    );
};

export default DMCallBar;