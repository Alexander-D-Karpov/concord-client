import React from 'react';

interface EmptyStateProps {
    icon: string;
    title: string;
    description: string;
    action?: { label: string; onClick: () => void };
}

const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
    <div className="flex items-center justify-center h-full">
        <div className="text-center max-w-xs">
            <div className="text-6xl mb-4">{icon}</div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
            <p className="text-gray-500 dark:text-dark-400 mb-4">{description}</p>
            {action && (
                <button
                    onClick={action.onClick}
                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-gray-900 dark:text-white rounded-lg transition"
                >
                    {action.label}
                </button>
            )}
        </div>
    </div>
);

export default EmptyState;