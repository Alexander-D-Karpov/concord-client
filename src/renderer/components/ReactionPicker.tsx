import React, { useState } from 'react';

interface ReactionPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

const EMOJI_CATEGORIES = {
    'Frequently Used': ['👍', '❤️', '😂', '😮', '😢', '😡', '👏', '🎉'],
    'Smileys': ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗'],
    'Gestures': ['👍', '👎', '👊', '✊', '🤛', '🤜', '🤞', '✌️', '🤟', '🤘', '👌', '🤌', '🤏', '👈', '👉', '👆', '👇', '☝️'],
    'Objects': ['🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱'],
};

const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose }) => {
    const [activeCategory, setActiveCategory] = useState<string>('Frequently Used');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="absolute inset-0 bg-black bg-opacity-50"></div>

            <div
                className="relative bg-dark-800 rounded-lg border border-dark-700 p-4 max-w-sm w-full max-h-96 overflow-hidden flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-semibold">Add Reaction</h3>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-dark-700 rounded transition"
                    >
                        <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex space-x-1 mb-3 overflow-x-auto">
                    {Object.keys(EMOJI_CATEGORIES).map((category) => (
                        <button
                            key={category}
                            onClick={() => setActiveCategory(category)}
                            className={`px-3 py-1 text-xs rounded-full whitespace-nowrap transition ${
                                activeCategory === category
                                    ? 'bg-primary-600 text-white'
                                    : 'bg-dark-700 text-dark-300 hover:bg-dark-600'
                            }`}
                        >
                            {category}
                        </button>
                    ))}
                </div>

                <div className="grid grid-cols-8 gap-1 overflow-y-auto flex-1">
                    {EMOJI_CATEGORIES[activeCategory as keyof typeof EMOJI_CATEGORIES].map((emoji) => (
                        <button
                            key={emoji}
                            onClick={() => {
                                onSelect(emoji);
                                onClose();
                            }}
                            className="p-2 text-2xl hover:bg-dark-700 rounded transition flex items-center justify-center"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ReactionPicker;