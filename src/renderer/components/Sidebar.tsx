import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useFriendsStore } from '../hooks/useFriendsStore';
import { useUsersStore } from '../hooks/useUsersStore';
import InviteMemberModal from './InviteMemberModal';

const Sidebar: React.FC = () => {
    const { rooms, currentRoomId, setCurrentRoom } = useRoomsStore();
    const { user } = useAuthStore();
    const { friends, loadFriends, sendRequest } = useFriendsStore();
    const { getUser, fetchUsers } = useUsersStore();
    const navigate = useNavigate();

    const [showCreateRoom, setShowCreateRoom] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [newRoomDescription, setNewRoomDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [showInviteAfterCreate, setShowInviteAfterCreate] = useState(false);
    const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);
    const [showAddFriend, setShowAddFriend] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    useEffect(() => {
        loadFriends();
    }, [loadFriends]);

    useEffect(() => {
        const friendUserIds = friends.map(f => f.userId);
        if (friendUserIds.length > 0) {
            fetchUsers(friendUserIds);
        }
    }, [friends, fetchUsers]);

    useEffect(() => {
        const searchUsers = async () => {
            if (searchQuery.length < 2) {
                setSearchResults([]);
                return;
            }

            setSearching(true);
            try {
                const response = await window.concord.searchUsers(searchQuery, 10);
                setSearchResults(response.users || []);
            } catch (err) {
                console.error('Failed to search users:', err);
            } finally {
                setSearching(false);
            }
        };

        const timeoutId = setTimeout(searchUsers, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const handleSendRequest = async (userId: string) => {
        try {
            await sendRequest(userId);
            setShowAddFriend(false);
            setSearchQuery('');
        } catch (err: any) {
            console.error('Failed to send request:', err);
        }
    };

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRoomName.trim() || creating) return;

        setCreating(true);
        try {
            const room = await window.concord.createRoom(
                newRoomName.trim(),
                undefined,
                newRoomDescription.trim() || undefined,
                isPrivate
            );

            setNewRoomName('');
            setNewRoomDescription('');
            setIsPrivate(false);
            setShowCreateRoom(false);

            const res = await window.concord.getRooms();
            const { setRooms } = useRoomsStore.getState();
            setRooms(res?.rooms || []);

            setCreatedRoomId(room.id);
            setShowInviteAfterCreate(true);
        } catch (err) {
            console.error('Failed to create room:', err);
        } finally {
            setCreating(false);
        }
    };

    const handleInviteAfterCreate = async (userId: string) => {
        if (!createdRoomId) return;
        try {
            await window.concord.inviteMember(createdRoomId, userId);
        } catch (err) {
            console.error('Failed to invite member:', err);
            throw err;
        }
    };

    const getFriendDisplayName = (userId: string) => {
        const cachedUser = getUser(userId);
        return cachedUser?.displayName || cachedUser?.handle || userId.split('-')[0];
    };

    return (
        <div className="w-64 bg-dark-800 flex flex-col border-r border-dark-700 overflow-hidden h-screen">
            <div className="p-4 border-b border-dark-700 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-semibold flex-shrink-0">
                        {user?.displayName?.[0]?.toUpperCase() || user?.handle?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="text-white font-medium truncate text-sm">
                            {user?.displayName || user?.handle || 'User'}
                        </div>
                        <div className="text-dark-400 text-xs truncate">
                            @{user?.handle || 'unknown'}
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/settings')}
                        className="p-2 hover:bg-dark-700 rounded-lg transition flex-shrink-0"
                        title="Settings"
                    >
                        <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="p-2">
                    <div className="flex items-center justify-between px-2 py-2">
                        <h2 className="text-white font-semibold text-xs uppercase tracking-wider">Friends</h2>
                        <button
                            onClick={() => setShowAddFriend(true)}
                            className="p-1 hover:bg-dark-700 rounded transition"
                            title="Add Friend"
                        >
                            <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                            </svg>
                        </button>
                    </div>

                    {friends.length === 0 ? (
                        <div className="px-3 py-2 text-center text-dark-400 text-xs">
                            No friends yet
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {friends.slice(0, 5).map((friend) => (
                                <button
                                    key={friend.userId}
                                    className="w-full px-3 py-2 rounded-lg text-left transition hover:bg-dark-700 flex items-center space-x-2"
                                >
                                    <div className="relative">
                                        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                                            <span className="text-white font-semibold text-xs">
                                                {getFriendDisplayName(friend.userId).charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-800 ${
                                            friend.status === 'online' ? 'bg-green-500' :
                                                friend.status === 'away' ? 'bg-yellow-500' :
                                                    friend.status === 'busy' ? 'bg-red-500' : 'bg-dark-500'
                                        }`}></div>
                                    </div>
                                    <span className="truncate text-sm text-white">
                                        {getFriendDisplayName(friend.userId)}
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

                <div className="h-px bg-dark-700 my-2"></div>

                <div className="p-2">
                    <div className="flex items-center justify-between px-2 py-2">
                        <h2 className="text-white font-semibold text-xs uppercase tracking-wider">Rooms</h2>
                        <button
                            onClick={() => setShowCreateRoom(true)}
                            className="p-1 hover:bg-dark-700 rounded transition"
                            title="Create Room"
                        >
                            <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </button>
                    </div>

                    {rooms.length === 0 ? (
                        <div className="px-3 py-2 text-center text-dark-400 text-xs">
                            No rooms yet
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {rooms.map((room) => (
                                <button
                                    key={room.id}
                                    onClick={() => setCurrentRoom(room.id)}
                                    className={`w-full px-3 py-2 rounded-lg text-left transition ${
                                        currentRoomId === room.id
                                            ? 'bg-primary-600 text-white'
                                            : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                                    }`}
                                >
                                    <div className="flex items-center space-x-2 min-w-0">
                                        <span className="text-lg flex-shrink-0">#</span>
                                        <span className="truncate text-sm">{room.name}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {showCreateRoom && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-800 p-6 rounded-lg w-full max-w-md border border-dark-700">
                        <h3 className="text-white text-lg font-semibold mb-4">Create Room</h3>
                        <form onSubmit={handleCreateRoom}>
                            <div className="space-y-4">
                                <input
                                    type="text"
                                    value={newRoomName}
                                    onChange={(e) => setNewRoomName(e.target.value)}
                                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Room name"
                                    autoFocus
                                    maxLength={50}
                                />
                                <textarea
                                    value={newRoomDescription}
                                    onChange={(e) => setNewRoomDescription(e.target.value)}
                                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Description (optional)"
                                    rows={3}
                                    maxLength={200}
                                />
                                <div className="flex items-center justify-between">
                                    <span className="text-white text-sm">Private Room</span>
                                    <button
                                        type="button"
                                        onClick={() => setIsPrivate(!isPrivate)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                            isPrivate ? 'bg-primary-600' : 'bg-dark-600'
                                        }`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                isPrivate ? 'translate-x-6' : 'translate-x-1'
                                            }`}
                                        />
                                    </button>
                                </div>
                            </div>
                            <div className="flex space-x-2 mt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateRoom(false);
                                        setNewRoomName('');
                                        setNewRoomDescription('');
                                        setIsPrivate(false);
                                    }}
                                    className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition"
                                    disabled={creating}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={!newRoomName.trim() || creating}
                                >
                                    {creating ? 'Creating...' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showAddFriend && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-800 rounded-lg w-full max-w-md border border-dark-700">
                        <div className="p-6 border-b border-dark-700">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-semibold text-white">Add Friend</h3>
                                <button
                                    onClick={() => {
                                        setShowAddFriend(false);
                                        setSearchQuery('');
                                    }}
                                    className="p-2 hover:bg-dark-700 rounded-lg transition"
                                >
                                    <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6">
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search users by handle..."
                                className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                                autoFocus
                            />

                            <div className="max-h-80 overflow-y-auto">
                                {searching ? (
                                    <div className="text-center py-8 text-dark-400">
                                        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                                        <p>Searching...</p>
                                    </div>
                                ) : searchResults.length === 0 ? (
                                    <div className="text-center py-8 text-dark-400">
                                        {searchQuery.length < 2 ? (
                                            <p>Type at least 2 characters to search</p>
                                        ) : (
                                            <p>No users found</p>
                                        )}
                                    </div>
                                ) : (
                                    <div className="space-y-2">
                                        {searchResults.map((searchUser) => {
                                            const isSelf = searchUser.id === user?.id;
                                            const isFriend = friends.some(f => f.userId === searchUser.id);

                                            return (
                                                <div
                                                    key={searchUser.id}
                                                    className="flex items-center justify-between p-3 bg-dark-700 hover:bg-dark-600 rounded-lg transition"
                                                >
                                                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                                                        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                                                            <span className="text-white font-semibold">
                                                                {(searchUser.display_name || searchUser.handle).charAt(0).toUpperCase()}
                                                            </span>
                                                        </div>
                                                        <div className="flex-1 min-w-0">
                                                            <div className="text-white font-medium truncate">
                                                                {searchUser.display_name || searchUser.handle}
                                                            </div>
                                                            <div className="text-dark-400 text-sm truncate">
                                                                @{searchUser.handle}
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {isSelf ? (
                                                        <span className="text-dark-500 text-sm flex-shrink-0">You</span>
                                                    ) : isFriend ? (
                                                        <span className="text-green-400 text-sm flex-shrink-0">Friend</span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleSendRequest(searchUser.id)}
                                                            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition flex-shrink-0"
                                                        >
                                                            Add
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {showInviteAfterCreate && createdRoomId && (
                <InviteMemberModal
                    roomId={createdRoomId}
                    onClose={() => {
                        setShowInviteAfterCreate(false);
                        setCreatedRoomId(null);
                    }}
                    onInvite={handleInviteAfterCreate}
                />
            )}
        </div>
    );
};

export default Sidebar;