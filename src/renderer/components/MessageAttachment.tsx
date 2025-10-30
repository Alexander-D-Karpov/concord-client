import React from 'react';
import { MessageAttachment as AttachmentType } from '../types';

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
    const isImage = attachment.contentType.startsWith('image/');
    const isVideo = attachment.contentType.startsWith('video/');

    if (isImage) {
        return (
            <div className="mt-2 rounded-lg overflow-hidden border border-dark-600 max-w-md">
                <a href={attachment.url} target="_blank" rel="noopener noreferrer">
                    <img
                        src={attachment.url}
                        alt={attachment.filename}
                        className="w-full h-auto hover:opacity-90 transition"
                        style={{ maxHeight: '400px', objectFit: 'contain' }}
                    />
                </a>
                <div className="bg-dark-800 px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-dark-300 truncate">{attachment.filename}</span>
                    <span className="text-xs text-dark-500">{formatFileSize(attachment.size)}</span>
                </div>
            </div>
        );
    }

    if (isVideo) {
        return (
            <div className="mt-2 rounded-lg overflow-hidden border border-dark-600 max-w-md">
                <video
                    src={attachment.url}
                    controls
                    className="w-full h-auto"
                    style={{ maxHeight: '400px' }}
                >
                    Your browser does not support the video tag.
                </video>
                <div className="bg-dark-800 px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-dark-300 truncate">{attachment.filename}</span>
                    <span className="text-xs text-dark-500">{formatFileSize(attachment.size)}</span>
                </div>
            </div>
        );
    }

    return (
        <a
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center space-x-3 px-3 py-2 bg-dark-800 hover:bg-dark-700 border border-dark-600 rounded-lg transition"
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
        </a>
    );
};

export default MessageAttachment;