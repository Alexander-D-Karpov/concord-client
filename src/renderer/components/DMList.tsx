import React, { useEffect } from 'react';
import { useDMStore } from '../hooks/useDMStore';
import UnreadBadge from './UnreadBadge';
import { useNotificationStore } from '../hooks/useNotificationStore';

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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online': return 'bg-green-500';
            case 'idle': return 'bg-yellow-500';
            case 'dnd': return 'bg-red-500';
            default: return 'bg-dark-500';
        }
    };

    const getDisplayName = (ch: typeof channels[0]) => {
        return ch.otherUserDisplay || ch.otherUserHandle || 'Unknown User';
    };

    const getInitial = (ch: typeof channels[0]) => {
        const name = getDisplayName(ch);
        return name.charAt(0).toUpperCase();
    };

    if (loading && channels.length === 0) {
        return (
            <div className="p-4 text-center text-dark-400">
                <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
        );
    }

    if (channels.length === 0) {
        return (
            <div className="p-4 text-center text-dark-400 text-sm">
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
                            : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                    }`}
                >
                    <div className="relative flex-shrink-0">
                        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center">
                            <span className="text-white font-semibold text-xs">
                                {getInitial(ch)}
                            </span>
                        </div>
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 ${
                            currentChannelId === ch.channel.id ? 'border-primary-600' : 'border-dark-800'
                        } ${getStatusColor(ch.otherUserStatus)}`} />
                    </div>
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