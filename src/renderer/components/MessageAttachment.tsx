import React, { useState } from 'react';
import { MessageAttachment as AttachmentType } from '../types';
import { useSettingsStore } from '../hooks/useSettingsStore';

interface MessageAttachmentProps {
    attachment: AttachmentType;
}

const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

const MessageAttachment: React.FC<MessageAttachmentProps> = ({ attachment }) => {
    const { settings } = useSettingsStore();
    const [imageError, setImageError] = useState(false);
    const [imageLoading, setImageLoading] = useState(true);

    const isImage = attachment.contentType.startsWith('image/');
    const isVideo = attachment.contentType.startsWith('video/');

    const getAttachmentUrl = () => {
        if (!attachment.url) return '';

        if (attachment.url.startsWith('data:')) {
            return attachment.url;
        }

        if (attachment.url.startsWith('http://') || attachment.url.startsWith('https://')) {
            return attachment.url;
        }

        const serverHost = settings.serverAddress.split(':')[0] || 'localhost';
        const cleanUrl = attachment.url.startsWith('/') ? attachment.url : `/${attachment.url}`;
        return `http://${serverHost}:8080${cleanUrl}`;
    };

    const attachmentUrl = getAttachmentUrl();

    const handleImageLoad = () => {
        setImageLoading(false);
        setImageError(false);
    };

    const handleImageError = () => {
        console.error('Failed to load image:', attachmentUrl);
        setImageLoading(false);
        setImageError(true);
    };

    const openInNewWindow = () => {
        window.open(attachmentUrl, '_blank');
    };

    if (isImage) {
        return (
            <div className="mt-2 rounded-lg overflow-hidden border border-dark-600 max-w-md">
                {!imageError ? (
                    <>
                        {imageLoading && (
                            <div className="w-full aspect-video bg-dark-700 flex items-center justify-center">
                                <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                            </div>
                        )}
                        <div className={imageLoading ? 'hidden' : 'block'}>
                            <img
                                src={attachmentUrl}
                                alt={attachment.filename}
                                className="w-full h-auto cursor-pointer hover:opacity-90 transition"
                                style={{ maxHeight: '400px', objectFit: 'contain' }}
                                onLoad={handleImageLoad}
                                onError={handleImageError}
                                onClick={openInNewWindow}
                                crossOrigin="anonymous"
                            />
                        </div>
                    </>
                ) : (
                    <div
                        className="w-full p-4 bg-dark-700 flex items-center justify-center cursor-pointer hover:bg-dark-600 transition"
                        onClick={openInNewWindow}
                    >
                        <div className="text-center">
                            <svg className="w-12 h-12 text-dark-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <p className="text-sm text-dark-400">Click to open image</p>
                            <p className="text-xs text-dark-500 mt-1">{attachment.filename}</p>
                        </div>
                    </div>
                )}
                <div className="bg-dark-800 px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-dark-300 truncate flex-1 mr-2">{attachment.filename}</span>
                    <span className="text-xs text-dark-500 flex-shrink-0">{formatFileSize(attachment.size)}</span>
                </div>
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className="mt-2 rounded-lg overflow-hidden border border-dark-600 max-w-md">
                <video
                    src={attachmentUrl}
                    controls
                    className="w-full h-auto bg-black"
                    style={{ maxHeight: '400px' }}
                    onError={() => console.error('Failed to load video:', attachmentUrl)}
                    crossOrigin="anonymous"
                >
                    Your browser does not support the video tag.
                </video>
                <div className="bg-dark-800 px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-dark-300 truncate flex-1 mr-2">{attachment.filename}</span>
                    <span className="text-xs text-dark-500 flex-shrink-0">{formatFileSize(attachment.size)}</span>
                </div>
            </div>
        );
    }

    return (
        <div
            onClick={openInNewWindow}
            className="mt-2 inline-flex items-center space-x-3 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg transition cursor-pointer max-w-md"
        >
            <div className="flex-shrink-0 w-10 h-10 bg-primary-600 rounded flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            </div>
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">{attachment.filename}</div>
                <div className="text-xs text-dark-400">{formatFileSize(attachment.size)}</div>
            </div>
            <svg className="w-5 h-5 text-dark-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
        </div>
    );
};

export default MessageAttachment;