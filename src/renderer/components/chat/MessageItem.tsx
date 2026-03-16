import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { PinIcon } from '../icons';
import Avatar from '../Avatar';
import MarkdownRenderer from '../MarkdownRenderer';
import MessageAttachment from '../MessageAttachment';
import MessageReply from '../MessageReply';
import MessageReactions from '../MessageReaction';
import MessageReadReceipts from '../MessageReadReceipts';
import MessageHoverActions from '../MessageHoverActions';
import ImageLightbox from '../ImageLightbox';
import { formatTimestamp } from '../../utils/format';
import { resolveUrl } from '../../utils/urls';
import { useSettingsStore } from '../../hooks/useSettingsStore';
import useAuthStore from '../../hooks/useAuthStore';
import type { Message } from '../../utils/types';

interface MessageItemProps {
    message: Message;
    isFirstInGroup: boolean;
    replyToMessage?: Message | null;
    roomId: string;
    getDisplayName: (userId: string) => string;
    onContextMenu: (e: React.MouseEvent, message: Message) => void;
    onAvatarClick: (userId: string, name: string) => void;
    onAddReaction: (messageId: string, emoji: string) => void;
    onRemoveReaction: (messageId: string, emoji: string) => void;
    onOpenReactionPicker: (messageId: string, e: React.MouseEvent) => void;
    onReply?: (message: Message) => void;
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

const MessageItem: React.FC<MessageItemProps> = ({
                                                     message,
                                                     isFirstInGroup,
                                                     replyToMessage,
                                                     roomId,
                                                     getDisplayName,
                                                     onContextMenu,
                                                     onAvatarClick,
                                                     onAddReaction,
                                                     onRemoveReaction,
                                                     onOpenReactionPicker,
                                                     onReply,
                                                 }) => {
    const [lightboxImage, setLightboxImage] = useState<string | null>(null);
    const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
    const { settings } = useSettingsStore();
    const accessToken = useAuthStore((state) => state.tokens?.accessToken);

    const isOptimistic = message.id.startsWith('temp-');
    const isDeleted = !!message.deleted;
    const hasTextContent = !!message.content?.trim();
    const hasAttachments = !!message.attachments?.length;
    const hasReactions = !!message.reactions?.length;
    const displayName = getDisplayName(message.authorId);
    const canShowHoverActions = !isOptimistic && !isDeleted && !!onReply;

    const previewTargetUrl = useMemo(() => {
        if (isDeleted || !hasTextContent) return null;
        return extractFirstUrl(message.content);
    }, [isDeleted, hasTextContent, message.content]);

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

        const endpoint = resolveUrl(
            `/v1/unfurl?url=${encodeURIComponent(previewTargetUrl)}`,
            settings.serverAddress
        );

        if (!endpoint) {
            setLinkPreview(null);
            return;
        }

        const controller = new AbortController();

        fetch(endpoint, {
            method: 'GET',
            signal: controller.signal,
            headers: accessToken
                ? {
                    Authorization: `Bearer ${accessToken}`,
                }
                : undefined,
        })
            .then(async (response) => {
                if (!response.ok) {
                    throw new Error(`Unfurl failed: ${response.status}`);
                }
                return response.json();
            })
            .then((data) => {
                setLinkPreview(normalizeLinkPreview(data, previewTargetUrl, settings.serverAddress));
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

    const handleOpenMore = useCallback(
        (e: React.MouseEvent) => {
            onContextMenu(e, message);
        },
        [onContextMenu, message]
    );

    const renderReplyPreview = () => {
        if (!replyToMessage) return null;

        return (
            <div className={isFirstInGroup ? 'mt-1' : 'mb-1'}>
                <MessageReply replyTo={replyToMessage} />
            </div>
        );
    };

    const renderMessageContent = () => {
        if (isDeleted) {
            return <p className="italic text-gray-400 dark:text-dark-500">Message deleted</p>;
        }

        if (!hasTextContent) {
            return null;
        }

        return (
            <MarkdownRenderer
                content={message.content}
                className="break-words text-gray-700 dark:text-dark-200"
            />
        );
    };

    const renderLinkPreview = () => {
        if (isDeleted || !linkPreview) return null;
        return <LinkPreviewCard preview={linkPreview} />;
    };

    const renderAttachments = () => {
        if (isDeleted || !hasAttachments) return null;

        const hasBodyAbove = hasTextContent || !!linkPreview;

        return (
            <div className={`${hasBodyAbove ? (isFirstInGroup ? 'mt-2' : 'mt-1') : ''} space-y-2`}>
                {message.attachments!.map((attachment) => (
                    <MessageAttachment
                        key={attachment.id}
                        attachment={attachment}
                        onImageClick={handleImageClick}
                    />
                ))}
            </div>
        );
    };

    const renderReactions = () => {
        if (isDeleted || !hasReactions) return null;

        return (
            <MessageReactions
                messageId={message.id}
                reactions={message.reactions!}
                onAddReaction={(emoji) => onAddReaction(message.id, emoji)}
                onRemoveReaction={(emoji) => onRemoveReaction(message.id, emoji)}
                onOpenPicker={(e) => onOpenReactionPicker(message.id, e)}
            />
        );
    };

    return (
        <>
            <div
                id={`msg-${message.id}`}
                className={`group relative transition-colors duration-1000 hover:bg-gray-50 dark:hover:bg-dark-800/50 ${
                    isFirstInGroup ? 'flex items-start gap-3 py-1' : 'flex items-start pl-[52px]'
                } ${isOptimistic ? 'opacity-60' : ''}`}
                onContextMenu={(e) => !isOptimistic && onContextMenu(e, message)}
            >
                {!isFirstInGroup && (
                    <span className="pointer-events-none absolute left-2 top-1 w-10 text-right text-xs text-gray-400 opacity-0 transition group-hover:opacity-100 dark:text-dark-500">
                        {formatTimestamp(message.createdAt)}
                    </span>
                )}

                {canShowHoverActions && (
                    <MessageHoverActions
                        onReply={() => onReply?.(message)}
                        onReactionPicker={(e) => onOpenReactionPicker(message.id, e)}
                        onMore={handleOpenMore}
                    />
                )}

                {isFirstInGroup && (
                    <Avatar
                        userId={message.authorId}
                        size="md"
                        showStatus={false}
                        onClick={() => onAvatarClick(message.authorId, displayName)}
                    />
                )}

                <div className="min-w-0 flex-1">
                    {isFirstInGroup && (
                        <div className="flex items-baseline gap-2">
                            <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                                {displayName}
                            </span>
                            <span className="flex-shrink-0 text-xs text-gray-400 dark:text-dark-400">
                                {formatTimestamp(message.createdAt)}
                            </span>
                            {message.editedAt && (
                                <span className="text-xs text-gray-400 dark:text-dark-500">(edited)</span>
                            )}
                            {message.pinned && <PinIcon size="sm" className="text-primary-400" />}
                            {isOptimistic && (
                                <span className="text-xs text-gray-400 dark:text-dark-500">
                                    (sending...)
                                </span>
                            )}
                        </div>
                    )}

                    {renderReplyPreview()}
                    {renderMessageContent()}
                    {renderLinkPreview()}
                    {renderAttachments()}
                    {renderReactions()}

                    {isFirstInGroup && <MessageReadReceipts roomId={roomId} messageId={message.id} />}

                    {isFirstInGroup && (message.replyCount ?? 0) > 0 && (
                        <button
                            type="button"
                            className="mt-1 text-xs text-primary-400 transition hover:text-primary-300"
                            onClick={() => onReply?.(message)}
                        >
                            {message.replyCount} {message.replyCount === 1 ? 'reply' : 'replies'}
                        </button>
                    )}
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

export default MessageItem;