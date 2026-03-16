import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomsStore } from '../hooks/useRoomsStore';
import useAuthStore from '../hooks/useAuthStore';
import { useFriendsStore } from '../hooks/useFriendsStore';
import { useUsersStore } from '../hooks/useUsersStore';
import { useDMStore } from '../hooks/useDMStore';
import { useNotificationStore } from '../hooks/useNotificationStore';
import { mapRoomInvite } from '../utils/mappers';
import { RoomInvite } from '../utils/types';
import InviteMemberModal from './InviteMemberModal';
import DMList from './DMList';
import SidebarProfile from './sidebar/SidebarProfile';
import FriendsSection from './sidebar/FriendsSection';
import RoomsList from './sidebar/RoomsList';
import CreateRoomModal from './sidebar/CreateRoomModal';
import AddFriendModal from './sidebar/AddFriendModal';

type SidebarTab = 'rooms' | 'dms';

const Sidebar: React.FC = () => {
    const rooms = useRoomsStore(s => s.rooms);
    const currentRoomId = useRoomsStore(s => s.currentRoomId);
    const setCurrentRoom = useRoomsStore(s => s.setCurrentRoom);
    const roomInvites = useRoomsStore(s => s.roomInvites);
    const setRoomInvites = useRoomsStore(s => s.setRoomInvites);
    const setRooms = useRoomsStore(s => s.setRooms);

    const user = useAuthStore(s => s.user);

    const friends = useFriendsStore(s => s.friends);
    const incomingRequests = useFriendsStore(s => s.incomingRequests);
    const loadFriends = useFriendsStore(s => s.loadFriends);
    const loadPendingRequests = useFriendsStore(s => s.loadPendingRequests);
    const sendRequest = useFriendsStore(s => s.sendRequest);

    const fetchUsers = useUsersStore(s => s.fetchUsers);

    const setCurrentChannel = useDMStore(s => s.setCurrentChannel);
    const getOrCreateDM = useDMStore(s => s.getOrCreateDM);

    const unread = useNotificationStore(s => s.unread);
    const clearUnread = useNotificationStore(s => s.clearUnread);

    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState<SidebarTab>('rooms');
    const [showCreateRoom, setShowCreateRoom] = useState(false);
    const [showAddFriend, setShowAddFriend] = useState(false);
    const [showInviteAfterCreate, setShowInviteAfterCreate] = useState(false);
    const [createdRoomId, setCreatedRoomId] = useState<string | null>(null);

    useEffect(() => {
        loadFriends();
        loadPendingRequests();
    }, [loadFriends, loadPendingRequests]);

    useEffect(() => {
        const loadInvites = async () => {
            try {
                const res = await window.concord.listRoomInvites();
                setRoomInvites((res.incoming || []).map(mapRoomInvite));
            } catch {}
        };

        loadInvites();
    }, [setRoomInvites]);

    useEffect(() => {
        const ids = friends.map(f => f.userId);
        if (ids.length > 0) fetchUsers(ids);
    }, [friends, fetchUsers]);

    const handleOpenFriendDM = async (userId: string) => {
        const channel = await getOrCreateDM(userId);
        if (channel) {
            setCurrentRoom(null);
            setCurrentChannel(channel.id);
            setActiveTab('dms');
        }
    };

    const handleSendRequest = async (userId: string) => {
        await sendRequest(userId);
    };

    const handleCreateRoom = async (name: string, description: string, isPrivate: boolean) => {
        const room = await window.concord.createRoom(name, undefined, description || undefined, isPrivate);
        const res = await window.concord.getRooms();
        setRooms((res?.rooms || []).map((r: any) => ({
            id: r.id, name: r.name, createdBy: r.created_by, voiceServerId: r.voice_server_id,
            region: r.region, createdAt: new Date(Number(r.created_at?.seconds || 0) * 1000).toISOString(),
            description: r.description, isPrivate: r.is_private,
        })));
        setCreatedRoomId(room.id);
        setShowInviteAfterCreate(true);
    };

    const handleSelectRoom = (roomId: string) => {
        setCurrentChannel(null);
        setCurrentRoom(roomId);
        clearUnread('room', roomId);
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
                id: r.id, name: r.name, createdBy: r.created_by, voiceServerId: r.voice_server_id,
                region: r.region, createdAt: new Date(Number(r.created_at?.seconds || 0) * 1000).toISOString(),
                description: r.description, isPrivate: r.is_private,
            })));
            const resInvites = await window.concord.listRoomInvites();
            setRoomInvites((resInvites.incoming || []).map(mapRoomInvite));
            setCurrentRoom(member.room_id || member.roomId);
        } catch (err) {
            console.error('Failed to accept invite', err);
        }
    };

    const handleRejectInvite = async (inviteId: string) => {
        try {
            await window.concord.rejectRoomInvite(inviteId);
            const resInvites = await window.concord.listRoomInvites();
            setRoomInvites((resInvites.incoming || []).map(mapRoomInvite));
        } catch (err) {
            console.error('Failed to reject invite', err);
        }
    };

    const handleInviteAfterCreate = async (userId: string) => {
        if (!createdRoomId) return;
        await window.concord.inviteMember(createdRoomId, userId);
    };

    return (
        <div className="relative flex h-full min-h-0 w-64 flex-col border-r border-gray-200 bg-gray-50 dark:border-dark-700 dark:bg-dark-800">
            <div className="flex border-b border-gray-200 dark:border-dark-700">
                <button
                    onClick={() => setActiveTab('rooms')}
                    className={`flex-1 py-2 text-sm font-medium transition ${
                        activeTab === 'rooms'
                            ? 'text-gray-900 dark:text-white border-b-2 border-primary-500'
                            : 'text-gray-500 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                    Rooms
                </button>
                <button
                    onClick={() => setActiveTab('dms')}
                    className={`flex-1 py-2 text-sm font-medium transition ${
                        activeTab === 'dms'
                            ? 'text-gray-900 dark:text-white border-b-2 border-primary-500'
                            : 'text-gray-500 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white'
                    }`}
                >
                    Messages
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <FriendsSection
                    friends={friends}
                    incomingRequestCount={incomingRequests.length}
                    onOpenDM={handleOpenFriendDM}
                    onShowAddFriend={() => setShowAddFriend(true)}
                />

                <div className="h-px bg-gray-200 dark:bg-dark-700 my-2" />

                {activeTab === 'dms' ? (
                    <div className="p-2">
                        <div className="flex items-center justify-between px-2 py-2">
                            <h2 className="text-gray-900 dark:text-white font-semibold text-xs uppercase tracking-wider">Direct Messages</h2>
                        </div>
                        <DMList onSelectDM={handleSelectDM} />
                    </div>
                ) : (
                    <RoomsList
                        rooms={rooms}
                        currentRoomId={currentRoomId}
                        unreadRooms={unread.rooms}
                        roomInvites={roomInvites}
                        onSelectRoom={handleSelectRoom}
                        onCreateRoom={() => setShowCreateRoom(true)}
                        onAcceptInvite={handleAcceptInvite}
                        onRejectInvite={handleRejectInvite}
                    />
                )}
            </div>

            <SidebarProfile
                userId={user?.id}
                displayName={user?.displayName}
                handle={user?.handle}
                currentStatus={user?.status}
            />

            {showCreateRoom && (
                <CreateRoomModal
                    onClose={() => setShowCreateRoom(false)}
                    onCreate={handleCreateRoom}
                />
            )}

            {showAddFriend && (
                <AddFriendModal
                    currentUserId={user?.id}
                    friends={friends}
                    onClose={() => setShowAddFriend(false)}
                    onSendRequest={handleSendRequest}
                />
            )}

            {showInviteAfterCreate && createdRoomId && (
                <InviteMemberModal
                    roomId={createdRoomId}
                    onClose={() => { setShowInviteAfterCreate(false); setCreatedRoomId(null); }}
                    onInvite={handleInviteAfterCreate}
                />
            )}
        </div>
    );
};

export default Sidebar;