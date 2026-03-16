import React from 'react';
import { Room, RoomInvite } from '../../utils/types';
import UnreadBadge from '../UnreadBadge';
import { PlusIcon } from '../icons';

interface RoomsListProps {
    rooms: Room[];
    currentRoomId: string | null;
    unreadRooms: Record<string, number>;
    roomInvites: RoomInvite[];
    onSelectRoom: (roomId: string) => void;
    onCreateRoom: () => void;
    onAcceptInvite: (inviteId: string) => void;
    onRejectInvite: (inviteId: string) => void;
}

const RoomsList: React.FC<RoomsListProps> = ({
                                                 rooms,
                                                 currentRoomId,
                                                 unreadRooms,
                                                 roomInvites,
                                                 onSelectRoom,
                                                 onCreateRoom,
                                                 onAcceptInvite,
                                                 onRejectInvite,
                                             }) => (
    <div className="p-2">
        <div className="flex items-center justify-between px-2 py-2">
            <h2 className="text-gray-900 dark:text-white font-semibold text-xs uppercase tracking-wider">Rooms</h2>
            <button
                onClick={onCreateRoom}
                className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded transition"
                title="Create Room"
            >
                <PlusIcon size="sm" className="text-gray-400 dark:text-dark-400" />
            </button>
        </div>

        {roomInvites.length > 0 && (
            <div className="mb-2">
                <div className="text-xs font-semibold text-gray-500 dark:text-dark-400 uppercase px-2 mb-1">Invites</div>
                {roomInvites.map(invite => (
                    <div key={invite.id} className="px-3 py-2 bg-primary-900/20 border border-primary-700/50 rounded-lg mb-1">
                        <div className="text-sm text-gray-900 dark:text-white font-medium mb-1">{invite.roomName}</div>
                        <div className="text-xs text-gray-500 dark:text-dark-400 mb-2">from {invite.inviterDisplayName}</div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => onAcceptInvite(invite.id)}
                                className="flex-1 bg-green-600 hover:bg-green-700 text-gray-900 dark:text-white text-xs py-1 rounded transition"
                            >
                                Join
                            </button>
                            <button
                                onClick={() => onRejectInvite(invite.id)}
                                className="flex-1 bg-red-600 hover:bg-red-700 text-gray-900 dark:text-white text-xs py-1 rounded transition"
                            >
                                Ignore
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {rooms.length === 0 ? (
            <div className="px-3 py-2 text-center text-gray-400 dark:text-dark-400 text-xs">
                No rooms yet
            </div>
        ) : (
            <div className="space-y-1">
                {rooms.map((room) => (
                    <button
                        key={room.id}
                        onClick={() => onSelectRoom(room.id)}
                        className={`w-full px-3 py-2 rounded-lg text-left transition ${
                            currentRoomId === room.id
                                ? 'bg-primary-600 text-gray-900 dark:text-white'
                                : 'text-gray-600 dark:text-dark-300 hover:bg-gray-100 dark:hover:bg-dark-700 hover:text-gray-900 dark:hover:text-white'
                        }`}
                    >
                        <div className="flex items-center justify-between min-w-0">
                            <div className="flex items-center space-x-2 min-w-0">
                                <span className="text-lg flex-shrink-0">#</span>
                                <span className="truncate text-sm">{room.name}</span>
                            </div>
                            <UnreadBadge count={unreadRooms[room.id] || 0} />
                        </div>
                    </button>
                ))}
            </div>
        )}
    </div>
);

export default RoomsList;