import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useFriendsStore } from '../hooks/useFriendsStore';
import { useDMStore } from '../hooks/useDMStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { Friend, FriendRequest } from '../types';

type Tab = 'all' | 'pending' | 'blocked' | 'add';

const FriendsList: React.FC = () => {
    const {
        friends,
        incomingRequests,
        outgoingRequests,
        blockedUsers,
        loading,
        error,
        loadFriends,
        loadPendingRequests,
        loadBlockedUsers,
        acceptRequest,
        rejectRequest,
        cancelRequest,
        removeFriend,
        sendRequest,
        blockUser,
        unblockUser,
    } = useFriendsStore();

    const { getOrCreateDM, setCurrentChannel } = useDMStore();
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<Tab>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [addFriendHandle, setAddFriendHandle] = useState('');
    const [actionLoading, setActionLoading] = useState<string | null>(null);

    useEffect(() => {
        loadFriends();
        loadPendingRequests();
    }, [loadFriends, loadPendingRequests]);

    useEffect(() => {
        if (activeTab === 'blocked') {
            loadBlockedUsers();
        }
    }, [activeTab, loadBlockedUsers]);

    const handleOpenDM = async (userId: string) => {
        try {
            const channel = await getOrCreateDM(userId);
            if (channel) {
                setCurrentChannel(channel.id);
                navigate('/');
            }
        } catch (err) {
            console.error('Failed to open DM:', err);
        }
    };

    const handleAcceptRequest = async (requestId: string) => {
        setActionLoading(requestId);
        try {
            await acceptRequest(requestId);
        } catch (err) {
            console.error('Failed to accept request:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRejectRequest = async (requestId: string) => {
        setActionLoading(requestId);
        try {
            await rejectRequest(requestId);
        } catch (err) {
            console.error('Failed to reject request:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleCancelRequest = async (requestId: string) => {
        setActionLoading(requestId);
        try {
            await cancelRequest(requestId);
        } catch (err) {
            console.error('Failed to cancel request:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleRemoveFriend = async (userId: string) => {
        if (!confirm('Are you sure you want to remove this friend?')) return;
        setActionLoading(userId);
        try {
            await removeFriend(userId);
        } catch (err) {
            console.error('Failed to remove friend:', err);
        } finally {
            setActionLoading(null);
        }
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

    const handleBlockUser = async (userId: string) => {
        if (!confirm('Are you sure you want to block this user?')) return;
        setActionLoading(userId);
        try {
            await blockUser(userId);
        } catch (err) {
            console.error('Failed to block user:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const handleUnblockUser = async (userId: string) => {
        setActionLoading(userId);
        try {
            await unblockUser(userId);
        } catch (err) {
            console.error('Failed to unblock user:', err);
        } finally {
            setActionLoading(null);
        }
    };

    const filteredFriends = friends.filter((friend) =>
        friend.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        friend.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const pendingCount = incomingRequests.length + outgoingRequests.length;

    return (
        <div className="flex flex-col h-screen bg-dark-900 w-full max-w-4xl mx-auto">
            <div className="p-4 border-b border-dark-700">
                <h1 className="text-2xl font-bold text-white mb-4">Friends</h1>

                <div className="flex space-x-2 mb-4 overflow-x-auto">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                            activeTab === 'all'
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                        }`}
                    >
                        All ({friends.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition relative ${
                            activeTab === 'pending'
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                        }`}
                    >
                        Pending
                        {pendingCount > 0 && (
                            <span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
                                {pendingCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('blocked')}
                        className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                            activeTab === 'blocked'
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                        }`}
                    >
                        Blocked ({blockedUsers.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('add')}
                        className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition ${
                            activeTab === 'add'
                                ? 'bg-green-600 text-white'
                                : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
                        }`}
                    >
                        Add Friend
                    </button>
                </div>

                {activeTab === 'all' && (
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search friends..."
                        className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
                {error && (
                    <div className="p-4 bg-red-500 bg-opacity-10 border border-red-500 text-red-500 rounded-lg mb-4">
                        {error}
                    </div>
                )}

                {loading && (
                    <div className="flex justify-center py-8">
                        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}

                {!loading && activeTab === 'all' && (
                    <div className="space-y-2">
                        {filteredFriends.length === 0 ? (
                            <div className="text-center py-12 text-dark-400">
                                {searchQuery ? 'No friends found' : 'No friends yet. Add some!'}
                            </div>
                        ) : (
                            filteredFriends.map((friend) => (
                                <FriendCard
                                    key={friend.userId}
                                    friend={friend}
                                    onMessage={() => handleOpenDM(friend.userId)}
                                    onRemove={() => handleRemoveFriend(friend.userId)}
                                    onBlock={() => handleBlockUser(friend.userId)}
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
                                <h3 className="text-lg font-semibold text-white mb-3">
                                    Incoming Requests ({incomingRequests.length})
                                </h3>
                                <div className="space-y-2">
                                    {incomingRequests.map((request) => (
                                        <IncomingRequestCard
                                            key={request.id}
                                            request={request}
                                            onAccept={() => handleAcceptRequest(request.id)}
                                            onReject={() => handleRejectRequest(request.id)}
                                            loading={actionLoading === request.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {outgoingRequests.length > 0 && (
                            <div>
                                <h3 className="text-lg font-semibold text-white mb-3">
                                    Sent Requests ({outgoingRequests.length})
                                </h3>
                                <div className="space-y-2">
                                    {outgoingRequests.map((request) => (
                                        <OutgoingRequestCard
                                            key={request.id}
                                            request={request}
                                            onCancel={() => handleCancelRequest(request.id)}
                                            loading={actionLoading === request.id}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}

                        {incomingRequests.length === 0 && outgoingRequests.length === 0 && (
                            <div className="text-center py-12 text-dark-400">
                                No pending friend requests
                            </div>
                        )}
                    </div>
                )}

                {!loading && activeTab === 'blocked' && (
                    <div className="space-y-2">
                        {blockedUsers.length === 0 ? (
                            <div className="text-center py-12 text-dark-400">
                                No blocked users
                            </div>
                        ) : (
                            blockedUsers.map((userId) => (
                                <BlockedUserCard
                                    key={userId}
                                    userId={userId}
                                    onUnblock={() => handleUnblockUser(userId)}
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
                                <label className="block text-sm font-medium text-dark-300 mb-2">
                                    Friend's Handle
                                </label>
                                <input
                                    type="text"
                                    value={addFriendHandle}
                                    onChange={(e) => setAddFriendHandle(e.target.value)}
                                    placeholder="username"
                                    className="w-full px-4 py-2 bg-dark-800 border border-dark-700 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    disabled={actionLoading === 'add-friend'}
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={!addFriendHandle.trim() || actionLoading === 'add-friend'}
                                className="w-full px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition"
                            >
                                {actionLoading === 'add-friend' ? 'Sending...' : 'Send Friend Request'}
                            </button>
                        </form>
                    </div>
                )}
            </div>
        </div>
    );
};

const FriendCard: React.FC<{
    friend: Friend;
    onMessage: () => void;
    onRemove: () => void;
    onBlock: () => void;
    loading: boolean;
}> = ({ friend, onMessage, onRemove, onBlock, loading }) => {
    const [showMenu, setShowMenu] = useState(false);

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'online': return 'bg-green-500';
            case 'idle': return 'bg-yellow-500';
            case 'dnd': return 'bg-red-500';
            default: return 'bg-dark-500';
        }
    };

    return (
        <div className="flex items-center justify-between p-3 bg-dark-800 rounded-lg hover:bg-dark-700 transition">
            <button
                onClick={onMessage}
                className="flex items-center space-x-3 flex-1 text-left"
            >
                <div className="relative">
                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
                        {friend.displayName[0].toUpperCase()}
                    </div>
                    <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-800 ${getStatusColor(friend.status)}`} />
                </div>
                <div>
                    <div className="font-semibold text-white">{friend.displayName}</div>
                    <div className="text-sm text-dark-400">@{friend.handle}</div>
                </div>
            </button>
            <div className="flex items-center space-x-2">
                <button
                    onClick={onMessage}
                    className="p-2 text-dark-400 hover:text-white hover:bg-dark-600 rounded-lg transition"
                    title="Send Message"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                </button>
                <div className="relative">
                    <button
                        onClick={() => setShowMenu(!showMenu)}
                        className="p-2 text-dark-400 hover:text-white transition"
                        disabled={loading}
                    >
                        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
                        </svg>
                    </button>
                    {showMenu && (
                        <>
                            <div className="fixed inset-0 z-10" onClick={() => setShowMenu(false)} />
                            <div className="absolute right-0 mt-2 w-48 bg-dark-700 border border-dark-600 rounded-lg shadow-lg z-20">
                                <button
                                    onClick={() => { onRemove(); setShowMenu(false); }}
                                    className="w-full px-4 py-2 text-left text-red-400 hover:bg-dark-600 transition rounded-t-lg"
                                >
                                    Remove Friend
                                </button>
                                <button
                                    onClick={() => { onBlock(); setShowMenu(false); }}
                                    className="w-full px-4 py-2 text-left text-red-400 hover:bg-dark-600 transition rounded-b-lg"
                                >
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
    request: FriendRequest;
    onAccept: () => void;
    onReject: () => void;
    loading: boolean;
}> = ({ request, onAccept, onReject, loading }) => {
    return (
        <div className="p-4 bg-dark-800 rounded-lg">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
                        {request.fromDisplayName[0].toUpperCase()}
                    </div>
                    <div>
                        <div className="font-semibold text-white">{request.fromDisplayName}</div>
                        <div className="text-sm text-dark-400">@{request.fromHandle}</div>
                    </div>
                </div>
                <div className="text-xs text-dark-500">
                    {new Date(request.createdAt).toLocaleDateString()}
                </div>
            </div>
            <div className="flex space-x-2">
                <button
                    onClick={onAccept}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-dark-600 text-white font-semibold rounded-lg transition"
                >
                    {loading ? 'Processing...' : 'Accept'}
                </button>
                <button
                    onClick={onReject}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-dark-600 text-white font-semibold rounded-lg transition"
                >
                    Reject
                </button>
            </div>
        </div>
    );
};

const OutgoingRequestCard: React.FC<{
    request: FriendRequest;
    onCancel: () => void;
    loading: boolean;
}> = ({ request, onCancel, loading }) => {
    return (
        <div className="p-4 bg-dark-800 rounded-lg">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold">
                        {request.toDisplayName[0].toUpperCase()}
                    </div>
                    <div>
                        <div className="font-semibold text-white">{request.toDisplayName}</div>
                        <div className="text-sm text-dark-400">@{request.toHandle}</div>
                    </div>
                </div>
                <button
                    onClick={onCancel}
                    disabled={loading}
                    className="px-4 py-2 bg-dark-700 hover:bg-dark-600 disabled:bg-dark-600 text-white rounded-lg transition"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
};

const BlockedUserCard: React.FC<{
    userId: string;
    onUnblock: () => void;
    loading: boolean;
}> = ({ userId, onUnblock, loading }) => {
    return (
        <div className="p-4 bg-dark-800 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-dark-700 flex items-center justify-center text-dark-400">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                </div>
                <div className="text-dark-400">{userId}</div>
            </div>
            <button
                onClick={onUnblock}
                disabled={loading}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 text-white rounded-lg transition"
            >
                Unblock
            </button>
        </div>
    );
};

export default FriendsList;