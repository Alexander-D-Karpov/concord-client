import React, { useMemo } from 'react';
import type { DMMessage } from '../../utils/types';
import DMMessageItem from './DMMessageItem';
import { isWithinMinutes } from '../../utils/format';

export interface DMMessageGroupData {
    id: string;
    authorId: string;
    messages: DMMessage[];
}

const GROUP_WINDOW_MINUTES = 5;

export function groupDMMessages(messages: DMMessage[]): DMMessageGroupData[] {
    const groups: DMMessageGroupData[] = [];

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

interface Props {
    group: DMMessageGroupData;
    allMessages: DMMessage[];
    currentUserId: string;
    otherUserId: string;
    onContextMenu: (e: React.MouseEvent, message: DMMessage) => void;
    onAddReaction: (messageId: string, emoji: string) => void;
    onRemoveReaction: (messageId: string, emoji: string) => void;
    onOpenReactionPicker: (messageId: string, e: React.MouseEvent) => void;
}

const DMMessageGroup: React.FC<Props> = ({
                                             group,
                                             allMessages,
                                             currentUserId,
                                             otherUserId,
                                             onContextMenu,
                                             onAddReaction,
                                             onRemoveReaction,
                                             onOpenReactionPicker,
                                         }) => {
    const messagesById = useMemo(() => {
        const map = new Map<string, DMMessage>();
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
                    <DMMessageItem
                        key={message.id}
                        message={message}
                        isOwn={message.authorId === currentUserId}
                        isFirstInGroup={index === 0}
                        replyToMessage={replyToMessage}
                        otherUserId={otherUserId}
                        onContextMenu={onContextMenu}
                        onAddReaction={onAddReaction}
                        onRemoveReaction={onRemoveReaction}
                        onOpenReactionPicker={onOpenReactionPicker}
                    />
                );
            })}
        </div>
    );
};

export default DMMessageGroup;