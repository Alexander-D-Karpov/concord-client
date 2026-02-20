import React, { useRef, useState } from 'react';
import Avatar from './Avatar';
import AvatarCropModal from './AvatarCropModal';
import { useAuthStore } from '../hooks/useAuthStore';
import { useUsersStore } from '../hooks/useUsersStore';

const AvatarUpload: React.FC = () => {
    const { user, setUser } = useAuthStore();
    const { setUser: setCachedUser } = useUsersStore();
    const fileRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState('');
    const [cropFile, setCropFile] = useState<File | null>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            setError('Image must be under 10MB');
            return;
        }

        setError('');
        setCropFile(file);
        if (fileRef.current) fileRef.current.value = '';
    };

    const handleCrop = async (croppedData: ArrayBuffer) => {
        setCropFile(null);
        setUploading(true);

        try {
            const res = await window.concord.uploadAvatar(croppedData, cropFile?.name || 'avatar.png');

            if (user) {
                const updated = {
                    ...user,
                    avatarUrl: res.avatar_url,
                    avatarThumbnailUrl: res.thumbnail_url,
                };
                setUser(updated);
                setCachedUser({
                    id: user.id,
                    handle: user.handle || '',
                    displayName: user.displayName || '',
                    avatarUrl: res.avatar_url,
                    avatarThumbnailUrl: res.thumbnail_url,
                });
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to upload avatar');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="flex items-center space-x-4">
            <div className="relative">
                <Avatar userId={user?.id} size="xl" showStatus={false} />
                <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-primary-600 hover:bg-primary-700 rounded-full flex items-center justify-center text-white shadow-lg transition"
                >
                    {uploading ? (
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    )}
                </button>
            </div>
            <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
            />
            {error && <span className="text-red-500 text-sm">{error}</span>}
            {cropFile && (
                <AvatarCropModal
                    file={cropFile}
                    onCrop={handleCrop}
                    onCancel={() => setCropFile(null)}
                />
            )}
        </div>
    );
};

export default AvatarUpload;