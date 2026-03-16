import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import ConfirmModal from './ConfirmModal';
import { getFileBaseUrl, useSettingsStore } from '../hooks/useSettingsStore';
import useAuthStore from '../hooks/useAuthStore';
import { CloseIcon } from './icons';
import {AvatarEntry} from "@/utils/types";

interface AvatarHistoryModalProps {
    userId: string;
    displayName: string;
    onClose: () => void;
}

const AvatarHistoryModal: React.FC<AvatarHistoryModalProps> = ({ userId, displayName, onClose }) => {
    const [avatars, setAvatars] = useState<AvatarEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<AvatarEntry | null>(null);
    const [deleting, setDeleting] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<AvatarEntry | null>(null);
    const { settings } = useSettingsStore();
    const { user } = useAuthStore();
    const isOwnProfile = user?.id === userId;

    const resolveUrl = (url: string): string => {
        if (url.startsWith('http')) return url;
        const base = getFileBaseUrl(settings.serverAddress);
        const clean = url.startsWith('/') ? url : `/${url}`;
        return `${base}${clean}`;
    };

    useEffect(() => {
        const load = async () => {
            try {
                const res = await window.concord.getAvatarHistory(userId);
                const mapped: AvatarEntry[] = (res?.avatars || []).map((a: any) => ({
                    id: a.id, userId: a.user_id, fullUrl: a.full_url, thumbnailUrl: a.thumbnail_url,
                    originalFilename: a.original_filename,
                    createdAt: new Date(Number(a.created_at?.seconds || 0) * 1000).toISOString(),
                }));
                setAvatars(mapped);
                if (mapped.length > 0) setSelected(mapped[0]);
            } catch {} finally { setLoading(false); }
        };
        load();
    }, [userId]);

    const handleDelete = async (avatar: AvatarEntry) => {
        setDeleteTarget(null);
        setDeleting(avatar.id);
        try {
            await window.concord.deleteAvatar(avatar.id);
            setAvatars(prev => prev.filter(a => a.id !== avatar.id));
            if (selected?.id === avatar.id) setSelected(avatars.find(a => a.id !== avatar.id) || null);
        } catch {} finally { setDeleting(null); }
    };

    return (
        <Modal onClose={onClose} className="max-w-2xl">
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white">{displayName}'s Profile Pictures</h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition">
                        <CloseIcon className="text-gray-400 dark:text-dark-400" />
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : avatars.length === 0 ? (
                    <div className="text-center py-12">
                        <Avatar userId={userId} size="xl" showStatus={false} />
                        <p className="text-gray-500 dark:text-dark-400 mt-4">No profile pictures yet</p>
                    </div>
                ) : (
                    <>
                        {selected && (
                            <div className="flex justify-center mb-4">
                                <div className="relative">
                                    <img
                                        src={resolveUrl(selected.fullUrl)} alt="Avatar"
                                        className="max-w-[320px] max-h-[320px] rounded-lg object-contain bg-gray-100 dark:bg-dark-700"
                                        crossOrigin="anonymous"
                                    />
                                    <div className="absolute bottom-2 right-2 bg-black/60 text-gray-900 dark:text-white text-xs px-2 py-1 rounded">
                                        {new Date(selected.createdAt).toLocaleDateString()}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex gap-2 overflow-x-auto pb-2">
                            {avatars.map((av) => (
                                <div key={av.id} className="relative flex-shrink-0 group">
                                    <button
                                        onClick={() => setSelected(av)}
                                        className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                                            selected?.id === av.id ? 'border-primary-500' : 'border-transparent hover:border-gray-300 dark:hover:border-dark-500'
                                        }`}
                                    >
                                        <img src={resolveUrl(av.thumbnailUrl)} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
                                    </button>
                                    {isOwnProfile && (
                                        <button
                                            onClick={() => setDeleteTarget(av)}
                                            disabled={deleting === av.id}
                                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full text-gray-900 dark:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                        >
                                            <CloseIcon size="xs" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            {deleteTarget && (
                <ConfirmModal
                    title="Delete Avatar"
                    message="Are you sure you want to delete this avatar? This cannot be undone."
                    confirmLabel="Delete"
                    danger
                    onConfirm={() => handleDelete(deleteTarget)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </Modal>
    );
};

export default AvatarHistoryModal;