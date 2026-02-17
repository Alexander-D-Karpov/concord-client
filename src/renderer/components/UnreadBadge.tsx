import React from 'react';

interface UnreadBadgeProps {
    count: number;
    className?: string;
}

const UnreadBadge: React.FC<UnreadBadgeProps> = ({ count, className = '' }) => {
    if (count <= 0) return null;

    const display = count > 99 ? '99+' : count.toString();

    return (
        <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full ${className}`}>
            {display}
        </span>
    );
};

export default UnreadBadge;