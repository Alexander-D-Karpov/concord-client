import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriendsStore } from '../hooks/useFriendsStore';
import { useDMStore } from '../hooks/useDMStore';
import useAuthStore from '../hooks/useAuthStore';
import Avatar from './Avatar';
import ConfirmModal from './ConfirmModal';
import { MessageListSkeleton, FriendCardSkeleton } from './LoadingSkeleton';
import { MoreVertIcon, MessageIcon } from './icons';
import {Friend, FriendRequest} from "@/utils/types";

type Tab = 'all' | 'pending' | 'blocked' | 'add';

const FriendsList: React.FC = () => {
    const {
        friends, incomingRequests, outgoingRequests, blockedUsers, loading, error,
        loadFriends, loadPendingRequests, loadBlockedUsers,
        acceptRequest, rejectRequest, cancelRequest, removeFriend,
        sendRequest, blockUser, unblockUser,
    } = useFriendsStore();

    const { getOrCreateDM, setCurrentChannel } = useDMStore();
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [addFriendHandle, setAddFriendHandle] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [confirmAction, setConfirmAction] = useState<{
        title: string; message: string; confirmLabel: string; danger: boolean; onConfirm: () => void;
    } | null>(null);

    useEffect(() => { loadFriends(); loadPendingRequests(); }, [loadFriends, loadPendingRequests]);
    useEffect(() => { if (activeTab === 'blocked') loadBlockedUsers(); }, [activeTab, loadBlockedUsers]);

    const handleOpenDM = async (userId: string) => {
        try {
            const channel = await getOrCreateDM(userId);
            if (channel) { setCurrentChannel(channel.id); navigate('/'); }
        } catch {}
    };

    const withAction = async (id: string, fn: () => Promise<void>) => {
        setActionLoading(id);
        try { await fn(); } catch {} finally { setActionLoading(null); }
    };

    const handleRemoveFriend = (userId: string, name: string) => {
        setConfirmAction({
            title: 'Remove Friend',
            message: `Are you sure you want to remove ${name} from your friends?`,
            confirmLabel: 'Remove', danger: true,
            onConfirm: () => { setConfirmAction(null); withAction(userId, () => removeFriend(userId)); },
        });
    };

    const handleBlockUser = (userId: string, name: string) => {
        setConfirmAction({
            title: 'Block User',
            message: `Are you sure you want to block ${name}? They won't be able to message you.`,
            confirmLabel: 'Block', danger: true,
            onConfirm: () => { setConfirmAction(null); withAction(userId, () => blockUser(userId)); },
        });
    };

    const handleAddFriend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!addFriendHandle.trim()) return;
        setActionLoading('add-friend');
        try {
            const userInfo = await window.concord.getUserByHandle(addFriendHandle.trim());
            await sendRequest(userInfo.id);
            setAddFriendHandle('');
            setActiveTab('pending');
        } catch (err: any) {
            alert(err?.message || 'Failed to send friend request');
        } finally {
            setActionLoading(null);
        }
    };

    const filteredFriends = friends.filter((f) =>
        f.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        f.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const pendingCount = incomingRequests.length + outgoingRequests.length;

    const tabs: { key: Tab; label: string; count?: number; activeColor?: string }[] = [
        { key: 'all', label: 'All', count: friends.length },
        { key: 'pending', label: 'Pending', count: pendingCount > 0 ? pendingCount : undefined },
        { key: 'blocked', label: 'Blocked', count: blockedUsers.length },
        { key: 'add', label: 'Add Friend', activeColor: 'bg-green-600 text-gray-900 dark:text-white' },
    ];

    return (
        <div className="flex flex-col h-screen bg-white dark:bg-dark-900 w-full max-w-4xl mx-auto">
            <div className="p-4 border-b border-gray-200 dark:border-dark-700">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Friends</h1>

                <div className="flex space-x-2 mb-4 overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition relative ${
                                activeTab === tab.key
                                    ? (tab.activeColor || 'bg-primary-600 text-gray-900 dark:text-white')
                                    : 'bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-dark-300 hover:bg-gray-200 dark:hover:bg-dark-700'
                            }`}
                        >
                            {tab.label}
                            {tab.count !== undefined && tab.count > 0 && (
                                <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${
                                    activeTab === tab.key ? 'bg-white/20 text-gray-900 dark:text-white' : 'bg-gray-300 dark:bg-dark-600 text-gray-600 dark:text-dark-300'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {activeTab === 'all' && (
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search friends..."
                        className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="p-4 bg-red-500/10 border border-red-500 text-red-500 rounded-lg mb-4">{error}</div>
                )}

                {loading && (
                    <div className="space-y-2">
                        {Array.from({ length: 4 }).map((_, i) => <FriendCardSkeleton key={i} />)}
                    </div>
                )}

                {!loading && activeTab === 'all' && (
                    <div className="space-y-2">
                        {filteredFriends.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 dark:text-dark-400">
                                {searchQuery ? 'No friends found' : 'No friends yet. Add some!'}
                            </div>
                        ) : (
                            filteredFriends.map((friend) => (
                                <FriendCard
                                    key={friend.userId}
                                    friend={friend}
                                    onMessage={() => handleOpenDM(friend.userId)}
                                    onRemove={() => handleRemoveFriend(friend.userId, friend.displayName)}
                                    onBlock={() => handleBlockUser(friend.userId, friend.displayName)}
                                    loading={actionLoading === friend.userId}
                                />
                            ))
                        )}
                    </div>
                )}

                {!loading && activeTab === 'pending' && (
                    <div className="space-y-6">
                        {incomingRequests.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                    Incoming Requests ({incomingRequests.length})
                                </h3>
                                <div className="space-y-2">
                                    {incomingRequests.map((req) => (
                                        <IncomingRequestCard
                                            key={req.id} request={req}
                                            onAccept={() => withAction(req.id, () => acceptRequest(req.id))}
                                            onReject={() => withAction(req.id, () => rejectRequest(req.id))}
                                            loading={actionLoading === req.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {outgoingRequests.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                    Sent Requests ({outgoingRequests.length})
                                </h3>
                                <div className="space-y-2">
                                    {outgoingRequests.map((req) => (
                                        <OutgoingRequestCard
                                            key={req.id} request={req}
                                            onCancel={() => withAction(req.id, () => cancelRequest(req.id))}
                                            loading={actionLoading === req.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                            <div className="text-center py-12 text-gray-400 dark:text-dark-400">No pending friend requests</div>
                        )}
                    </div>
                )}

                {!loading && activeTab === 'blocked' && (
                    <div className="space-y-2">
                        {blockedUsers.length === 0 ? (
                            <div className="text-center py-12 text-gray-400 dark:text-dark-400">No blocked users</div>
                        ) : (
                            blockedUsers.map((userId) => (
                                <BlockedUserCard
                                    key={userId} userId={userId}
                                    onUnblock={() => withAction(userId, () => unblockUser(userId))}
                                    loading={actionLoading === userId}
                                />
                            ))
                        )}
                    </div>
                )}

                {!loading && activeTab === 'add' && (
                    <div className="max-w-md mx-auto">
                        <form onSubmit={handleAddFriend} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">Friend's Handle</label>
                                <input
                                    type="text" value={addFriendHandle}
                                    onChange={(e) => setAddFriendHandle(e.target.value)}
                                    placeholder="username"
                                    className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-800 border border-gray-200 dark:border-dark-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    disabled={actionLoading === 'add-friend'}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!addFriendHandle.trim() || actionLoading === 'add-friend'}
                                className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-300 dark:disabled:bg-dark-600 disabled:cursor-not-allowed text-gray-900 dark:text-white font-semibold rounded-lg transition"
                            >
                                {actionLoading === 'add-friend' ? 'Sending...' : 'Send Friend Request'}
                            </button>
                        </form>
                    </div>
                )}
            </div>

            {confirmAction && (
                <ConfirmModal
                    title={confirmAction.title}
                    message={confirmAction.message}
                    confirmLabel={confirmAction.confirmLabel}
                    danger={confirmAction.danger}
                    onConfirm={confirmAction.onConfirm}
                    onCancel={() => setConfirmAction(null)}
                />
            )}
        </div>
    );
};

const FriendCard: React.FC<{
    friend: Friend; onMessage: () => void; onRemove: () => void; onBlock: () => void; loading: boolean;
}> = ({ friend, onMessage, onRemove, onBlock, loading }) => {
    const [showMenu, setShowMenu] = useState(false);

    return (
        <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-800 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-700 transition">
            <button onClick={onMessage} className="flex items-center space-x-3 flex-1 text-left">
                <Avatar userId={friend.userId} src={friend.avatarUrl} size="md" status={friend.status} showStatus />
                <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{friend.displayName}</div>
                    <div className="text-sm text-gray-500 dark:text-dark-400">@{friend.handle}</div>
                </div>
            </button>
            <div className="flex items-center space-x-2">
                <button onClick={onMessage} className="p-2 text-gray-400 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-200 dark:hover:bg-dark-600 rounded-lg transition" title="Send Message">
                    <MessageIcon size="md" />
                </button>
                <div className="relative">
                    <button onClick={() => setShowMenu(!showMenu)} className="p-2 text-gray-400 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white transition" disabled={loading}>
                        <MoreVertIcon size="md" />
                    </button>
                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                            <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg shadow-lg z-20">
                                <button onClick={() => { onRemove(); setShowMenu(false); }} className="w-full px-4 py-2 text-left text-red-500 hover:bg-gray-100 dark:hover:bg-dark-600 transition rounded-t-lg">
                                    Remove Friend
                                </button>
                                <button onClick={() => { onBlock(); setShowMenu(false); }} className="w-full px-4 py-2 text-left text-red-500 hover:bg-gray-100 dark:hover:bg-dark-600 transition rounded-b-lg">
                                    Block User
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

const IncomingRequestCard: React.FC<{
    request: FriendRequest; onAccept: () => void; onReject: () => void; loading: boolean;
}> = ({ request, onAccept, onReject, loading }) => (
    <div className="p-4 bg-gray-50 dark:bg-dark-800 rounded-lg">
        <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-3">
                <Avatar name={request.fromDisplayName} src={request.fromAvatarUrl} size="md" showStatus={false} />
                <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{request.fromDisplayName}</div>
                    <div className="text-sm text-gray-500 dark:text-dark-400">@{request.fromHandle}</div>
                </div>
            </div>
            <div className="text-xs text-gray-400 dark:text-dark-500">{new Date(request.createdAt).toLocaleDateString()}</div>
        </div>
        <div className="flex space-x-2">
            <button onClick={onAccept} disabled={loading} className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-gray-900 dark:text-white font-semibold rounded-lg transition">
                {loading ? 'Processing...' : 'Accept'}
            </button>
            <button onClick={onReject} disabled={loading} className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-gray-900 dark:text-white font-semibold rounded-lg transition">
                Reject
            </button>
        </div>
    </div>
);

const OutgoingRequestCard: React.FC<{
    request: FriendRequest; onCancel: () => void; loading: boolean;
}> = ({ request, onCancel, loading }) => (
    <div className="p-4 bg-gray-50 dark:bg-dark-800 rounded-lg">
        <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <Avatar name={request.toDisplayName} src={request.toAvatarUrl} size="md" showStatus={false} />
                <div>
                    <div className="font-semibold text-gray-900 dark:text-white">{request.toDisplayName}</div>
                    <div className="text-sm text-gray-500 dark:text-dark-400">@{request.toHandle}</div>
                </div>
            </div>
            <button onClick={onCancel} disabled={loading} className="px-4 py-2 bg-gray-200 dark:bg-dark-700 hover:bg-gray-300 dark:hover:bg-dark-600 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg transition">
                Cancel
            </button>
        </div>
    </div>
);

const BlockedUserCard: React.FC<{
    userId: string; onUnblock: () => void; loading: boolean;
}> = ({ userId, onUnblock, loading }) => (
    <div className="p-4 bg-gray-50 dark:bg-dark-800 rounded-lg flex items-center justify-between">
        <div className="flex items-center space-x-3">
            <Avatar name={userId} size="md" showStatus={false} />
            <div className="text-gray-500 dark:text-dark-400">{userId}</div>
        </div>
        <button onClick={onUnblock} disabled={loading} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-gray-900 dark:text-white rounded-lg transition">
            Unblock
        </button>
    </div>
);

export default FriendsList;