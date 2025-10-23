import React from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';

const Sidebar: React.FC = () => {
    const { rooms, currentRoomId, setCurrentRoom } = useRoomsStore();
    const { user, logout } = useAuthStore();

    return (
        <div className="w-64 bg-dark-800 flex flex-col h-screen border-r border-dark-700">
            <div className="p-4 border-b border-dark-700">
                <h2 className="text-xl font-bold text-white">Concord</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="mb-4">
                    <div className="text-xs font-semibold text-dark-400 uppercase tracking-wider px-2 mb-2">
                        Rooms
                    </div>
                    <div className="space-y-1">
                        {rooms.map((room) => (
                            <button
                                key={room.id}
                                onClick={() => setCurrentRoom(room.id)}
                                className={`w-full text-left px-3 py-2 rounded-lg transition ${
                                    currentRoomId === room.id
                                        ? 'bg-primary-600 text-white'
                                        : 'text-dark-300 hover:bg-dark-700 hover:text-white'
                                }`}
                            >
                                <div className="flex items-center">
                                    <span className="mr-2">#</span>
                                    <span className="truncate">{room.name}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="p-4 border-t border-dark-700">
                <div className="flex items-center justify-between">
                    <div className="flex items-center min-w-0">
                        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
              <span className="text-white font-semibold text-sm">
                {user?.displayName?.charAt(0).toUpperCase()}
              </span>
                        </div>
                        <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                                {user?.displayName}
                            </div>
                            <div className="text-xs text-dark-400 truncate">
                                @{user?.handle}
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={logout}
                        className="ml-2 p-2 text-dark-400 hover:text-white hover:bg-dark-700 rounded-lg transition flex-shrink-0"
                        title="Logout"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;