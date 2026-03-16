import React from 'react';
import VoiceControls from './VoiceControls';

interface CallPanelProps {
    roomId: string;
    isDM?: boolean;
    onCollapse?: () => void;
}

const CallPanel: React.FC<CallPanelProps> = ({
                                                 roomId,
                                                 isDM = false,
                                                 onCollapse,
                                             }) => {
    return (
        <div className="flex h-full w-full min-w-0 flex-col border-l border-gray-200 bg-white/80 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-800/90">
            <div className="flex h-14 flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 dark:border-dark-700">
                <div className="min-w-0 flex items-center gap-3">
                    <div className="relative flex h-3 w-3 flex-shrink-0 items-center justify-center">
                        <span className="absolute inline-flex h-3 w-3 rounded-full bg-green-500/30 animate-ping" />
                        <span className="relative h-2.5 w-2.5 rounded-full bg-green-500" />
                    </div>

                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                            Voice Connected
                        </div>
                    </div>
                </div>

                {onCollapse && (
                    <button
                        type="button"
                        onClick={onCollapse}
                        title="Collapse panel"
                        aria-label="Collapse panel"
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500/40 dark:text-dark-400 dark:hover:bg-dark-700 dark:hover:text-white"
                    >
                        <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 5l7 7-7 7M5 5l7 7-7 7"
                            />
                        </svg>
                    </button>
                )}
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
                <VoiceControls roomId={roomId} isDM={isDM} />
            </div>
        </div>
    );
};

export default CallPanel;