import React from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useUsersStore } from '../hooks/useUsersStore';
import { useAuthStore } from '../hooks/useAuthStore';

interface MessageReadReceiptsProps {
    roomId: string;
    messageId: string;
}

const MessageReadReceipts: React.FC<MessageReadReceiptsProps> = ({ roomId, messageId }) => {
    const { members } = useRoomsStore();
    const { getUser } = useUsersStore();
    const { user: currentUser } = useAuthStore();

    const roomMembers = members[roomId] || [];

    // Find members whose lastReadMessageId matches this messageId
    const readBy = roomMembers.filter(member =>
        member.userId !== currentUser?.id &&
        member.lastReadMessageId === messageId
    );

    if (readBy.length === 0) return null;

    // Only show up to 3 avatars, +X for rest
    const displayMembers = readBy.slice(0, 3);
    const remaining = readBy.length - 3;

    return (
        <div className="flex -space-x-1.5 mt-1 justify-end">
            {displayMembers.map(member => {
                const user = getUser(member.userId);
                const initial = (user?.displayName || member.nickname || member.userId)[0].toUpperCase();

                return (
                    <div
                        key={member.userId}
                        className="w-4 h-4 rounded-full border border-dark-900 bg-dark-600 flex items-center justify-center overflow-hidden"
                        title={`Read by ${user?.displayName || member.nickname}`}
                    >
                        {user?.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                            <span className="text-[8px] text-white font-medium">{initial}</span>
                        )}
                    </div>
                );
            })}
            {remaining > 0 && (
                <div className="w-4 h-4 rounded-full border border-dark-900 bg-dark-700 flex items-center justify-center">
                    <span className="text-[8px] text-dark-300 font-medium">+{remaining}</span>
                </div>
            )}
        </div>
    );
};

export default MessageReadReceipts;