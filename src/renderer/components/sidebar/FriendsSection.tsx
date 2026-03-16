import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Friend } from '../../utils/types';
import Avatar from '../Avatar';
import { UsersIcon, UserPlusIcon } from '../icons';

interface FriendsSectionProps {
    friends: Friend[];
    incomingRequestCount: number;
    onOpenDM: (userId: string) => void;
    onShowAddFriend: () => void;
}

const FriendsSection: React.FC<FriendsSectionProps> = ({
                                                           friends,
                                                           incomingRequestCount,
                                                           onOpenDM,
                                                           onShowAddFriend,
                                                       }) => {
    const navigate = useNavigate();

    return (
        <div className="p-2">
            <div className="flex items-center justify-between px-2 py-2">
                <div className="flex items-center space-x-2">
                    <h2 className="text-gray-900 dark:text-white font-semibold text-xs uppercase tracking-wider">Friends</h2>
                    {incomingRequestCount > 0 && (
                        <span className="px-1.5 py-0.5 text-xs bg-red-500 text-gray-900 dark:text-white rounded-full">
                            {incomingRequestCount}
                        </span>
                    )}
                </div>
                <div className="flex items-center space-x-1">
                    <button
                        onClick={() => navigate('/friends')}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded transition"
                        title="View All Friends"
                    >
                        <UsersIcon size="sm" className="text-gray-400 dark:text-dark-400" />
                    </button>
                    <button
                        onClick={onShowAddFriend}
                        className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded transition"
                        title="Add Friend"
                    >
                        <UserPlusIcon size="sm" className="text-gray-400 dark:text-dark-400" />
                    </button>
                </div>
            </div>

            {incomingRequestCount > 0 && (
                <button
                    onClick={() => navigate('/friends')}
                    className="w-full mb-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-left hover:bg-yellow-500/20 transition"
                >
                    <div className="flex items-center space-x-2">
                        <UserPlusIcon size="md" className="text-yellow-500" />
                        <span className="text-sm text-yellow-500 font-medium">
                            {incomingRequestCount} pending request{incomingRequestCount !== 1 ? 's' : ''}
                        </span>
                    </div>
                </button>
            )}

            {friends.length === 0 ? (
                <div className="px-3 py-2 text-center text-gray-400 dark:text-dark-400 text-xs">
                    No friends yet
                </div>
            ) : (
                <div className="space-y-1">
                    {friends.slice(0, 5).map((friend) => (
                        <button
                            key={friend.userId}
                            onClick={() => onOpenDM(friend.userId)}
                            className="w-full px-3 py-2 rounded-lg text-left transition hover:bg-gray-100 dark:hover:bg-dark-700 flex items-center space-x-2"
                        >
                            <Avatar
                                userId={friend.userId}
                                src={friend.avatarUrl}
                                name={friend.displayName || friend.handle}
                                size="sm"
                                status={friend.status}
                                showStatus
                            />
                            <span className="truncate text-sm text-gray-900 dark:text-white">
                                {friend.displayName || friend.handle}
                            </span>
                        </button>
                    ))}
                    {friends.length > 5 && (
                        <button
                            onClick={() => navigate('/friends')}
                            className="w-full px-3 py-2 text-center text-primary-400 hover:text-primary-300 text-xs transition"
                        >
                            View all {friends.length} friends
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

export default FriendsSection;