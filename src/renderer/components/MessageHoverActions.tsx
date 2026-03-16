import React from 'react';
import { ReplyIcon, EmojiIcon, MoreVertIcon } from './icons';

interface MessageHoverActionsProps {
    onReply: () => void;
    onReactionPicker: (e: React.MouseEvent) => void;
    onMore: (e: React.MouseEvent) => void;
}

const MessageHoverActions: React.FC<MessageHoverActionsProps> = ({
                                                                     onReply,
                                                                     onReactionPicker,
                                                                     onMore,
                                                                 }) => (
    <div className="absolute -top-3 right-2 z-20 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-0.5 shadow-lg dark:border-dark-600 dark:bg-dark-700">
            <button
                type="button"
                onClick={onReply}
                className="rounded-md p-1.5 transition hover:bg-gray-100 dark:hover:bg-dark-600"
                title="Reply"
            >
                <ReplyIcon size="sm" className="text-gray-500 dark:text-dark-400" />
            </button>

            <button
                type="button"
                onClick={onReactionPicker}
                className="rounded-md p-1.5 transition hover:bg-gray-100 dark:hover:bg-dark-600"
                title="React"
            >
                <EmojiIcon size="sm" className="text-gray-500 dark:text-dark-400" />
            </button>

            <button
                type="button"
                onClick={onMore}
                className="rounded-md p-1.5 transition hover:bg-gray-100 dark:hover:bg-dark-600"
                title="More"
            >
                <MoreVertIcon size="sm" className="text-gray-500 dark:text-dark-400" />
            </button>
        </div>
    </div>
);

export default MessageHoverActions;