import React from 'react';
import { Message } from '../types';
import { useUsersStore } from '../hooks/useUsersStore';

interface MessageReplyProps {
    replyTo: Message;
    onCancel?: () => void;
}

const MessageReply: React.FC<MessageReplyProps> = ({ replyTo, onCancel }) => {
    const { getUser } = useUsersStore();

    const getAuthorName = () => {
        const cachedUser = getUser(replyTo.authorId);
        return cachedUser?.displayName || cachedUser?.handle || replyTo.authorId.split('-')[0];
    };

    return (
        <div className="flex items-start space-x-2 px-3 py-2 bg-dark-800 border-l-2 border-primary-600 rounded">
            <div className="flex-1 min-w-0">
                <div className="text-xs text-primary-400 font-medium mb-1">
                    Replying to {getAuthorName()}
                </div>
                <div className="text-sm text-dark-300 truncate">
                    {replyTo.content}
                </div>
            </div>
            {onCancel && (
                <button
                    onClick={onCancel}
                    className="flex-shrink-0 p-1 hover:bg-dark-700 rounded transition"
                >
                    <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            )}
        </div>
    );
};

export default MessageReply;