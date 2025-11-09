import React, { useEffect, useCallback, useState } from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useUsersStore } from '../hooks/useUsersStore';
import { Member } from '../types';
import InviteMemberModal from './InviteMemberModal';

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
    const { getUser, fetchUsers } = useUsersStore();
    const [showInviteModal, setShowInviteModal] = useState(false);
    const currentMembers = currentRoomId ? members[currentRoomId] || [] : [];
    const [lastRefresh, setLastRefresh] = useState(Date.now());

    const getDisplayName = useCallback((userId: string) => {
        if (userId === user?.id) {
            return user?.displayName || user?.handle || 'You';
        }

        const cachedUser = getUser(userId);
        if (cachedUser) {
            return cachedUser.displayName || cachedUser.handle;
        }

        return userId.split('-')[0];
    }, [user, getUser]);

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

            const userIds = mapped.map(m => m.userId);
            if (userIds.length > 0) {
                await fetchUsers(userIds);
            }
        } catch (err) {
            console.error('Failed to load members:', err);
        }
    }, [currentRoomId, setMembers, fetchUsers]);

    useEffect(() => {
        if (currentRoomId) {
            loadMembers();
        }
    }, [currentRoomId, loadMembers]);

    useEffect(() => {
        if (!currentRoomId) return;

        const interval = setInterval(() => {
            const now = Date.now();
            if (now - lastRefresh >= 60000) {
                loadMembers();
                setLastRefresh(now);
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [currentRoomId, lastRefresh, loadMembers]);

    useEffect(() => {
        if (!currentRoomId) return;

        const handleVoiceUserJoined = (e: CustomEvent) => {
            if (e.detail.room_id === currentRoomId) {
                loadMembers();
            }
        };

        const handleVoiceUserLeft = (e: CustomEvent) => {
            if (e.detail.room_id === currentRoomId) {
                loadMembers();
            }
        };

        window.addEventListener('voice-user-joined' as any, handleVoiceUserJoined);
        window.addEventListener('voice-user-left' as any, handleVoiceUserLeft);

        return () => {
            window.removeEventListener('voice-user-joined' as any, handleVoiceUserJoined);
            window.removeEventListener('voice-user-left' as any, handleVoiceUserLeft);
        };
    }, [currentRoomId, loadMembers]);

    const handleInviteMember = async (userId: string) => {
        if (!currentRoomId) return;
        try {
            await window.concord.inviteMember(currentRoomId, userId);
            await loadMembers();
        } catch (err) {
            console.error('Failed to invite member:', err);
            throw err;
        }
    };

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
            <div className="p-4 border-b border-dark-700 flex items-center justify-between flex-shrink-0">
                <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
                    Members — {currentMembers.length}
                </h3>
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="p-1.5 hover:bg-dark-700 rounded transition"
                    title="Invite Member"
                >
                    <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                </button>
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

            {showInviteModal && (
                <InviteMemberModal
                    roomId={currentRoomId}
                    onClose={() => setShowInviteModal(false)}
                    onInvite={handleInviteMember}
                />
            )}
        </div>
    );
};

export default MemberList;