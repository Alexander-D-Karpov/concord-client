import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';

const Sidebar: React.FC = () => {
    const { rooms, currentRoomId, setCurrentRoom } = useRoomsStore();
    const { user } = useAuthStore();
    const navigate = useNavigate();

    const [showCreateRoom, setShowCreateRoom] = useState(false);
    const [newRoomName, setNewRoomName] = useState('');
    const [creating, setCreating] = useState(false);

    const handleCreateRoom = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newRoomName.trim() || creating) return;

        setCreating(true);
        try {
            await window.concord.createRoom(newRoomName.trim());
            setNewRoomName('');
            setShowCreateRoom(false);

            const res = await window.concord.getRooms();
            const { setRooms } = useRoomsStore.getState();
            setRooms(res?.rooms || []);
        } catch (err) {
            console.error('Failed to create room:', err);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="w-64 bg-dark-800 flex flex-col border-r border-dark-700 overflow-hidden h-screen">
            {/* User profile */}
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

            {/* Rooms header */}
            <div className="p-4 flex items-center justify-between flex-shrink-0">
                <h2 className="text-white font-semibold text-sm">Rooms</h2>
                <button
                    onClick={() => setShowCreateRoom(true)}
                    className="p-1 hover:bg-dark-700 rounded transition"
                    title="Create Room"
                >
                    <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>

            {/* Create room modal */}
            {showCreateRoom && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-800 p-6 rounded-lg w-full max-w-md border border-dark-700">
                        <h3 className="text-white text-lg font-semibold mb-4">Create Room</h3>
                        <form onSubmit={handleCreateRoom}>
                            <input
                                type="text"
                                value={newRoomName}
                                onChange={(e) => setNewRoomName(e.target.value)}
                                className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                                placeholder="Room name"
                                autoFocus
                                maxLength={50}
                            />
                            <div className="flex space-x-2">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowCreateRoom(false);
                                        setNewRoomName('');
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

            {/* Rooms list */}
            <div className="flex-1 overflow-y-auto">
                {rooms.length === 0 ? (
                    <div className="p-4 text-center text-dark-400 text-sm">
                        No rooms yet. Create one to get started!
                    </div>
                ) : (
                    <div className="space-y-1 p-2">
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
    );
};

export default Sidebar;