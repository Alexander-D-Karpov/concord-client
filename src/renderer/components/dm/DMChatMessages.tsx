import React, { useMemo } from 'react';
import type { DMMessage } from '../../utils/types';
import DMMessageGroup, { groupDMMessages } from './DMMessageGroup';
import { MessageListSkeleton } from '../LoadingSkeleton';
import Avatar from '../Avatar';

interface Props {
    messages: DMMessage[];
    loading: boolean;
    currentUserId: string;
    otherUserId: string;
    otherUserName: string;
    currentUserName: string;
    scrollContainerRef: React.RefObject<HTMLDivElement>;
    messagesEndRef: React.RefObject<HTMLDivElement>;
    onContextMenu: (e: React.MouseEvent, message: DMMessage) => void;
    onAddReaction: (messageId: string, emoji: string) => void;
    onRemoveReaction: (messageId: string, emoji: string) => void;
    onOpenReactionPicker: (messageId: string, e: React.MouseEvent) => void;
}

const DMChatMessages: React.FC<Props> = ({
                                             messages,
                                             loading,
                                             currentUserId,
                                             otherUserId,
                                             otherUserName,
                                             scrollContainerRef,
                                             messagesEndRef,
                                             onContextMenu,
                                             onAddReaction,
                                             onRemoveReaction,
                                             onOpenReactionPicker,
                                         }) => {
    const groups = useMemo(() => groupDMMessages(messages), [messages]);

    return (
        <div
            ref={scrollContainerRef}
            className="flex-1 min-h-0 overflow-y-auto p-4"
        >
            {loading ? (
                <MessageListSkeleton count={6} />
            ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                        <div className="mx-auto w-fit">
                            <Avatar
                                userId={otherUserId}
                                name={otherUserName}
                                size="xl"
                                showStatus={false}
                            />
                        </div>
                        <h3 className="mt-4 mb-2 text-xl font-semibold text-gray-900 dark:text-white">
                            {otherUserName}
                        </h3>
                        <p className="text-gray-500 dark:text-dark-400">
                            Start of your conversation with {otherUserName}
                        </p>
                    </div>
                </div>
            ) : (
                <div className="space-y-0">
                    {groups.map((group) => (
                        <DMMessageGroup
                            key={group.id}
                            group={group}
                            allMessages={messages}
                            currentUserId={currentUserId}
                            otherUserId={otherUserId}
                            onContextMenu={onContextMenu}
                            onAddReaction={onAddReaction}
                            onRemoveReaction={onRemoveReaction}
                            onOpenReactionPicker={onOpenReactionPicker}
                        />
                    ))}
                </div>
            )}

            <div ref={messagesEndRef} />
        </div>
    );
};

export default DMChatMessages;