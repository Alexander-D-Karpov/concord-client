import React, { useState, useMemo, useEffect, useCallback } from 'react';
import type { DMMessage } from '../../utils/types';
import { PinIcon } from '../icons';
import Avatar from '../Avatar';
import MarkdownRenderer from '../MarkdownRenderer';
import MessageAttachment from '../MessageAttachment';
import MessageReply from '../MessageReply';
import MessageReactions from '../MessageReaction';
import ImageLightbox from '../ImageLightbox';
import { formatTimestamp } from '../../utils/format';
import { resolveApiUrl, resolveUrl } from '../../utils/urls';
import { useSettingsStore } from '../../hooks/useSettingsStore';
import useAuthStore from '../../hooks/useAuthStore';

interface DMMessageItemProps {
    message: DMMessage;
    isOwn: boolean;
    isFirstInGroup: boolean;
    replyToMessage?: DMMessage | null;
    otherUserId: string;
    onContextMenu: (e: React.MouseEvent, message: DMMessage) => void;
    onAddReaction: (messageId: string, emoji: string) => void;
    onRemoveReaction: (messageId: string, emoji: string) => void;
    onOpenReactionPicker: (messageId: string, e: React.MouseEvent) => void;
}

interface LinkPreviewData {
    url: string;
    title?: string;
    description?: string;
    siteName?: string;
    image?: string;
}

const extractFirstUrl = (content: string): string | null => {
    const match = content.match(/https?:\/\/[^\s<>()]+/i);
    if (!match) return null;
    return match[0].replace(/[),.!?]+$/, '');
};

const normalizeLinkPreview = (
    raw: any,
    fallbackUrl: string,
    serverAddress: string
): LinkPreviewData | null => {
    const payload = raw?.preview ?? raw?.metadata ?? raw?.data ?? raw;
    if (!payload || typeof payload !== 'object') return null;

    const title = payload.title || payload.og_title || payload.ogTitle || undefined;
    const description =
        payload.description || payload.og_description || payload.ogDescription || undefined;
    const siteName = payload.site_name || payload.siteName || undefined;
    const previewUrl = payload.url || payload.canonical_url || payload.canonicalUrl || fallbackUrl;
    const imageRaw =
        payload.image || payload.og_image || payload.ogImage || payload.image_url || payload.imageUrl;
    const image = imageRaw ? resolveUrl(imageRaw, serverAddress) || imageRaw : undefined;

    if (!title && !description && !siteName && !image) return null;

    return {
        url: previewUrl,
        title,
        description,
        siteName,
        image,
    };
};

