import React from 'react';

interface UnreadSeparatorProps {
    count: number;
}

const UnreadSeparator: React.FC<UnreadSeparatorProps> = ({ count }) => {
    const label = `${count} new message${count !== 1 ? 's' : ''}`;

    return (
        <div className="sticky top-0 z-10 px-4 py-2">
            <div className="flex items-center gap-3 rounded-full bg-red-500/10 backdrop-blur-sm">
                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-red-500/50 to-red-500/20" />
                <span className="flex-shrink-0 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-500">
                    {label}
                </span>
                <div className="h-px flex-1 bg-gradient-to-l from-transparent via-red-500/50 to-red-500/20" />
            </div>
        </div>
    );
};

export default UnreadSeparator;