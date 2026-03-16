import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ReactionPickerProps {
    anchor: { x: number; y: number } | null;
    onSelect: (emoji: string) => void;
    onClose: () => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉'];
const ALL_REACTIONS = [
    '😀', '😄', '😁', '😅', '🤣', '🙂', '😉', '😍', '😘', '😎',
    '🤔', '😴', '😭', '😡', '🥳', '🤯', '👀', '👏', '🙌', '💀',
    '👍', '👎', '❤️', '🔥', '🎉', '🙏', '✅', '❌', '💯', '✨',
];

const PICKER_WIDTH = 320;
const PICKER_HEIGHT = 360;
const VIEWPORT_PADDING = 12;

const ReactionPicker: React.FC<ReactionPickerProps> = ({ anchor, onSelect, onClose }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [search, setSearch] = useState('');
    const [position, setPosition] = useState({ left: 0, top: 0 });

    useEffect(() => {
        const handlePointerDown = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };

        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleEscape);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onClose]);

    useLayoutEffect(() => {
        if (!anchor) return;

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        let left = anchor.x;
        let top = anchor.y + 10;

        if (left + PICKER_WIDTH > viewportWidth - VIEWPORT_PADDING) {
            left = viewportWidth - PICKER_WIDTH - VIEWPORT_PADDING;
        }

        if (left < VIEWPORT_PADDING) {
            left = VIEWPORT_PADDING;
        }

        if (top + PICKER_HEIGHT > viewportHeight - VIEWPORT_PADDING) {
            top = anchor.y - PICKER_HEIGHT - 10;
        }

        if (top < VIEWPORT_PADDING) {
            top = VIEWPORT_PADDING;
        }

        setPosition({ left, top });
    }, [anchor]);

    if (!anchor) return null;

    const filtered = ALL_REACTIONS.filter((emoji) =>
        !search.trim() || emoji.includes(search.trim())
    );

    return createPortal(
        <div
            className="fixed inset-0 z-[1200]"
            aria-hidden={false}
        >
            <div
                ref={ref}
                className="absolute w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-dark-600 dark:bg-dark-700"
                style={{ left: position.left, top: position.top }}
            >
                <div className="flex items-center gap-1 border-b border-gray-200 px-3 py-2 dark:border-dark-600">
                    {QUICK_REACTIONS.map((emoji) => (
                        <button
                            key={emoji}
                            type="button"
                            onClick={() => {
                                onSelect(emoji);
                                onClose();
                            }}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition hover:bg-gray-100 dark:hover:bg-dark-600"
                        >
                            {emoji}
                        </button>
                    ))}
                </div>

                <div className="border-b border-gray-200 p-3 dark:border-dark-600">
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search emoji..."
                        className="input-base h-10 w-full"
                    />
                </div>

                <div className="max-h-64 overflow-y-auto p-2">
                    <div className="grid grid-cols-6 gap-1">
                        {filtered.map((emoji) => (
                            <button
                                key={emoji}
                                type="button"
                                onClick={() => {
                                    onSelect(emoji);
                                    onClose();
                                }}
                                className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl transition hover:bg-gray-100 dark:hover:bg-dark-600"
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default ReactionPicker;