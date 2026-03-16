import React, { useState } from 'react';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { CloseIcon } from './icons';
import type { Room } from '../utils/types';

interface RoomSettingsModalProps {
    room: Room;
    onClose: () => void;
}

const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({ room, onClose }) => {
    const [name, setName] = useState(room.name);
    const [description, setDescription] = useState(room.description || '');
    const [isPrivate, setIsPrivate] = useState(room.isPrivate || false);
    const [saving, setSaving] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const { updateRoom, removeRoom } = useRoomsStore();

    const handleSave = async () => {
        setSaving(true);
        try {
            await window.concord.updateRoom(room.id, name.trim() || undefined, description.trim() || undefined, isPrivate);
            updateRoom({ ...room, name: name.trim(), description: description.trim(), isPrivate });
            onClose();
        } catch (err: any) {
            console.error('Failed to update room:', err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            await window.concord.deleteRoom(room.id);
            removeRoom(room.id);
            onClose();
        } catch (err: any) {
            console.error('Failed to delete room:', err);
        }
    };

    return (
        <Modal onClose={onClose} className="max-w-md">
            <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">Room Settings</h3>
                    <button onClick={onClose} className="btn-ghost p-1.5">
                        <CloseIcon className="text-gray-400 dark:text-dark-400" />
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-1.5">Name</label>
                        <input
                            type="text" value={name} onChange={(e) => setName(e.target.value)}
                            className="input-base" maxLength={50}
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-1.5">Description</label>
                        <textarea
                            value={description} onChange={(e) => setDescription(e.target.value)}
                            className="input-base" rows={3} maxLength={200}
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-900 dark:text-white">Private Room</span>
                        <button
                            type="button" onClick={() => setIsPrivate(!isPrivate)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${isPrivate ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${isPrivate ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    <div className="flex gap-2 pt-2">
                        <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
                        <button onClick={handleSave} disabled={saving || !name.trim()} className="btn-primary flex-1">
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>

                    <div className="pt-4 border-t border-gray-200 dark:border-dark-700">
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="w-full px-4 py-2.5 text-red-500 border border-red-500/30 hover:bg-red-500/10 rounded-xl transition text-sm font-medium"
                        >
                            Delete Room
                        </button>
                    </div>
                </div>
            </div>

            {showDeleteConfirm && (
                <ConfirmModal
                    title="Delete Room"
                    message={`Are you sure you want to delete "${room.name}"? All messages will be lost.`}
                    confirmLabel="Delete" danger
                    onConfirm={handleDelete}
                    onCancel={() => setShowDeleteConfirm(false)}
                />
            )}
        </Modal>
    );
};

export default RoomSettingsModal;