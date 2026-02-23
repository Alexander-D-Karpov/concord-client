import React, { useState, useRef, useEffect, useMemo } from 'react';

interface ReactionPickerProps {
    onSelect: (emoji: string) => void;
    onClose: () => void;
    position?: { x: number; y: number };
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '👏', '😢', '🎉'];

const CATEGORIES: Record<string, { icon: string; emojis: string[] }> = {
    'People': {
        icon: '😀',
        emojis: [
            '😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊',
            '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜',
            '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑',
            '😶', '🫥', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴',
            '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳',
            '🥸', '😎', '🤓', '🧐', '😕', '🫤', '😟', '🙁', '😮', '😯', '😲', '😳',
            '🥺', '🥹', '😦', '😧', '😨', '😰', '😥', '😢', '😭', '😱', '😖', '😣',
            '😞', '😓', '😩', '😫', '🥱', '😤', '😡', '😠', '🤬', '😈', '👿', '💀',
            '💩', '🤡', '👹', '👺', '👻', '👽', '👾', '🤖',
        ],
    },
    'Gestures': {
        icon: '👋',
        emojis: [
            '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👌', '🤌', '🤏',
            '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️',
            '🫵', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '🫶', '👐', '🤲',
            '🤝', '🙏', '💪', '🦾',
        ],
    },
    'Hearts': {
        icon: '❤️',
        emojis: [
            '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '❤️‍🩹',
            '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟',
        ],
    },
    'Nature': {
        icon: '🌿',
        emojis: [
            '🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐮',
            '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🦅', '🦆', '🦉', '🐺', '🐗', '🐴',
            '🦄', '🐝', '🪱', '🐛', '🦋', '🐌', '🌸', '🌺', '🌻', '🌹', '🌷', '🌵',
            '🎄', '🌲', '🌳', '🍀', '🍁', '🍂', '🍃', '🌍', '🌈', '⭐', '🌙', '☀️',
        ],
    },
    'Food': {
        icon: '🍕',
        emojis: [
            '🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍒', '🍑', '🥭',
            '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🌶️', '🌽', '🥕', '🧅', '🥔', '🍞',
            '🥐', '🧀', '🍖', '🍗', '🥩', '🌭', '🍔', '🍟', '🍕', '🌮', '🌯', '🥗',
            '🍜', '🍣', '🍤', '🍩', '🍪', '🎂', '🍰', '🧁', '🍫', '🍬', '🍭', '🍿',
            '☕', '🍵', '🥤', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹',
        ],
    },
    'Activities': {
        icon: '⚽',
        emojis: [
            '⚽', '🏀', '🏈', '⚾', '🥎', '🎾', '🏐', '🏉', '🥏', '🎱', '🏓', '🏸',
            '🏒', '🥅', '⛳', '🏹', '🎣', '🤿', '🥊', '🥋', '🎿', '⛷️', '🏂', '🪂',
            '🏋️', '🤸', '🏆', '🥇', '🥈', '🥉', '🎮', '🕹️', '🎲', '🎯', '🎳', '🎪',
            '🎨', '🎬', '🎤', '🎧', '🎵', '🎶', '🎹', '🎸', '🎺', '🎻', '🪘', '🥁',
        ],
    },
    'Objects': {
        icon: '💡',
        emojis: [
            '🎉', '🎊', '🎈', '🎁', '🎀', '🏷️', '📦', '💡', '🔦', '🕯️', '💰', '💳',
            '💎', '⚙️', '🔧', '🔨', '🪛', '🔩', '⛏️', '🔫', '💣', '🪓', '🗡️', '⚔️',
            '🛡️', '🚬', '🪦', '🏺', '🔮', '📿', '🧿', '💈', '🔭', '🔬', '💊', '💉',
            '🩹', '🧬', '🦠', '🧪', '🌡️', '🧹', '🪣', '🧺', '🪤', '📱', '💻', '⌨️',
            '🖥️', '🖨️', '📷', '📹', '📺', '📻', '🎙️', '📡', '🔑', '🗝️', '🔒', '🔓',
        ],
    },
    'Symbols': {
        icon: '💯',
        emojis: [
            '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭',
            '❗', '❓', '❕', '❔', '‼️', '⁉️', '⚠️', '🚸', '🔅', '🔆', '⚜️', '🔱',
            '✅', '❌', '❎', '➕', '➖', '➗', '✖️', '💲', '💱', '©️', '®️', '™️',
            '🔴', '🟠', '🟡', '🟢', '🔵', '🟣', '⚫', '⚪', '🟤', '🔶', '🔷', '🔸',
        ],
    },
    'Flags': {
        icon: '🏁',
        emojis: [
            '🏁', '🚩', '🎌', '🏴', '🏳️', '🏳️‍🌈', '🏳️‍⚧️', '🏴‍☠️',
            '🇺🇸', '🇬🇧', '🇫🇷', '🇩🇪', '🇯🇵', '🇰🇷', '🇨🇳', '🇷🇺',
            '🇧🇷', '🇮🇳', '🇨🇦', '🇦🇺', '🇮🇹', '🇪🇸', '🇲🇽', '🇳🇱',
        ],
    },
};

