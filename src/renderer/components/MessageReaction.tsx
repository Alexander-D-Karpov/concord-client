import React from 'react';
import { PlusIcon } from './icons';
import type { MessageReaction } from '../utils/types';

interface MessageReactionsProps {
    messageId: string;
    reactions: MessageReaction[];
    onAddReaction: (emoji: string) => void;
    onRemoveReaction: (emoji: string) => void;
    onOpenPicker: (e: React.MouseEvent) => void;
}

const MessageReactions: React.FC<MessageReactionsProps> = ({
                                                               reactions,
                                                               onRemoveReaction,
                                                               onOpenPicker,
                                                           }) => {
    const grouped = reactions.reduce<Record<string, MessageReaction[]>>((acc, reaction) => {
        if (!acc[reaction.emoji]) acc[reaction.emoji] = [];
        acc[reaction.emoji].push(reaction);
        return acc;
    }, {});

    return (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {Object.entries(grouped).map(([emoji, items]) => (
                <button
                    key={emoji}
                    type="button"
                    onClick={() => onRemoveReaction(emoji)}
                    className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-100 px-2 py-1 text-sm transition hover:bg-gray-200 dark:border-dark-600 dark:bg-dark-700 dark:hover:bg-dark-600"
                >
                    <span>{emoji}</span>
                    <span className="text-xs text-gray-500 dark:text-dark-400">{items.length}</span>
                </button>
            ))}

            <button
                type="button"
                onClick={onOpenPicker}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-gray-300 bg-transparent transition hover:bg-gray-100 dark:border-dark-600 dark:hover:bg-dark-700"
                title="Add reaction"
            >
                <PlusIcon size="xs" className="text-gray-500 dark:text-dark-400" />
            </button>
        </div>
    );
};

export default MessageReactions;