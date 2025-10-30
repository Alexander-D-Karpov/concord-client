import React from 'react';
import { MessageReaction } from '../types';
import { useAuthStore } from '../hooks/useAuthStore';

interface MessageReactionsProps {
    messageId: string;
    reactions: MessageReaction[];
    onAddReaction: () => void;
    onRemoveReaction: (emoji: string) => void;
}

const MessageReactions: React.FC<MessageReactionsProps> = ({
                                                               messageId,
                                                               reactions,
                                                               onAddReaction,
                                                               onRemoveReaction,
                                                           }) => {
    const { user } = useAuthStore();

    const groupedReactions = reactions.reduce((acc, reaction) => {
        if (!acc[reaction.emoji]) {
            acc[reaction.emoji] = [];
        }
        acc[reaction.emoji].push(reaction);
        return acc;
    }, {} as Record<string, MessageReaction[]>);

    if (reactions.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-wrap gap-1 mt-2">
            {Object.entries(groupedReactions).map(([emoji, reactionList]) => {
                const userReaction = reactionList.find(r => r.userId === user?.id);
                const count = reactionList.length;

                return (
                    <button
                        key={emoji}
                        onClick={() => {
                            if (userReaction) {
                                onRemoveReaction(emoji);
                            } else {
                                onAddReaction();
                            }
                        }}
                        className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-sm transition ${
                            userReaction
                                ? 'bg-primary-600 text-white'
                                : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                        }`}
                        title={reactionList.map(r => r.userId.split('-')[0]).join(', ')}
                    >
                        <span>{emoji}</span>
                        <span className="font-medium">{count}</span>
                    </button>
                );
            })}

            <button
                onClick={onAddReaction}
                className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-dark-700 hover:bg-dark-600 text-dark-400 hover:text-white transition"
                title="Add reaction"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
            </button>
        </div>
    );
};

export default MessageReactions;