const ALL_EMOJIS = Object.values(CATEGORIES).flatMap(c => c.emojis);

const ReactionPicker: React.FC<ReactionPickerProps> = ({ onSelect, onClose }) => {
    const [activeCategory, setActiveCategory] = useState('People');
    const [search, setSearch] = useState('');
    const pickerRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    const gridRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        searchRef.current?.focus();
    }, []);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    const filteredEmojis = useMemo(() => {
        if (!search.trim()) return null;
        const q = search.toLowerCase();
        return ALL_EMOJIS.filter(e => e.includes(q));
    }, [search]);

    const displayEmojis = filteredEmojis || CATEGORIES[activeCategory]?.emojis || [];

    const handleSelect = (emoji: string) => {
        onSelect(emoji);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50" onClick={onClose}>
            <div
                ref={pickerRef}
                className="absolute bottom-16 right-4 bg-dark-800 rounded-xl border border-dark-600 shadow-2xl w-[352px] flex flex-col overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
                style={{ maxHeight: '420px' }}
            >
                <div className="px-3 pt-3 pb-2 flex flex-wrap gap-1 border-b border-dark-700">
                    {QUICK_REACTIONS.map(emoji => (
                        <button
                            key={emoji}
                            onClick={() => handleSelect(emoji)}
                            className="w-9 h-9 flex items-center justify-center text-xl hover:bg-dark-600 rounded-lg transition active:scale-90"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>

                <div className="px-3 py-2">
                    <div className="relative">
                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                            ref={searchRef}
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search emoji..."
                            className="w-full pl-8 pr-3 py-1.5 bg-dark-700 border border-dark-600 rounded-lg text-white text-sm placeholder-dark-400 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                    </div>
                </div>

                {!search && (
                    <div className="flex px-1 border-b border-dark-700 overflow-x-auto scrollbar-none">
                        {Object.entries(CATEGORIES).map(([name, cat]) => (
                            <button
                                key={name}
                                onClick={() => {
                                    setActiveCategory(name);
                                    gridRef.current?.scrollTo({ top: 0 });
                                }}
                                className={`flex-shrink-0 px-2 py-1.5 text-lg transition rounded-t-lg ${
                                    activeCategory === name ? 'bg-dark-600' : 'hover:bg-dark-700'
                                }`}
                                title={name}
                            >
                                {cat.icon}
                            </button>
                        ))}
                    </div>
                )}

                <div ref={gridRef} className="flex-1 overflow-y-auto p-2 min-h-0" style={{ maxHeight: '220px' }}>
                    {!search && (
                        <div className="text-xs font-semibold text-dark-400 uppercase tracking-wider px-1 mb-1">
                            {activeCategory}
                        </div>
                    )}
                    {search && filteredEmojis?.length === 0 && (
                        <div className="text-center py-8 text-dark-400 text-sm">No emoji found</div>
                    )}
                    <div className="grid grid-cols-8 gap-0.5">
                        {displayEmojis.map((emoji, i) => (
                            <button
                                key={`${emoji}-${i}`}
                                onClick={() => handleSelect(emoji)}
                                className="w-9 h-9 flex items-center justify-center text-xl hover:bg-dark-600 rounded-lg transition active:scale-90"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ReactionPicker;