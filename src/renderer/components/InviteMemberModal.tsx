import React, { useState, useEffect } from 'react';
import Modal from './Modal';

interface User {
    id: string;
    handle: string;
    displayName?: string;
    avatarUrl?: string;
}

interface InviteMemberModalProps {
    roomId: string;
    onClose: () => void;
    onInvite: (userId: string) => void;
}

const InviteMemberModal: React.FC<InviteMemberModalProps> = ({ roomId, onClose, onInvite }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const searchUsers = async () => {
            if (searchQuery.length < 2) {
                setSearchResults([]);
                return;
            }

            setLoading(true);
            setError('');

            try {
                const response = await window.concord.searchUsers(searchQuery, 10);
                setSearchResults(response.users || []);
            } catch (err: any) {
                setError(err?.message || 'Failed to search users');
            } finally {
                setLoading(false);
            }
        };

        const timeoutId = setTimeout(searchUsers, 300);
        return () => clearTimeout(timeoutId);
    }, [searchQuery]);

    const handleInvite = async (userId: string) => {
        try {
            await onInvite(userId);
            onClose();
        } catch (err: any) {
            setError(err?.message || 'Failed to invite user');
        }
    };

    return (
        <Modal onClose={onClose}>
            <div className="p-6 border-b border-dark-700">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-white">Invite Member</h3>
                    <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg transition">
                        <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            </div>

            <div className="p-6">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                    autoFocus
                />

                {error && (
                    <div className="mb-4 px-4 py-3 bg-red-500 bg-opacity-10 border border-red-500 text-red-500 text-sm rounded-lg">
                        {error}
                    </div>
                )}

                <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="text-center py-8 text-dark-400">
                            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            <p>Searching...</p>
                        </div>
                    ) : searchResults.length === 0 ? (
                        <div className="text-center py-8 text-dark-400">
                            {searchQuery.length < 2 ? (
                                <p>Type at least 2 characters to search</p>
                            ) : (
                                <p>No users found</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {searchResults.map((user) => (
                                <div
                                    key={user.id}
                                    className="flex items-center justify-between p-3 bg-dark-700 hover:bg-dark-600 rounded-lg transition"
                                >
                                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                                        <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                                            <span className="text-white font-semibold">
                                                {(user.displayName || user.handle).charAt(0).toUpperCase()}
                                            </span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-white font-medium truncate">
                                                {user.displayName || user.handle}
                                            </div>
                                            <div className="text-dark-400 text-sm truncate">
                                                @{user.handle}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleInvite(user.id)}
                                        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition flex-shrink-0"
                                    >
                                        Invite
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default InviteMemberModal;