import React, { useState, useEffect } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import { CloseIcon, SpinnerIcon } from './icons';

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
            if (searchQuery.length < 2) { setSearchResults([]); return; }
            setLoading(true); setError('');
            try {
                const response = await window.concord.searchUsers(searchQuery, 10);
                setSearchResults(response.users || []);
            } catch (err: any) {
                setError(err?.message || 'Failed to search users');
            } finally { setLoading(false); }
        };
        const timeout = setTimeout(searchUsers, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const handleInvite = async (userId: string) => {
        try { await onInvite(userId); onClose(); } catch (err: any) { setError(err?.message || 'Failed to invite user'); }
    };

    return (
        <Modal onClose={onClose}>
            <div className="p-6 border-b border-gray-200 dark:border-dark-700">
                <div className="flex items-center justify-between">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Invite Member</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition">
                        <CloseIcon className="text-gray-400 dark:text-dark-400" />
                    </button>
                </div>
            </div>

            <div className="p-6">
                <input
                    type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users..."
                    className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                    autoFocus
                />

                {error && (
                    <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500 text-red-500 text-sm rounded-lg">{error}</div>
                )}

                <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="text-center py-8 text-gray-400 dark:text-dark-400">
                            <SpinnerIcon className="mx-auto mb-3" />
                            <p>Searching...</p>
                        </div>
                    ) : searchResults.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 dark:text-dark-400">
                            {searchQuery.length < 2 ? 'Type at least 2 characters to search' : 'No users found'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {searchResults.map((u) => (
                                <div key={u.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700 hover:bg-gray-100 dark:hover:bg-dark-600 rounded-lg transition">
                                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                                        <Avatar userId={u.id} name={u.displayName || u.handle} src={u.avatarUrl} size="md" showStatus={false} />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-gray-900 dark:text-white font-medium truncate">{u.displayName || u.handle}</div>
                                            <div className="text-gray-500 dark:text-dark-400 text-sm truncate">@{u.handle}</div>
                                        </div>
                                    </div>
                                    <button onClick={() => handleInvite(u.id)} className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-gray-900 dark:text-white text-sm rounded-lg transition flex-shrink-0">
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