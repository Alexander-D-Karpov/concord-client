import React from 'react';
import { Message } from '../../utils/types';
import { PinIcon } from '../icons';

interface PinnedBannerProps {
    pinnedMessages: Message[];
}

const PinnedBanner: React.FC<PinnedBannerProps> = ({ pinnedMessages }) => {
    if (pinnedMessages.length === 0) return null;

    return (
        <div className="bg-primary-900/10 border-b border-primary-600 p-3 flex-shrink-0">
            <div className="flex items-start space-x-2">
                <PinIcon size="md" className="text-primary-400 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-primary-300 mb-1">
                        {pinnedMessages.length} Pinned Message{pinnedMessages.length !== 1 && 's'}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-dark-300 truncate">{pinnedMessages[0].content}</div>
                </div>
            </div>
        </div>
    );
};

export default PinnedBanner;