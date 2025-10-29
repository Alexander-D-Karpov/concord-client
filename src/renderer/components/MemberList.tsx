import React, { useEffect, useCallback } from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { Member } from '../types';

const roleLabels: Record<string, string> = {
    'ROLE_ADMIN': 'Admin',
    'ROLE_MODERATOR': 'Moderator',
    'ROLE_MEMBER': 'Member',
    'admin': 'Admin',
    'moderator': 'Moderator',
    'member': 'Member',
};

const roleColors: Record<string, string> = {
    'ROLE_ADMIN': 'text-red-400',
    'ROLE_MODERATOR': 'text-blue-400',
    'ROLE_MEMBER': 'text-dark-400',
    'admin': 'text-red-400',
    'moderator': 'text-blue-400',
    'member': 'text-dark-400',
};

const MemberList: React.FC = () => {
    const { currentRoomId, members, setMembers } = useRoomsStore();
    const { user } = useAuthStore();
    const currentMembers = currentRoomId ? members[currentRoomId] || [] : [];

    const getDisplayName = useCallback((userId: string) => {
        if (userId === user?.id) {
            return user?.displayName || user?.handle || 'You';
        }
        return userId.split('-')[0];
    }, [user]);

    const getRoleLabel = (role: string) => {
        return roleLabels[role] || 'Member';
    };

    const getRoleColor = (role: string) => {
        return roleColors[role] || 'text-dark-400';
    };

    const loadMembers = useCallback(async () => {
        if (!currentRoomId) return;
        try {
            const res = await window.concord.getMembers(currentRoomId);
            const mapped: Member[] = (res?.members || []).map((m: any) => ({
                userId: m.user_id,
                roomId: m.room_id,
                role: m.role,
                joinedAt: new Date(
                    Number(m.joined_at?.seconds || 0) * 1000
                ).toISOString(),
            }));
            setMembers(currentRoomId, mapped);
        } catch (err) {
            console.error('Failed to load members:', err);
        }
    }, [currentRoomId, setMembers]);

    useEffect(() => {
        if (currentRoomId) {
            loadMembers();
        }
    }, [currentRoomId, loadMembers]);

    if (!currentRoomId) {
        return null;
    }

    const sortedMembers = [...currentMembers].sort((a, b) => {
        const roleOrder: Record<string, number> = {
            'ROLE_ADMIN': 0,
            'admin': 0,
            'ROLE_MODERATOR': 1,
            'moderator': 1,
            'ROLE_MEMBER': 2,
            'member': 2,
        };

        const aOrder = roleOrder[a.role] ?? 2;
        const bOrder = roleOrder[b.role] ?? 2;

        if (aOrder !== bOrder) return aOrder - bOrder;

        return getDisplayName(a.userId).localeCompare(getDisplayName(b.userId));
    });

    return (
        <div className="w-60 bg-dark-800 border-l border-dark-700 flex flex-col h-screen overflow-hidden">
            <div className="p-4 border-b border-dark-700 flex-shrink-0">
                <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
                    Members — {currentMembers.length}
                </h3>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <div className="space-y-1">
                    {sortedMembers.length === 0 ? (
                        <div className="px-3 py-2 text-sm text-dark-500 text-center">
                            Loading members...
                        </div>
                    ) : (
                        sortedMembers.map((member) => (
                            <div
                                key={member.userId}
                                className="flex items-center px-3 py-2 rounded-lg hover:bg-dark-700 transition"
                            >
                                <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                                    <span className="text-white font-semibold text-xs">
                                        {getDisplayName(member.userId).charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-medium text-white truncate">
                                        {getDisplayName(member.userId)}
                                    </div>
                                    {member.role && member.role !== 'member' && (
                                        <div className={`text-xs ${getRoleColor(member.role)}`}>
                                            {getRoleLabel(member.role)}
                                        </div>
                                    )}
                                </div>
                                <div className="w-2 h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default MemberList;