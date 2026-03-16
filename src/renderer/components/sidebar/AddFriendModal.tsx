import React, { useState, useEffect } from 'react';
import Modal from '../Modal';
import { CloseIcon } from '../icons';
import Avatar from '../Avatar';
import { Friend } from '../../utils/types';

interface AddFriendModalProps {
    currentUserId?: string;
    friends: Friend[];
    onClose: () => void;
    onSendRequest: (userId: string) => Promise<void>;
}

const AddFriendModal: React.FC<AddFriendModalProps> = ({ currentUserId, friends, onClose, onSendRequest }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [sendingTo, setSendingTo] = useState<string | null>(null);

    useEffect(() => {
        const searchUsers = async () => {
            if (searchQuery.length < 2) { setSearchResults([]); return; }
            setSearching(true);
            try {
                const response = await window.concord.searchUsers(searchQuery, 10);
                setSearchResults(response.users || []);
            } catch {
                setSearchResults([]);
            } finally {
                setSearching(false);
            }
        };
        const timeout = setTimeout(searchUsers, 300);
        return () => clearTimeout(timeout);
    }, [searchQuery]);

    const handleSend = async (userId: string) => {
        setSendingTo(userId);
        try {
            await onSendRequest(userId);
            onClose();
        } catch {
            setSendingTo(null);
        }
    };

    return (
        <Modal onClose={onClose}>
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Add Friend</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-dark-700 rounded transition">
                        <CloseIcon className="text-gray-400 dark:text-dark-400 hover:text-gray-900 dark:hover:text-white" />
                    </button>
                </div>

                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search users by handle..."
                    className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
                    autoFocus
                />

                <div className="max-h-80 overflow-y-auto">
                    {searching ? (
                        <div className="text-center py-8 text-gray-400 dark:text-dark-400">
                            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                            <p>Searching...</p>
                        </div>
                    ) : searchResults.length === 0 ? (
                        <div className="text-center py-8 text-gray-400 dark:text-dark-400">
                            {searchQuery.length < 2 ? 'Type at least 2 characters to search' : 'No users found'}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {searchResults.map((searchUser) => {
                                const isSelf = searchUser.id === currentUserId;
                                const isFriend = friends.some(f => f.userId === searchUser.id);

                                return (
                                    <div
                                        key={searchUser.id}
                                        className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-700 hover:bg-gray-100 dark:hover:bg-dark-600 rounded-lg transition gap-3"
                                    >
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <Avatar
                                                userId={searchUser.id}
                                                name={searchUser.display_name || searchUser.handle}
                                                src={searchUser.avatar_url}
                                                size="md"
                                                showStatus={false}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <div className="text-gray-900 dark:text-white font-medium truncate">
                                                    {searchUser.display_name || searchUser.handle}
                                                </div>
                                                <div className="text-gray-500 dark:text-dark-400 text-sm truncate">
                                                    @{searchUser.handle}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex-shrink-0">
                                            {isSelf ? (
                                                <span className="text-gray-400 dark:text-dark-500 text-sm px-3">You</span>
                                            ) : isFriend ? (
                                                <span className="text-green-400 text-sm px-3">Friend</span>
                                            ) : (
                                                <button
                                                    onClick={() => handleSend(searchUser.id)}
                                                    disabled={sendingTo === searchUser.id}
                                                    className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-gray-900 dark:text-white text-sm rounded-lg transition"
                                                >
                                                    {sendingTo === searchUser.id ? 'Sending...' : 'Add'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default AddFriendModal;