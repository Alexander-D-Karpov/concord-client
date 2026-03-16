import React, { useEffect } from 'react';
import { useDMStore } from '../hooks/useDMStore';
import UnreadBadge from './UnreadBadge';
import { useNotificationStore } from '../hooks/useNotificationStore';
import Avatar from "@/components/Avatar";

interface DMListProps {
    onSelectDM?: (channelId: string) => void;
}

const DMList: React.FC<DMListProps> = ({ onSelectDM }) => {
    const { channels, currentChannelId, setCurrentChannel, loadChannels, loading } = useDMStore();
    const { unread, clearUnread } = useNotificationStore();

    useEffect(() => {
        loadChannels();
    }, [loadChannels]);

    const handleSelectChannel = (channelId: string) => {
        setCurrentChannel(channelId);
        onSelectDM?.(channelId);
    };

    const getDisplayName = (ch: typeof channels[0]) => {
        return ch.otherUserDisplay || ch.otherUserHandle || 'Unknown User';
    };

    if (loading && channels.length === 0) {
        return (
            <div className="p-4 text-center text-gray-400 dark:text-dark-400">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
        );
    }

    if (channels.length === 0) {
        return (
            <div className="p-4 text-center text-gray-400 dark:text-dark-400 text-sm">
                No conversations yet
            </div>
        );
    }

    return (
        <div className="space-y-1">
            {channels.map((ch) => (
                <button
                    key={ch.channel.id}
                    onClick={() => {
                        handleSelectChannel(ch.channel.id);
                        clearUnread('dm', ch.channel.id);
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-left transition flex items-center space-x-3 ${
                        currentChannelId === ch.channel.id
                            ? 'bg-primary-600 text-white'
                            : 'text-gray-700 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-700 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                    <Avatar
                        userId={ch.otherUserId}
                        src={ch.otherUserAvatar}
                        name={getDisplayName(ch)}
                        size="sm"
                        status={ch.otherUserStatus}
                        showStatus
                    />
                    <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-medium">
                            {getDisplayName(ch)}
                        </div>
                    </div>
                    <UnreadBadge count={unread.dms[ch.channel.id] || 0} />
                </button>
            ))}
        </div>
    );
};

export default DMList;