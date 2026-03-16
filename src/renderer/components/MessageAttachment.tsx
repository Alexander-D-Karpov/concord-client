import React, { useMemo, useState } from 'react';
import { formatFileSize } from '../utils/format';
import { resolveUrl } from '../utils/urls';
import { useSettingsStore } from '../hooks/useSettingsStore';
import type { MessageAttachment as AttachmentType } from '../utils/types';

interface MessageAttachmentProps {
    attachment: AttachmentType;
    onImageClick?: (url: string) => void;
}

const MessageAttachment: React.FC<MessageAttachmentProps> = ({ attachment, onImageClick }) => {
    const { settings } = useSettingsStore();
    const [imageError, setImageError] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);

    const contentType = attachment.contentType || 'application/octet-stream';
    const filename = attachment.filename || 'attachment';
    const size = Number(attachment.size ?? 0);
    const attachmentUrl = resolveUrl(attachment.url, settings.serverAddress) || '';

    const isImage = typeof contentType === 'string' && contentType.startsWith('image/');
    const isVideo = typeof contentType === 'string' && contentType.startsWith('video/');

    const openExternal = () => {
        if (!attachmentUrl) return;
        window.open(attachmentUrl, '_blank');
    };

    const formattedSize = useMemo(() => formatFileSize(size), [size]);

    if (isImage) {
        return (
            <div className="mt-2 max-w-md overflow-hidden rounded-xl border border-gray-200 dark:border-dark-600">
                {!imageError ? (
                    <>
                        {imageLoading && (
                            <div className="flex aspect-video w-full items-center justify-center bg-gray-100 dark:bg-dark-700">
                                <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" />
                            </div>
                        )}

                        <div className={imageLoading ? 'hidden' : 'block'}>
                            <img
                                src={attachmentUrl}
                                alt={filename}
                                className="h-auto w-full cursor-pointer transition hover:opacity-90"
                                style={{ maxHeight: '400px', objectFit: 'contain' }}
                                onLoad={() => {
                                    setImageLoading(false);
                                    setImageError(false);
                                }}
                                onError={() => {
                                    setImageLoading(false);
                                    setImageError(true);
                                }}
                                onClick={() => (onImageClick ? onImageClick(attachmentUrl) : openExternal())}
                                crossOrigin="anonymous"
                            />
                        </div>
                    </>
                ) : (
                    <div
                        onClick={openExternal}
                        className="flex w-full cursor-pointer items-center justify-center bg-gray-100 p-4 transition hover:bg-gray-200 dark:bg-dark-700 dark:hover:bg-dark-600"
                    >
                        <div className="text-center">
                            <svg className="mx-auto mb-2 h-12 w-12 text-gray-400 dark:text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-gray-500 dark:text-dark-400">Click to open image</p>
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between bg-gray-100 px-3 py-1.5 dark:bg-dark-800">
                    <span className="mr-2 flex-1 truncate text-sm text-gray-600 dark:text-dark-300">
                        {filename}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-400 dark:text-dark-500">
                        {formattedSize}
                    </span>
                </div>
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className="mt-2 max-w-md overflow-hidden rounded-xl border border-gray-200 dark:border-dark-600">
                <video
                    src={attachmentUrl}
                    controls
                    className="h-auto w-full bg-black"
                    style={{ maxHeight: '400px' }}
                    crossOrigin="anonymous"
                />
                <div className="flex items-center justify-between bg-gray-100 px-3 py-1.5 dark:bg-dark-800">
                    <span className="mr-2 flex-1 truncate text-sm text-gray-600 dark:text-dark-300">
                        {filename}
                    </span>
                    <span className="flex-shrink-0 text-xs text-gray-400 dark:text-dark-500">
                        {formattedSize}
                    </span>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={openExternal}
            className="mt-2 inline-flex max-w-md cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-gray-100 px-3 py-2 transition hover:bg-gray-200 dark:border-dark-600 dark:bg-dark-800 dark:hover:bg-dark-700"
        >
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary-600">
                <svg className="h-5 w-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </div>

            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {filename}
                </div>
                <div className="text-xs text-gray-500 dark:text-dark-400">{formattedSize}</div>
            </div>
        </div>
    );
};

export default MessageAttachment;