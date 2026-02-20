import React, {useState, useMemo, useEffect} from 'react';
import { useUsersStore } from '../hooks/useUsersStore';
import {getFileBaseUrl, useSettingsStore} from '../hooks/useSettingsStore';

interface AvatarProps {
    userId?: string;
    src?: string;
    thumbnailSrc?: string;
    name?: string;
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    status?: string;
    onClick?: () => void;
    className?: string;
    showStatus?: boolean;
}

const sizeMap = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-20 h-20 text-2xl',
};

const statusDotSize = {
    xs: 'w-2 h-2',
    sm: 'w-2.5 h-2.5',
    md: 'w-3 h-3',
    lg: 'w-3.5 h-3.5',
    xl: 'w-4 h-4',
};

const statusColors: Record<string, string> = {
    online: 'bg-green-500',
    idle: 'bg-yellow-500',
    away: 'bg-yellow-500',
    dnd: 'bg-red-500',
    busy: 'bg-red-500',
};

const bgColors = [
    'bg-red-600', 'bg-blue-600', 'bg-green-600', 'bg-purple-600',
    'bg-pink-600', 'bg-indigo-600', 'bg-teal-600', 'bg-orange-600',
];

function hashCode(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h);
}

const Avatar: React.FC<AvatarProps> = ({
                                           userId,
                                           src,
                                           thumbnailSrc,
                                           name,
                                           size = 'md',
                                           status,
                                           onClick,
                                           className = '',
                                           showStatus = true,
                                       }) => {
    const { getUser, fetchUser, loading } = useUsersStore();
    const { settings } = useSettingsStore();
    const [imgError, setImgError] = useState(false);

    const user = userId ? getUser(userId) : null;

    const failed = useUsersStore(state => state.failed);

    useEffect(() => {
        if (userId && !user && !loading.has(userId) && !failed.has(userId)) {
            fetchUser(userId);
        }
    }, [userId, user, loading, failed, fetchUser]);

    const displayName = name || user?.displayName || user?.handle || userId || '?';
    const initial = displayName[0]?.toUpperCase() || '?';
    const userStatus = status || user?.status;

    const resolveUrl = (url?: string): string | undefined => {
        if (!url) return undefined;
        if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
        const base = getFileBaseUrl(settings.serverAddress);
        const clean = url.startsWith('/') ? url : `/${url}`;
        return `${base}${clean}`;
    };

    const imgSrc = useMemo(() => {
        const thumb = thumbnailSrc || user?.avatarThumbnailUrl;
        const full = src || user?.avatarUrl;
        if (size === 'xs' || size === 'sm') {
            return resolveUrl(thumb) || resolveUrl(full);
        }
        return resolveUrl(full) || resolveUrl(thumb);
    }, [src, thumbnailSrc, user?.avatarUrl, user?.avatarThumbnailUrl, size, settings.serverAddress]);

    useEffect(() => {
        setImgError(false)
    }, [imgSrc]);

    const bgColor = bgColors[hashCode(userId || displayName) % bgColors.length];

    const showImg = imgSrc && !imgError;

    return (
        <div
            className={`relative inline-flex flex-shrink-0 ${onClick ? 'cursor-pointer' : ''} ${className}`}
            onClick={onClick}
        >
            <div className={`${sizeMap[size]} rounded-full flex items-center justify-center overflow-hidden ${showImg ? '' : bgColor}`}>
                {showImg ? (
                    <img
                        src={imgSrc}
                        alt={displayName}
                        className="w-full h-full object-cover"
                        onError={() => setImgError(true)}
                        loading="lazy"
                        crossOrigin="anonymous"
                    />
                ) : (
                    <span className="text-white font-semibold">{initial}</span>
                )}
            </div>
            {showStatus && userStatus && userStatus !== 'offline' && (
                <div className={`absolute bottom-0 right-0 ${statusDotSize[size]} rounded-full border-2 border-dark-800 ${statusColors[userStatus] || 'bg-dark-500'}`} />
            )}
        </div>
    );
};

export default Avatar;