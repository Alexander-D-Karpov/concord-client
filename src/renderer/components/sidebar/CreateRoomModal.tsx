import React, { useState } from 'react';
import Modal from '../Modal';

interface CreateRoomModalProps {
    onClose: () => void;
    onCreate: (name: string, description: string, isPrivate: boolean) => Promise<void>;
}

const CreateRoomModal: React.FC<CreateRoomModalProps> = ({ onClose, onCreate }) => {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [isPrivate, setIsPrivate] = useState(false);
    const [creating, setCreating] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || creating) return;
        setCreating(true);
        try {
            await onCreate(name.trim(), description.trim(), isPrivate);
            onClose();
        } catch {
            setCreating(false);
        }
    };

    return (
        <Modal onClose={onClose}>
            <div className="p-6">
                <h3 className="text-gray-900 dark:text-white text-lg font-semibold mb-4">Create Room</h3>
                <form onSubmit={handleSubmit}>
                    <div className="space-y-4">
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Room name"
                            autoFocus
                            maxLength={50}
                        />
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                            placeholder="Description (optional)"
                            rows={3}
                            maxLength={200}
                        />
                        <div className="flex items-center justify-between">
                            <span className="text-gray-900 dark:text-white text-sm">Private Room</span>
                            <button
                                type="button"
                                onClick={() => setIsPrivate(!isPrivate)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                    isPrivate ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'
                                }`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                    isPrivate ? 'translate-x-6' : 'translate-x-1'
                                }`} />
                            </button>
                        </div>
                    </div>
                    <div className="flex space-x-2 mt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={creating}
                            className="flex-1 px-4 py-2 bg-gray-200 dark:bg-dark-700 hover:bg-gray-300 dark:hover:bg-dark-600 text-gray-900 dark:text-white rounded-lg transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!name.trim() || creating}
                            className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-gray-900 dark:text-white rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {creating ? 'Creating...' : 'Create'}
                        </button>
                    </div>
                </form>
            </div>
        </Modal>
    );
};

export default CreateRoomModal;