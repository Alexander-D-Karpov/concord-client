import React, { useMemo } from 'react';
import type { Message } from '../../utils/types';
import MessageItem from './MessageItem';
import { isWithinMinutes } from '../../utils/format';

export interface MessageGroupData {
    id: string;
    authorId: string;
    messages: Message[];
}

const GROUP_WINDOW_MINUTES = 5;

export function groupMessages(messages: Message[]): MessageGroupData[] {
    const groups: MessageGroupData[] = [];

    for (const message of messages) {
        const lastGroup = groups[groups.length - 1];
        const previousMessage = lastGroup?.messages[lastGroup.messages.length - 1];

        const canGroupWithPrevious =
            !!lastGroup &&
            !!previousMessage &&
            lastGroup.authorId === message.authorId &&
            !message.deleted &&
            !message.replyToId &&
            !previousMessage.deleted &&
            !previousMessage.replyToId &&
            isWithinMinutes(previousMessage.createdAt, message.createdAt, GROUP_WINDOW_MINUTES);

        if (canGroupWithPrevious) {
            lastGroup.messages.push(message);
        } else {
            groups.push({
                id: message.id,
                authorId: message.authorId,
                messages: [message],
            });
        }
    }

    return groups;
}

interface MessageGroupProps {
    group: MessageGroupData;
    allMessages: Message[];
    roomId: string;
    getDisplayName: (userId: string) => string;
    onContextMenu: (e: React.MouseEvent, message: Message) => void;
    onAvatarClick: (userId: string, name: string) => void;
    onAddReaction: (messageId: string, emoji: string) => void;
    onRemoveReaction: (messageId: string, emoji: string) => void;
    onOpenReactionPicker: (messageId: string, e: React.MouseEvent) => void;
    onReply?: (message: Message) => void;
}

const MessageGroup: React.FC<MessageGroupProps> = ({
                                                       group,
                                                       allMessages,
                                                       roomId,
                                                       getDisplayName,
                                                       onContextMenu,
                                                       onAvatarClick,
                                                       onAddReaction,
                                                       onRemoveReaction,
                                                       onOpenReactionPicker,
                                                       onReply,
                                                   }) => {
    const messagesById = useMemo(() => {
        const map = new Map<string, Message>();
        for (const message of allMessages) {
            map.set(message.id, message);
        }
        return map;
    }, [allMessages]);

    return (
        <div className="space-y-0">
            {group.messages.map((message, index) => {
                const replyToMessage = message.replyToId
                    ? messagesById.get(message.replyToId) ?? null
                    : null;

                return (
                    <MessageItem
                        key={message.id}
                        message={message}
                        isFirstInGroup={index === 0}
                        replyToMessage={replyToMessage}
                        roomId={roomId}
                        getDisplayName={getDisplayName}
                        onContextMenu={onContextMenu}
                        onAvatarClick={onAvatarClick}
                        onAddReaction={onAddReaction}
                        onRemoveReaction={onRemoveReaction}
                        onOpenReactionPicker={onOpenReactionPicker}
                        onReply={onReply}
                    />
                );
            })}
        </div>
    );
};

export default MessageGroup;