import React from 'react';
import Avatar from '../Avatar';

interface DMChatHeaderProps {
    otherUserId: string;
    displayName: string;
    handle: string;
    avatarUrl?: string;
    status?: string;
}

const DMChatHeader: React.FC<DMChatHeaderProps> = ({
                                                       otherUserId,
                                                       displayName,
                                                       handle,
                                                       status,
                                                   }) => {
    return (
        <div className="h-14 flex-shrink-0 border-b border-gray-200 bg-white/80 px-4 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-900/80">
            <div className="flex h-full items-center gap-3">
                <Avatar
                    userId={otherUserId}
                    name={displayName}
                    size="sm"
                    status={status}
                    showStatus
                />

                <div className="min-w-0">
                    <h2 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {displayName}
                    </h2>
                    <p className="truncate text-xs text-gray-500 dark:text-dark-400">
                        @{handle}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default DMChatHeader;