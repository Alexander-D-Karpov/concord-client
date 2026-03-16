import React from 'react';
import FriendsList from '../components/FriendsList';
import { useNavigate } from 'react-router-dom';

const Friends: React.FC = () => {
    const navigate = useNavigate();

    return (
        <div className="flex h-screen bg-white dark:bg-dark-900">
            <div className="flex-1 flex flex-col">
                <div className="p-4 border-b border-gray-200 dark:border-dark-700">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center text-gray-500 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white transition"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Chat
                    </button>
                </div>
                <FriendsList />
            </div>
        </div>
    );
};

export default Friends;