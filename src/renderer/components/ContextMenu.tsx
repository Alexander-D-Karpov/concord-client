import React, { useEffect, useRef } from 'react';

export interface ContextMenuItem {
    label: string;
    icon?: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    separator?: boolean;
    disabled?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    items: ContextMenuItem[];
    onClose: () => void;
}

const ContextMenu: React.FC<ContextMenuProps> = ({ x, y, items, onClose }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
        };
        const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => { document.removeEventListener('mousedown', handleClickOutside); document.removeEventListener('keydown', handleEscape); };
    }, [onClose]);

    useEffect(() => {
        if (!menuRef.current) return;
        const rect = menuRef.current.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        let ax = x, ay = y;
        if (x + rect.width > vw) ax = vw - rect.width - 10;
        if (y + rect.height > vh) ay = vh - rect.height - 10;
        if (ax < 10) ax = 10;
        if (ay < 10) ay = 10;
        menuRef.current.style.left = `${ax}px`;
        menuRef.current.style.top = `${ay}px`;
    }, [x, y]);

    return (
        <div ref={menuRef} className="fixed z-50 bg-white dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg shadow-2xl py-2 min-w-[200px]" style={{ left: x, top: y }}>
            {items.map((item, index) =>
                item.separator ? (
                    <div key={index} className="h-px bg-gray-200 dark:bg-dark-600 my-1" />
                ) : (
                    <button
                        key={index}
                        onClick={() => { if (!item.disabled) { item.onClick(); onClose(); } }}
                        disabled={item.disabled}
                        className={`w-full px-3 py-2 text-left flex items-center space-x-2 transition ${
                            item.disabled ? 'opacity-50 cursor-not-allowed'
                                : item.danger ? 'hover:bg-red-50 dark:hover:bg-red-600 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-white'
                                    : 'hover:bg-gray-100 dark:hover:bg-dark-600 text-gray-900 dark:text-white'
                        }`}
                    >
                        {item.icon && <span className="flex-shrink-0">{item.icon}</span>}
                        <span className="flex-1 text-sm">{item.label}</span>
                    </button>
                )
            )}
        </div>
    );
};

export default ContextMenu;