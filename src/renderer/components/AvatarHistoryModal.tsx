import React, { useEffect, useState } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import { AvatarEntry } from '../types';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { useAuthStore } from '../hooks/useAuthStore';

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
    const { settings } = useSettingsStore();
    const { user } = useAuthStore();
    const isOwnProfile = user?.id === userId;

    const resolveUrl = (url: string): string => {
        if (url.startsWith('http')) return url;
        const host = settings.serverAddress.split(':')[0] || 'localhost';
        const clean = url.startsWith('/') ? url : `/${url}`;
        return `http://${host}:8080${clean}`;
    };

    useEffect(() => {
        const load = async () => {
            try {
                const res = await window.concord.getAvatarHistory(userId);
                const mapped: AvatarEntry[] = (res?.avatars || []).map((a: any) => ({
                    id: a.id,
                    userId: a.user_id,
                    fullUrl: a.full_url,
                    thumbnailUrl: a.thumbnail_url,
                    originalFilename: a.original_filename,
                    createdAt: new Date(Number(a.created_at?.seconds || 0) * 1000).toISOString(),
                }));
                setAvatars(mapped);
                if (mapped.length > 0) setSelected(mapped[0]);
            } catch (err) {
                console.error('Failed to load avatar history:', err);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [userId]);

    const handleDelete = async (avatarId: string) => {
        if (!confirm('Delete this avatar?')) return;
        setDeleting(avatarId);
        try {
            await window.concord.deleteAvatar(avatarId);
            setAvatars(prev => prev.filter(a => a.id !== avatarId));
            if (selected?.id === avatarId) {
                setSelected(avatars.find(a => a.id !== avatarId) || null);
            }
        } catch (err) {
            console.error('Failed to delete avatar:', err);
        } finally {
            setDeleting(null);
        }
    };

    return (
        <Modal onClose={onClose} className="max-w-2xl">
            <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xl font-semibold text-white">{displayName}'s Profile Pictures</h3>
                    <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg transition">
                        <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : avatars.length === 0 ? (
                    <div className="text-center py-12">
                        <Avatar userId={userId} size="xl" showStatus={false} />
                        <p className="text-dark-400 mt-4">No profile pictures yet</p>
                    </div>
                ) : (
                    <>
                        {selected && (
                            <div className="flex justify-center mb-4">
                                <div className="relative">
                                    <img
                                        src={resolveUrl(selected.fullUrl)}
                                        alt="Avatar"
                                        className="max-w-[320px] max-h-[320px] rounded-lg object-contain bg-dark-700"
                                        crossOrigin="anonymous"
                                    />
                                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
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
                                            selected?.id === av.id ? 'border-primary-500' : 'border-transparent hover:border-dark-500'
                                        }`}
                                    >
                                        <img
                                            src={resolveUrl(av.thumbnailUrl)}
                                            alt=""
                                            className="w-full h-full object-cover"
                                            crossOrigin="anonymous"
                                        />
                                    </button>
                                    {isOwnProfile && (
                                        <button
                                            onClick={() => handleDelete(av.id)}
                                            disabled={deleting === av.id}
                                            className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
};

export default AvatarHistoryModal;