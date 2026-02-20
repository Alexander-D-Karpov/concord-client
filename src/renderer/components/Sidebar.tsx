import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useFriendsStore } from '../hooks/useFriendsStore';
import { useUsersStore } from '../hooks/useUsersStore';
import { useDMStore } from '../hooks/useDMStore';
import UnreadBadge from './UnreadBadge';
import { useNotificationStore } from '../hooks/useNotificationStore';
import InviteMemberModal from './InviteMemberModal';
import DMList from './DMList';
import { RoomInvite } from '../types';
import Modal from './Modal';
import Avatar from "@/components/Avatar";

type SidebarTab = 'rooms' | 'dms';

const mapRoomInvite = (i: any): RoomInvite => ({
    id: i.id,
    roomId: i.room_id,
    roomName: i.room_name,
    inviterId: i.invited_by,
    inviterDisplayName: i.inviter_display_name || i.inviter_handle,
    inviterAvatarUrl: i.inviter_avatar_url,
    createdAt: i.created_at
});

const Sidebar: React.FC = () => {
    const rooms = useRoomsStore(state => state.rooms);
    const currentRoomId = useRoomsStore(state => state.currentRoomId);
    const setCurrentRoom = useRoomsStore(state => state.setCurrentRoom);
    const roomInvites = useRoomsStore(state => state.roomInvites);
    const setRoomInvites = useRoomsStore(state => state.setRoomInvites);
    const setRooms = useRoomsStore(state => state.setRooms);

    const user = useAuthStore(state => state.user);

    const friends = useFriendsStore(state => state.friends);
    const incomingRequests = useFriendsStore(state => state.incomingRequests);
    const loadFriends = useFriendsStore(state => state.loadFriends);
    const loadPendingRequests = useFriendsStore(state => state.loadPendingRequests);
    const sendRequest = useFriendsStore(state => state.sendRequest);

    const getUser = useUsersStore(state => state.getUser);
    const fetchUsers = useUsersStore(state => state.fetchUsers);

    const setCurrentChannel = useDMStore(state => state.setCurrentChannel);
    const getOrCreateDM = useDMStore(state => state.getOrCreateDM);

    const unread = useNotificationStore(state => state.unread);
    const clearUnread = useNotificationStore(state => state.clearUnread);

    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<SidebarTab>('rooms');
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
        loadPendingRequests();

        const intervalId = setInterval(() => {
            loadFriends();
        }, 60000);

        return () => clearInterval(intervalId);
    }, [loadFriends, loadPendingRequests]);

    useEffect(() => {
        const loadInvites = async () => {
            try {
                const res = await window.concord.listRoomInvites();
                const invites = (res.incoming || []).map(mapRoomInvite);
                setRoomInvites(invites);
            } catch (e) {
                console.error("Failed to load invites", e);
            }
        };

        loadInvites();

        const intervalId = setInterval(loadInvites, 30000);

        const handleFocus = () => {
            loadInvites();
        };

        window.addEventListener('focus', handleFocus);

        return () => {
            clearInterval(intervalId);
            window.removeEventListener('focus', handleFocus);
        };
    }, [setRoomInvites]);

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

    const handleOpenFriendDM = async (userId: string) => {
        const channel = await getOrCreateDM(userId);
        if (channel) {
            setCurrentRoom(null);
            setCurrentChannel(channel.id);
            setActiveTab('dms');
        }
    };

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
            setRooms((res?.rooms || []).map((r: any) => ({
                id: r.id,
                name: r.name,
                createdBy: r.created_by,
                voiceServerId: r.voice_server_id,
                region: r.region,
                createdAt: new Date(Number(r.created_at?.seconds || 0) * 1000).toISOString(),
                description: r.description,
                isPrivate: r.is_private,
            })));

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

    const handleSelectRoom = (roomId: string) => {
        setCurrentChannel(null);
        setCurrentRoom(roomId);
        setActiveTab('rooms');
    };

    const handleSelectDM = (channelId: string) => {
        setCurrentRoom(null);
        setCurrentChannel(channelId);
    };

    const handleAcceptInvite = async (inviteId: string) => {
        try {
            const member = await window.concord.acceptRoomInvite(inviteId);
            const resRooms = await window.concord.getRooms();
            setRooms((resRooms?.rooms || []).map((r: any) => ({
                id: r.id,
                name: r.name,
                createdBy: r.created_by,
                voiceServerId: r.voice_server_id,
                region: r.region,
                createdAt: new Date(Number(r.created_at?.seconds || 0) * 1000).toISOString(),
                description: r.description,
                isPrivate: r.is_private,
            })));

            const resInvites = await window.concord.listRoomInvites();
            setRoomInvites((resInvites.incoming || []).map(mapRoomInvite));

            setCurrentRoom(member.room_id || member.roomId);
        } catch (err) {
            console.error("Failed to accept invite", err);
        }
    };

    const handleRejectInvite = async (inviteId: string) => {
        try {
            await window.concord.rejectRoomInvite(inviteId);
            const resInvites = await window.concord.listRoomInvites();
            setRoomInvites((resInvites.incoming || []).map(mapRoomInvite));
        } catch (err) {
            console.error("Failed to reject invite", err);
        }
    };

    const getFriendDisplayName = (userId: string) => {
        const cachedUser = getUser(userId);
        return cachedUser?.displayName || cachedUser?.handle || userId.split('-')[0];
    };

    const getStatusColor = (status?: string) => {
        switch (status) {
            case 'online': return 'bg-green-500';
            case 'idle': case 'away': return 'bg-yellow-500';
            case 'dnd': case 'busy': return 'bg-red-500';
            default: return 'bg-dark-500';
        }
    };

    return (
        <div className="w-64 bg-dark-800 flex flex-col border-r border-dark-700 overflow-hidden h-screen">
            <div className="p-4 border-b border-dark-700 flex-shrink-0">
                <div className="flex items-center space-x-3">
                    <Avatar userId={user?.id} name={user?.displayName || user?.handle} size="md" showStatus={false} />
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

            <div className="flex border-b border-dark-700">
                <button
                    onClick={() => setActiveTab('rooms')}
                    className={`flex-1 py-2 text-sm font-medium transition ${
                        activeTab === 'rooms'
                            ? 'text-white border-b-2 border-primary-500'
                            : 'text-dark-400 hover:text-white'
                    }`}
                >
                    Rooms
                </button>
                <button
                    onClick={() => setActiveTab('dms')}
                    className={`flex-1 py-2 text-sm font-medium transition ${
                        activeTab === 'dms'
                            ? 'text-white border-b-2 border-primary-500'
                            : 'text-dark-400 hover:text-white'
                    }`}
                >
                    Messages
                </button>
            </div>

            <div className="flex-1 overflow-y-auto">
                <div className="p-2">
                    <div className="flex items-center justify-between px-2 py-2">
                        <div className="flex items-center space-x-2">
                            <h2 className="text-white font-semibold text-xs uppercase tracking-wider">Friends</h2>
                            {incomingRequests.length > 0 && (
                                <span className="px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                                    {incomingRequests.length}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center space-x-1">
                            <button
                                onClick={() => navigate('/friends')}
                                className="p-1 hover:bg-dark-700 rounded transition"
                                title="View All Friends"
                            >
                                <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                            </button>
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
                    </div>

                    {incomingRequests.length > 0 && (
                        <button
                            onClick={() => navigate('/friends')}
                            className="w-full mb-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-left hover:bg-yellow-500/20 transition"
                        >
                            <div className="flex items-center space-x-2">
                                <svg className="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                </svg>
                                <span className="text-sm text-yellow-500 font-medium">
                                    {incomingRequests.length} pending request{incomingRequests.length !== 1 ? 's' : ''}
                                </span>
                            </div>
                        </button>
                    )}

                    {friends.length === 0 ? (
                        <div className="px-3 py-2 text-center text-dark-400 text-xs">
                            No friends yet
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {friends.slice(0, 5).map((friend) => (
                                <button
                                    key={friend.userId}
                                    onClick={() => handleOpenFriendDM(friend.userId)}
                                    className="w-full px-3 py-2 rounded-lg text-left transition hover:bg-dark-700 flex items-center space-x-2"
                                >
                                    <div className="relative">
                                        <Avatar userId={friend.userId} src={friend.avatarUrl} name={friend.displayName || friend.handle} size="sm" status={friend.status} showStatus />
                                    </div>
                                    <span className="truncate text-sm text-white">
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

                <div className="h-px bg-dark-700 my-2"></div>

                {activeTab === 'dms' ? (
                    <div className="p-2">
                        <div className="flex items-center justify-between px-2 py-2">
                            <h2 className="text-white font-semibold text-xs uppercase tracking-wider">Direct Messages</h2>
                        </div>
                        <DMList onSelectDM={handleSelectDM} />
                    </div>
                ) : (
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

                        {roomInvites.length > 0 && (
                            <div className="p-2 mb-2">
                                <div className="text-xs font-semibold text-dark-400 uppercase px-2 mb-1">Invites</div>
                                {roomInvites.map(invite => (
                                    <div key={invite.id} className="px-3 py-2 bg-primary-900/20 border border-primary-700/50 rounded-lg mb-1">
                                        <div className="text-sm text-white font-medium mb-1">{invite.roomName}</div>
                                        <div className="text-xs text-dark-400 mb-2">from {invite.inviterDisplayName}</div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleAcceptInvite(invite.id)} className="flex-1 bg-green-600 hover:bg-green-700 text-white text-xs py-1 rounded">Join</button>
                                            <button onClick={() => handleRejectInvite(invite.id)} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs py-1 rounded">Ignore</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {rooms.length === 0 ? (
                            <div className="px-3 py-2 text-center text-dark-400 text-xs">
                                No rooms yet
                            </div>
                        ) : (
                            <div className="space-y-1">
                                {rooms.map((room) => (
                                    <button
                                        key={room.id}
                                        onClick={() => {
                                            handleSelectRoom(room.id);
                                            clearUnread('room', room.id);
                                        }}
                                        className={`w-full px-3 py-2 rounded-lg text-left transition ${
                                            currentRoomId === room.id
                                                ? 'bg-primary-600 text-white'
                                                : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between min-w-0">
                                            <div className="flex items-center space-x-2 min-w-0">
                                                <span className="text-lg flex-shrink-0">#</span>
                                                <span className="truncate text-sm">{room.name}</span>
                                            </div>
                                            <UnreadBadge count={unread.rooms[room.id] || 0} />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="p-3 border-t border-dark-700 bg-dark-800 text-xs text-dark-500">
                <div className="font-semibold mb-1">Shortcuts</div>
                <div className="flex justify-between">
                    <span>Toggle Sidebar</span>
                    <kbd className="bg-dark-700 px-1 rounded">Ctrl+B</kbd>
                </div>
                <div className="flex justify-between mt-1">
                    <span>Toggle Members</span>
                    <kbd className="bg-dark-700 px-1 rounded">Ctrl+U</kbd>
                </div>
            </div>

            {showCreateRoom && (
                <Modal onClose={() => setShowCreateRoom(false)}>
                    <div className="p-6">
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
                </Modal>
            )}

            {showAddFriend && (
                <Modal onClose={() => setShowAddFriend(false)}>
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xl font-semibold text-white">Add Friend</h3>
                            <button onClick={() => setShowAddFriend(false)}>
                                <svg className="w-5 h-5 text-dark-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

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
                                                className="flex items-center justify-between p-3 bg-dark-700 hover:bg-dark-600 rounded-lg transition gap-3"
                                            >
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                                                    <span className="text-white font-semibold">
                                                        {(searchUser.display_name || searchUser.handle).charAt(0).toUpperCase()}
                                                    </span>
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="text-white font-medium truncate">
                                                            {searchUser.display_name || searchUser.handle}
                                                        </div>
                                                        <div className="text-dark-400 text-sm truncate">
                                                            @{searchUser.handle}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex-shrink-0">
                                                    {isSelf ? (
                                                        <span className="text-dark-500 text-sm px-3">You</span>
                                                    ) : isFriend ? (
                                                        <span className="text-green-400 text-sm px-3">Friend</span>
                                                    ) : (
                                                        <button
                                                            onClick={() => handleSendRequest(searchUser.id)}
                                                            className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition"
                                                        >
                                                            Add
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </Modal>
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