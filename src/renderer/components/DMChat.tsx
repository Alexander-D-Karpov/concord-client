import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import DMCallBar from './DMCallBar';
import { useDMStore } from '../hooks/useDMStore';
import useAuthStore from '../hooks/useAuthStore';
import { useNotificationStore } from '../hooks/useNotificationStore';
import { useDMCallStore } from '../hooks/useDMCallStore';
import { useTypingStore } from '../hooks/useTypingStore';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import ConfirmModal from './ConfirmModal';
import EmptyState from './EmptyState';
import DropZone from './DropZone';
import DMChatHeader from './dm/DMChatHeader';
import DMChatMessages from './dm/DMChatMessages';
import DMChatInput from './dm/DMChatInput';
import { ReplyIcon, CopyIcon, EditIcon, TrashIcon } from './icons';
import { tsToIso } from '../utils/format';
import type { DMMessage } from '../utils/types';

const READ_MARK_DELAY = 1000;
const TYPING_STOP_DELAY = 3000;
const SEND_ERROR_CLEAR_DELAY = 5000;

const DMChat: React.FC = () => {
    const { currentChannelId, channels, messages, loadMessages, addMessage } = useDMStore();
    const { user } = useAuthStore();
    const typingUsers = useTypingStore((state) =>
        currentChannelId ? state.getTypingUsers(currentChannelId) : new Set<string>()
    );

    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const [replyingTo, setReplyingTo] = useState<DMMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<DMMessage | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: DMMessage } | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [sendError, setSendError] = useState<string | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<DMMessage | null>(null);
    const [loading, setLoading] = useState(false);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLTextAreaElement>(null);
    const initialLoadRef = useRef(true);
    const isTypingRef = useRef(false);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastMarkedMessageRef = useRef<string | null>(null);
    const markInFlightRef = useRef(false);
    const markTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const currentChannel = useMemo(
        () => channels.find((channel) => channel.channel.id === currentChannelId),
        [channels, currentChannelId]
    );

    const channelMessages: DMMessage[] = useMemo(() => {
        if (!currentChannelId) return [];
        return messages[currentChannelId] || [];
    }, [currentChannelId, messages]);

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    }, []);

    const scrollToMessage = useCallback((messageId: string) => {
        const el = document.getElementById(`dm-msg-${messageId}`);
        if (!el) return;

        el.scrollIntoView({ behavior: 'auto', block: 'center' });
        el.classList.add('bg-primary-900/20');

        const timeout = window.setTimeout(() => {
            el.classList.remove('bg-primary-900/20');
        }, 1500);

        return () => window.clearTimeout(timeout);
    }, []);

    const clearSendErrorLater = useCallback(() => {
        if (sendErrorTimeoutRef.current) {
            clearTimeout(sendErrorTimeoutRef.current);
        }

        sendErrorTimeoutRef.current = setTimeout(() => {
            setSendError(null);
        }, SEND_ERROR_CLEAR_DELAY);
    }, []);

    const stopTyping = useCallback(() => {
        if (!currentChannelId) return;

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        isTypingRef.current = false;
        window.concord.stopDMTyping(currentChannelId).catch(() => {});
    }, [currentChannelId]);

    useEffect(() => {
        if (!currentChannelId) {
            setLoading(false);
            return;
        }

        initialLoadRef.current = true;
        lastMarkedMessageRef.current = null;
        setReplyingTo(null);
        setEditingMessage(null);
        setAttachments([]);
        setSendError(null);
        setContextMenu(null);

        setLoading(true);
        loadMessages(currentChannelId).finally(() => setLoading(false));
    }, [currentChannelId, loadMessages]);

    useEffect(() => {
        if (!currentChannelId || channelMessages.length === 0) return;

        if (initialLoadRef.current) {
            initialLoadRef.current = false;

            const lastReadId = useNotificationStore.getState().getLastRead('dm', currentChannelId);
            if (lastReadId) {
                const idx = channelMessages.findIndex((message) => message.id === lastReadId);
                if (idx >= 0 && idx < channelMessages.length - 1) {
                    const nextMessage = channelMessages[idx + 1];
                    if (nextMessage) {
                        requestAnimationFrame(() => {
                            scrollToMessage(nextMessage.id);
                        });
                        return;
                    }
                }
            }

            requestAnimationFrame(() => {
                scrollToBottom('auto');
            });
            return;
        }

        if (isNearBottom()) {
            scrollToBottom();
        }
    }, [channelMessages.length, currentChannelId, scrollToBottom, scrollToMessage, isNearBottom]);

    const lastRealMessageId = useMemo(() => {
        for (let i = channelMessages.length - 1; i >= 0; i -= 1) {
            if (!channelMessages[i].id.startsWith('temp-')) {
                return channelMessages[i].id;
            }
        }
        return null;
    }, [channelMessages]);

    useEffect(() => {
        if (!currentChannelId || !lastRealMessageId) return;
        if (lastRealMessageId === lastMarkedMessageRef.current) return;

        const storedLastRead = useNotificationStore.getState().getLastRead('dm', currentChannelId);
        if (storedLastRead === lastRealMessageId) {
            lastMarkedMessageRef.current = lastRealMessageId;
            return;
        }

        if (markTimeoutRef.current) {
            clearTimeout(markTimeoutRef.current);
        }

        const channelId = currentChannelId;
        const messageId = lastRealMessageId;

        markTimeoutRef.current = setTimeout(() => {
            if (markInFlightRef.current) return;
            if (useDMStore.getState().currentChannelId !== channelId) return;
            if (useNotificationStore.getState().getLastRead('dm', channelId) === messageId) return;

            markInFlightRef.current = true;
            lastMarkedMessageRef.current = messageId;

            useNotificationStore.getState().setLastRead('dm', channelId, messageId);
            useNotificationStore.getState().clearUnread('dm', channelId);

            window.concord
                .markDMAsRead(channelId, messageId)
                .catch(() => {})
                .finally(() => {
                    markInFlightRef.current = false;
                });
        }, READ_MARK_DELAY);

        return () => {
            if (markTimeoutRef.current) {
                clearTimeout(markTimeoutRef.current);
            }
        };
    }, [currentChannelId, lastRealMessageId]);

    useEffect(() => {
        return () => {
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            if (markTimeoutRef.current) clearTimeout(markTimeoutRef.current);
            if (sendErrorTimeoutRef.current) clearTimeout(sendErrorTimeoutRef.current);
        };
    }, []);

    const handleTyping = useCallback(() => {
        if (!currentChannelId) return;

        if (!isTypingRef.current) {
            isTypingRef.current = true;
            window.concord.startDMTyping(currentChannelId).catch(() => {});
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            isTypingRef.current = false;
            window.concord.stopDMTyping(currentChannelId).catch(() => {});
        }, TYPING_STOP_DELAY);
    }, [currentChannelId]);

    const getImageDimensions = useCallback(
        (file: File): Promise<{ width: number; height: number }> =>
            new Promise((resolve, reject) => {
                const img = new Image();
                const url = URL.createObjectURL(file);

                img.onload = () => {
                    URL.revokeObjectURL(url);
                    resolve({ width: img.width, height: img.height });
                };

                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    reject(new Error('Failed to load image'));
                };

                img.src = url;
            }),
        []
    );

    const startEditing = useCallback((message: DMMessage) => {
        setEditingMessage(message);
        setReplyingTo(null);
        setNewMessage(message.content);
        messageInputRef.current?.focus();
    }, []);

    const handleSend = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

            if ((!newMessage.trim() && attachments.length === 0) || !currentChannelId || sending) {
                return;
            }

            stopTyping();
            setSendError(null);

            const content = newMessage.trim() || (attachments.length > 0 ? ' ' : '');
            const filesToSend = [...attachments];
            const tempId = `temp-${Date.now()}`;

            setNewMessage('');
            setAttachments([]);
            setSending(true);

            if (editingMessage) {
                try {
                    const response = await window.concord.editDMMessage(
                        currentChannelId,
                        editingMessage.id,
                        content
                    );

                    useDMStore.setState((state) => ({
                        messages: {
                            ...state.messages,
                            [currentChannelId]: (state.messages[currentChannelId] || []).map((message) =>
                                message.id === editingMessage.id
                                    ? {
                                        ...message,
                                        content: response?.message?.content ?? content,
                                        editedAt: response?.message?.edited_at
                                            ? tsToIso(response.message.edited_at)
                                            : new Date().toISOString(),
                                    }
                                    : message
                            ),
                        },
                    }));

                    setEditingMessage(null);
                } catch (err: any) {
                    setSendError(err?.message || 'Failed to edit message');
                    setNewMessage(content);
                    clearSendErrorLater();
                } finally {
                    setSending(false);
                }

                return;
            }

            addMessage(
                currentChannelId,
                {
                    id: tempId,
                    channelId: currentChannelId,
                    authorId: user?.id || '',
                    content,
                    createdAt: new Date().toISOString(),
                    deleted: false,
                    attachments: [],
                    replyToId: replyingTo?.id,
                    reactions: [],
                    mentions: [],
                    pinned: false,
                } as DMMessage
            );

            scrollToBottom();

            try {
                let attachmentData:
                    | Array<{
                    filename: string;
                    content_type: string;
                    data: number[];
                    width?: number;
                    height?: number;
                }>
                    | undefined;

                if (filesToSend.length > 0) {
                    attachmentData = await Promise.all(
                        filesToSend.map(async (file) => {
                            const arrayBuffer = await file.arrayBuffer();
                            let width: number | undefined;
                            let height: number | undefined;

                            if (file.type.startsWith('image/')) {
                                try {
                                    ({ width, height } = await getImageDimensions(file));
                                } catch {}
                            }

                            return {
                                filename: file.name,
                                content_type: file.type,
                                data: Array.from(new Uint8Array(arrayBuffer)),
                                width,
                                height,
                            };
                        })
                    );
                }

                const response = await window.concord.sendDMMessage(
                    currentChannelId,
                    content,
                    attachmentData,
                    replyingTo?.id
                );

                if (response?.message) {
                    const mapDMAttachment = (att: any) => ({
                        id: att.id,
                        url: att.url || '',
                        filename: att.filename || att.name || 'attachment',
                        contentType: att.content_type || att.contentType || 'application/octet-stream',
                        size: Number(att.size ?? 0),
                        width: att.width ?? undefined,
                        height: att.height ?? undefined,
                        createdAt: tsToIso(att.created_at || att.createdAt),
                    });

                    const realMessage: DMMessage = {
                        id: response.message.id,
                        channelId: response.message.channel_id || currentChannelId,
                        authorId: response.message.author_id,
                        content: response.message.content || '',
                        createdAt: tsToIso(response.message.created_at),
                        editedAt: response.message.edited_at ? tsToIso(response.message.edited_at) : undefined,
                        deleted: !!response.message.deleted,
                        replyToId: response.message.reply_to_id || undefined,
                        attachments: Array.isArray(response.message.attachments)
                            ? response.message.attachments.map(mapDMAttachment)
                            : [],
                        mentions: [],
                        reactions: [],
                        pinned: false,
                    };

                    useDMStore.setState((state) => {
                        const existing = state.messages[currentChannelId] || [];
                        const filtered = existing.filter((message) => message.id !== tempId);

                        if (filtered.some((message) => message.id === realMessage.id)) {
                            return {
                                messages: {
                                    ...state.messages,
                                    [currentChannelId]: filtered,
                                },
                            };
                        }

                        return {
                            messages: {
                                ...state.messages,
                                [currentChannelId]: [...filtered, realMessage],
                            },
                        };
                    });
                } else {
                    useDMStore.setState((state) => ({
                        messages: {
                            ...state.messages,
                            [currentChannelId]: (state.messages[currentChannelId] || []).filter(
                                (message) => message.id !== tempId
                            ),
                        },
                    }));
                }

                setReplyingTo(null);
            } catch (err: any) {
                useDMStore.setState((state) => ({
                    messages: {
                        ...state.messages,
                        [currentChannelId]: (state.messages[currentChannelId] || []).filter(
                            (message) => message.id !== tempId
                        ),
                    },
                }));

                setNewMessage(content);
                setAttachments(filesToSend);
                setSendError(err?.message || 'Failed to send message');
                clearSendErrorLater();
            } finally {
                setSending(false);
            }
        },
        [
            newMessage,
            attachments,
            currentChannelId,
            sending,
            stopTyping,
            editingMessage,
            addMessage,
            user?.id,
            replyingTo?.id,
            scrollToBottom,
            getImageDimensions,
            clearSendErrorLater,
        ]
    );

    const handleDeleteMessage = useCallback(
        async (message: DMMessage) => {
            setDeleteConfirm(null);
            if (!currentChannelId) return;

            try {
                await window.concord.deleteDMMessage(currentChannelId, message.id);

                useDMStore.setState((state) => ({
                    messages: {
                        ...state.messages,
                        [currentChannelId]: (state.messages[currentChannelId] || []).map((item) =>
                            item.id === message.id ? { ...item, deleted: true } : item
                        ),
                    },
                }));
            } catch (err) {
                console.error('[DMChat] Failed to delete message:', err);
            }
        },
        [currentChannelId]
    );

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData.items;

        for (let i = 0; i < items.length; i += 1) {
            if (items[i].kind === 'file') {
                e.preventDefault();
                const file = items[i].getAsFile();
                if (file) {
                    setAttachments((prev) => [...prev, file]);
                }
            }
        }
    }, []);

    const handleFileDrop = useCallback((files: File[]) => {
        setAttachments((prev) => [...prev, ...files]);
    }, []);

    const handleContextMenu = useCallback((e: React.MouseEvent, message: DMMessage) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, message });
    }, []);

    const getContextMenuItems = useCallback(
        (message: DMMessage): ContextMenuItem[] => {
            const items: ContextMenuItem[] = [
                {
                    label: 'Reply',
                    icon: <ReplyIcon size="sm" />,
                    onClick: () => {
                        setReplyingTo(message);
                        setContextMenu(null);
                    },
                },
                { separator: true, label: '', onClick: () => {} },
                {
                    label: 'Copy Message ID',
                    icon: <CopyIcon size="sm" />,
                    onClick: () => {
                        void navigator.clipboard.writeText(message.id);
                        setContextMenu(null);
                    },
                },
            ];

            if (message.authorId === user?.id && !message.deleted) {
                items.push(
                    { separator: true, label: '', onClick: () => {} },
                    {
                        label: 'Edit',
                        icon: <EditIcon size="sm" />,
                        onClick: () => {
                            startEditing(message);
                            setContextMenu(null);
                        },
                    },
                    {
                        label: 'Delete',
                        icon: <TrashIcon size="sm" />,
                        onClick: () => {
                            setDeleteConfirm(message);
                            setContextMenu(null);
                        },
                        danger: true,
                    }
                );
            }

            return items;
        },
        [user?.id, startEditing]
    );

    const noopReaction = useCallback(async () => {}, []);
    const noopOpenReactionPicker = useCallback(() => {}, []);

    if (!currentChannelId || !currentChannel) {
        return (
            <EmptyState
                icon="💬"
                title="Select a conversation"
                description="Choose a friend to start messaging"
            />
        );
    }

    const otherUser = {
        id: currentChannel.otherUserId,
        displayName: currentChannel.otherUserDisplay,
        handle: currentChannel.otherUserHandle,
        avatarUrl: currentChannel.otherUserAvatar,
        status: currentChannel.otherUserStatus,
    };

    const otherTyping = Array.from(typingUsers).some((id) => id !== user?.id);
    const typingName = otherTyping ? otherUser.displayName : null;

    const handleStartCall = async (audioOnly: boolean) => {
        const { startCall, joinCall } = useDMCallStore.getState();

        try {
            const status = await window.concord.getDMCallStatus(currentChannelId);
            if (status?.active) {
                await joinCall(currentChannelId, audioOnly);
            } else {
                await startCall(currentChannelId, audioOnly);
            }
        } catch (err) {
            console.error('[DMChat] Failed to start/join call:', err);
        }
    };

    return (
        <DropZone onFileDrop={handleFileDrop}>
            <div className="flex h-full min-w-0 flex-1 flex-col bg-white dark:bg-dark-900">
                <DMChatHeader
                    otherUserId={otherUser.id}
                    displayName={otherUser.displayName}
                    handle={otherUser.handle}
                    avatarUrl={otherUser.avatarUrl}
                    status={otherUser.status}
                />

                <DMChatMessages
                    messages={channelMessages}
                    loading={loading}
                    currentUserId={user?.id || ''}
                    otherUserId={otherUser.id}
                    otherUserName={otherUser.displayName}
                    currentUserName={user?.displayName || user?.handle || 'You'}
                    scrollContainerRef={scrollContainerRef}
                    messagesEndRef={messagesEndRef}
                    onContextMenu={handleContextMenu}
                    onAddReaction={noopReaction}
                    onRemoveReaction={noopReaction}
                    onOpenReactionPicker={noopOpenReactionPicker}
                />

                <DMCallBar
                    channelId={currentChannelId}
                    otherUserName={otherUser.displayName}
                    onStartCall={handleStartCall}
                />

                <DMChatInput
                    handle={otherUser.handle}
                    newMessage={newMessage}
                    setNewMessage={setNewMessage}
                    attachments={attachments}
                    replyingTo={replyingTo}
                    editingMessage={editingMessage}
                    sendError={sendError}
                    typingName={typingName}
                    sending={sending}
                    inputRef={messageInputRef}
                    onSubmit={handleSend}
                    onTyping={handleTyping}
                    onPaste={handlePaste}
                    onFileSelect={(file) => setAttachments((prev) => [...prev, file])}
                    onRemoveAttachment={(index) =>
                        setAttachments((prev) => prev.filter((_, i) => i !== index))
                    }
                    onCancelReply={() => setReplyingTo(null)}
                    onCancelEdit={() => {
                        setEditingMessage(null);
                        setNewMessage('');
                    }}
                />

                {contextMenu && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        items={getContextMenuItems(contextMenu.message)}
                        onClose={() => setContextMenu(null)}
                    />
                )}

                {deleteConfirm && (
                    <ConfirmModal
                        title="Delete Message"
                        message="Are you sure? This cannot be undone."
                        confirmLabel="Delete"
                        danger
                        onConfirm={() => handleDeleteMessage(deleteConfirm)}
                        onCancel={() => setDeleteConfirm(null)}
                    />
                )}
            </div>
        </DropZone>
    );
};

export default DMChat;