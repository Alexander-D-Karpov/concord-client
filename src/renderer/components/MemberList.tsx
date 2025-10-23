import React from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';

const MemberList: React.FC = () => {
    const { currentRoomId, members } = useRoomsStore();
    const currentMembers = currentRoomId ? members[currentRoomId] || [] : [];

    if (!currentRoomId) {
        return null;
    }

    return (
        <div className="w-60 bg-dark-800 border-l border-dark-700 flex flex-col h-screen">
            <div className="p-4 border-b border-dark-700">
                <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
                    Members — {currentMembers.length}
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                    {currentMembers.map((member) => (
                        <div
                            key={member.userId}
                            className="flex items-center px-3 py-2 rounded-lg hover:bg-dark-700 transition"
                        >
                            <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center mr-3">
                <span className="text-white font-semibold text-xs">
                  {member.userId.charAt(0).toUpperCase()}
                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-white truncate">
                                    {member.userId}
                                </div>
                                {member.role !== 'member' && (
                                    <div className="text-xs text-dark-400 capitalize">
                                        {member.role}
                                    </div>
                                )}
                            </div>
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default MemberList;