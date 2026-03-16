import React, { useMemo } from 'react';
import type { Message } from '../../utils/types';
import MessageGroup, { groupMessages } from './MessageGroup';
import UnreadSeparator from '../UnreadSeparator';
import { MessageListSkeleton } from '../LoadingSkeleton';
import EmptyState from '../EmptyState';
import { useNotificationStore } from '../../hooks/useNotificationStore';

interface ChatMessagesProps {
    messages: Message[];
    roomId: string;
    loading: boolean;
    scrollContainerRef: React.RefObject<HTMLDivElement>;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    getDisplayName: (userId: string) => string;
    onContextMenu: (e: React.MouseEvent, message: Message) => void;
    onAvatarClick: (userId: string, name: string) => void;
    onAddReaction: (messageId: string, emoji: string) => void;
    onRemoveReaction: (messageId: string, emoji: string) => void;
    onOpenReactionPicker: (messageId: string, e: React.MouseEvent) => void;
    onReply?: (message: Message) => void;
}

const ChatMessages: React.FC<ChatMessagesProps> = ({
                                                       messages,
                                                       roomId,
                                                       loading,
                                                       scrollContainerRef,
                                                       messagesEndRef,
                                                       getDisplayName,
                                                       onContextMenu,
                                                       onAvatarClick,
                                                       onAddReaction,
                                                       onRemoveReaction,
                                                       onOpenReactionPicker,
                                                       onReply,
                                                   }) => {
    const groups = useMemo(() => groupMessages(messages), [messages]);
    const lastReadId = useNotificationStore((state) => state.getLastRead('room', roomId));

    const messageIndexById = useMemo(() => {
        const map = new Map<string, number>();
        messages.forEach((message, index) => {
            map.set(message.id, index);
        });
        return map;
    }, [messages]);

    const lastReadIndex = useMemo(() => {
        if (!lastReadId) return -1;
        return messageIndexById.get(lastReadId) ?? -1;
    }, [lastReadId, messageIndexById]);

    const firstUnreadIndex = lastReadIndex >= 0 ? lastReadIndex + 1 : -1;
    const unreadCount = firstUnreadIndex >= 0 ? Math.max(messages.length - firstUnreadIndex, 0) : 0;

    return (
        <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto px-4 py-2"
        >
            {loading ? (
                <MessageListSkeleton count={8} />
            ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                    <EmptyState
                        icon="👋"
                        title="No messages yet"
                        description="Start the conversation!"
                    />
                </div>
            ) : (
                <div className="space-y-1">
                    {groups.map((group) => {
                        const firstGroupMessage = group.messages[0];
                        const groupStartIndex = firstGroupMessage
                            ? messageIndexById.get(firstGroupMessage.id)
                            : undefined;

                        const showUnreadSeparator =
                            unreadCount > 0 &&
                            groupStartIndex !== undefined &&
                            groupStartIndex === firstUnreadIndex;

                        return (
                            <React.Fragment key={group.id}>
                                {showUnreadSeparator && <UnreadSeparator count={unreadCount} />}

                                <MessageGroup
                                    group={group}
                                    allMessages={messages}
                                    roomId={roomId}
                                    getDisplayName={getDisplayName}
                                    onContextMenu={onContextMenu}
                                    onAvatarClick={onAvatarClick}
                                    onAddReaction={onAddReaction}
                                    onRemoveReaction={onRemoveReaction}
                                    onOpenReactionPicker={onOpenReactionPicker}
                                    onReply={onReply}
                                />
                            </React.Fragment>
                        );
                    })}
                </div>
            )}

            <div ref={messagesEndRef} />
        </div>
    );
};

export default ChatMessages;