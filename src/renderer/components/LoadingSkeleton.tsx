import React from 'react';

const Pulse: React.FC<{ className?: string }> = ({ className = '' }) => (
    <div className={`animate-pulse bg-gray-200 dark:bg-dark-700 rounded ${className}`} />
);

export const MessageSkeleton: React.FC = () => (
    <div className="flex items-start gap-3 p-2">
        <Pulse className="w-10 h-10 rounded-full flex-shrink-0" />
        <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
                <Pulse className="h-4 w-24" />
                <Pulse className="h-3 w-12" />
            </div>
            <Pulse className="h-4 w-3/4" />
            <Pulse className="h-4 w-1/2" />
        </div>
    </div>
);

export const MessageListSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => (
    <div className="space-y-4 p-4">
        {Array.from({ length: count }).map((_, i) => <MessageSkeleton key={i} />)}
    </div>
);

export const FriendCardSkeleton: React.FC = () => (
    <div className="flex items-center justify-between p-3 bg-gray-100 dark:bg-dark-800 rounded-xl">
        <div className="flex items-center gap-3">
            <Pulse className="w-10 h-10 rounded-full" />
            <div className="space-y-2">
                <Pulse className="h-4 w-28" />
                <Pulse className="h-3 w-20" />
            </div>
        </div>
        <Pulse className="h-8 w-20 rounded-xl" />
    </div>
);