const LinkPreviewCard: React.FC<{ preview: LinkPreviewData }> = ({ preview }) => {
    const hostname = useMemo(() => {
        try {
            return new URL(preview.url).hostname.replace(/^www\./, '');
        } catch {
            return preview.url;
        }
    }, [preview.url]);

    return (
        <a
            href={preview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 block max-w-xl overflow-hidden rounded-2xl border border-gray-200 bg-white transition hover:bg-gray-50 dark:border-dark-600 dark:bg-dark-800 dark:hover:bg-dark-700/70"
        >
            {preview.image && (
                <div className="max-h-64 overflow-hidden border-b border-gray-200 bg-gray-100 dark:border-dark-600 dark:bg-dark-700">
                    <img
                        src={preview.image}
                        alt={preview.title || preview.siteName || hostname}
                        className="h-auto w-full object-cover"
                        crossOrigin="anonymous"
                    />
                </div>
            )}

            <div className="p-3">
                <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-dark-400">
                    {preview.siteName || hostname}
                </div>

                {preview.title && (
                    <div className="line-clamp-2 text-sm font-semibold text-gray-900 dark:text-white">
                        {preview.title}
                    </div>
                )}

                {preview.description && (
                    <div className="mt-1 line-clamp-3 text-sm text-gray-600 dark:text-dark-300">
                        {preview.description}
                    </div>
                )}
            </div>
        </a>
    );
};

const DMMessageItem: React.FC<DMMessageItemProps> = ({
                                                         message,
                                                         isOwn,
                                                         isFirstInGroup,
                                                         replyToMessage,
                                                         otherUserId,
                                                         onContextMenu,
                                                         onAddReaction,
                                                         onRemoveReaction,
                                                         onOpenReactionPicker,
                                                     }) => {
    const isOptimistic = message.id.startsWith('temp-');
    const { settings } = useSettingsStore();
    const accessToken = useAuthStore((state) => state.tokens?.accessToken);

    const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);

    const hasTextContent = !!message.content?.trim();
    const previewTargetUrl = useMemo(() => {
        if (message.deleted || !hasTextContent) return null;
        return extractFirstUrl(message.content);
    }, [message.deleted, hasTextContent, message.content]);

    const imageAttachments = useMemo(() => {
        return (message.attachments || [])
            .filter(
                (attachment) =>
                    typeof attachment.contentType === 'string' &&
                    attachment.contentType.startsWith('image/')
            )
            .map((attachment) => resolveUrl(attachment.url, settings.serverAddress))
            .filter((url): url is string => Boolean(url));
    }, [message.attachments, settings.serverAddress]);

    const lightboxIndex = useMemo(() => {
        return lightboxImage ? imageAttachments.indexOf(lightboxImage) : -1;
    }, [imageAttachments, lightboxImage]);

    useEffect(() => {
        if (!previewTargetUrl || isOptimistic) {
            setLinkPreview(null);
            return;
        }

        const url = resolveApiUrl(
            `/v1/unfurl?url=${encodeURIComponent(previewTargetUrl)}`,
            settings.serverAddress
        );

        const controller = new AbortController();

        fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            },
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Unfurl failed: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                setLinkPreview(
                    normalizeLinkPreview(data, previewTargetUrl, settings.serverAddress)
                );
            })
            .catch((error) => {
                if (error?.name !== 'AbortError') {
                    setLinkPreview(null);
                }
            });

        return () => controller.abort();
    }, [previewTargetUrl, settings.serverAddress, accessToken, isOptimistic]);

    const handleImageClick = useCallback((url: string) => {
        setLightboxImage(url);
    }, []);

    return (
        <>
            <div
                id={`dm-msg-${message.id}`}
                className={`group flex transition-colors duration-1000 ${isOwn ? 'justify-end' : 'justify-start'} ${isOptimistic ? 'opacity-60' : ''} ${isFirstInGroup ? 'mt-3' : 'mt-0.5'}`}
                onContextMenu={(e) => !isOptimistic && onContextMenu(e, message)}
            >
                {!isOwn && isFirstInGroup && (
                    <div className="mr-2 flex-shrink-0 self-end">
                        <Avatar userId={otherUserId} size="sm" showStatus={false} />
                    </div>
                )}

                {!isOwn && !isFirstInGroup && <div className="mr-2 w-8 flex-shrink-0" />}

                <div className="max-w-[70%]">
                    {replyToMessage && (
                        <div className={`mb-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                            <div className="inline-block max-w-full">
                                <MessageReply replyTo={replyToMessage as any} />
                            </div>
                        </div>
                    )}

                    {hasTextContent && (
                        <div
                            className={`px-4 py-2 ${
                                isOwn
                                    ? `bg-primary-600 text-white ${isFirstInGroup ? 'rounded-2xl rounded-br-sm' : 'rounded-2xl rounded-r-sm'}`
                                    : `bg-gray-100 dark:bg-dark-700 text-gray-900 dark:text-white ${isFirstInGroup ? 'rounded-2xl rounded-bl-sm' : 'rounded-2xl rounded-l-sm'}`
                            }`}
                        >
                            {message.deleted ? (
                                <p className="break-words italic opacity-60">Message deleted</p>
                            ) : (
                                <MarkdownRenderer content={message.content} className="break-words" />
                            )}
                        </div>
                    )}

                    {!message.deleted && linkPreview && <LinkPreviewCard preview={linkPreview} />}

                    {!message.deleted && message.attachments?.length > 0 && (
                        <div className={`${hasTextContent || linkPreview ? 'mt-1' : ''} ${isOwn ? 'text-right' : 'text-left'}`}>
                            {message.attachments.map((att) => (
                                <MessageAttachment
                                    key={att.id}
                                    attachment={att}
                                    onImageClick={handleImageClick}
                                />
                            ))}
                        </div>
                    )}

                    {!message.deleted && message.reactions && message.reactions.length > 0 && (
                        <div className={`mt-1 ${isOwn ? 'flex justify-end' : ''}`}>
                            <MessageReactions
                                messageId={message.id}
                                reactions={message.reactions}
                                onAddReaction={(emoji) => onAddReaction(message.id, emoji)}
                                onRemoveReaction={(emoji) => onRemoveReaction(message.id, emoji)}
                                onOpenPicker={(e) => onOpenReactionPicker(message.id, e)}
                            />
                        </div>
                    )}

                    <div className={`mt-1 flex items-center gap-1 text-xs ${isOwn ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-gray-400 dark:text-dark-500">
                            {formatTimestamp(message.createdAt)}
                        </span>
                        {message.editedAt && (
                            <span className="text-gray-400 dark:text-dark-500">(edited)</span>
                        )}
                        {message.pinned && <PinIcon size="xs" className="text-primary-400" />}
                        {isOptimistic && (
                            <span className="text-gray-400 dark:text-dark-500">Sending...</span>
                        )}
                    </div>
                </div>
            </div>

            {lightboxImage && lightboxIndex >= 0 && (
                <ImageLightbox
                    src={lightboxImage}
                    allImages={imageAttachments}
                    initialIndex={lightboxIndex}
                    onClose={() => setLightboxImage(null)}
                />
            )}
        </>
    );
};

export default DMMessageItem;