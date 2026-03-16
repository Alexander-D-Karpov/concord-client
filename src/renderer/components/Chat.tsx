import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useMessagesStore } from '../hooks/useMessagesStore';
import useAuthStore from '../hooks/useAuthStore';
import { useUsersStore } from '../hooks/useUsersStore';
import { useTypingStore } from '../hooks/useTypingStore';
import { useNotificationStore } from '../hooks/useNotificationStore';
import { mapMessage } from '../utils/mappers';
import type { Message } from '../utils/types';
import ReactionPicker from './ReactionPicker';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import InviteMemberModal from './InviteMemberModal';
import ConfirmModal from './ConfirmModal';
import AvatarHistoryModal from './AvatarHistoryModal';
import EmptyState from './EmptyState';
import DropZone from './DropZone';
import ChatHeader from './chat/ChatHeader';
import PinnedBanner from './chat/PinnedBanner';
import ChatMessages from './chat/ChatMessages';
import ChatInput from './chat/ChatInput';
import { ReplyIcon, EmojiIcon, PinIcon, CopyIcon, EditIcon, TrashIcon } from './icons';

const READ_MARK_DELAY = 1000;
const TYPING_STOP_DELAY = 3000;
const SEND_ERROR_CLEAR_DELAY = 5000;

const Chat: React.FC = () => {
    const { currentRoomId, rooms, members } = useRoomsStore();
    const { messages, addMessage, setMessages, updateMessage, deleteMessage } = useMessagesStore();
    const { user } = useAuthStore();
    const { getUser } = useUsersStore();
    const { typingUsers } = useTypingStore();

    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [replyingTo, setReplyingTo] = useState<Message | null>(null);
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<{
        messageId: string;
        x: number;
        y: number;
    } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const [avatarHistoryUser, setAvatarHistoryUser] = useState<{ id: string; name: string } | null>(null);
    const [deleteConfirm, setDeleteConfirm] = useState<Message | null>(null);

    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLTextAreaElement>(null);
    const initialLoadRef = useRef(true);
    const markAsReadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastMarkedMessageRef = useRef<string | null>(null);
    const markInFlightRef = useRef(false);
    const isMountedRef = useRef(true);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isTypingRef = useRef(false);
    const sendErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const currentRoom = rooms.find((room) => room.id === currentRoomId);
    const roomMessages = currentRoomId ? messages[currentRoomId] || [] : [];
    const roomMembers = currentRoomId ? members[currentRoomId] || [] : [];
    const pinnedMessages = roomMessages.filter((message) => message.pinned);

    const activeTypingUsers = currentRoomId ? Array.from(typingUsers[currentRoomId] || []) : [];
    const otherTypingUsers = activeTypingUsers.filter((id) => id !== user?.id);

    const clearSendErrorLater = useCallback(() => {
        if (sendErrorTimeoutRef.current) {
            clearTimeout(sendErrorTimeoutRef.current);
        }

        sendErrorTimeoutRef.current = setTimeout(() => {
            setSendError(null);
        }, SEND_ERROR_CLEAR_DELAY);
    }, []);

    const getMemberInfo = useCallback(
        (userId: string) => roomMembers.find((member) => member.userId === userId),
        [roomMembers]
    );

    const openReactionPicker = useCallback((messageId: string, e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setShowReactionPicker({
            messageId,
            x: e.clientX,
            y: e.clientY,
        });
    }, []);

    const getDisplayName = useCallback(
        (userId: string) => {
            if (userId === user?.id) {
                return user?.displayName || user?.handle || 'You';
            }

            const cachedUser = getUser(userId);
            if (cachedUser) {
                const member = getMemberInfo(userId);
                return member?.nickname || cachedUser.displayName || cachedUser.handle;
            }

            return userId.split('-')[0];
        },
        [user, getUser, getMemberInfo]
    );

    const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    }, []);

    const isNearBottom = useCallback(() => {
        const el = scrollContainerRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    }, []);

    const scrollToMessage = useCallback((messageId: string) => {
        const el = document.getElementById(`msg-${messageId}`);
        if (!el) return false;

        el.scrollIntoView({ behavior: 'auto', block: 'center' });
        el.classList.add('bg-primary-900/20');

        const timeout = window.setTimeout(() => {
            el.classList.remove('bg-primary-900/20');
        }, 1500);

        return () => window.clearTimeout(timeout);
    }, []);

    const fetchMessageAuthors = useCallback((items: Message[]) => {
        const ids = [...new Set(items.map((message) => message.authorId))];
        if (ids.length > 0) {
            useUsersStore.getState().fetchUsers(ids);
        }
    }, []);

    const stopTyping = useCallback(() => {
        if (!currentRoomId) return;

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        isTypingRef.current = false;
        window.concord.stopTyping(currentRoomId).catch(() => {});
    }, [currentRoomId]);

    const loadMessages = useCallback(async () => {
        if (!currentRoomId) return;

        setLoading(true);

        try {
            const response = await window.concord.getMessages(currentRoomId, 50);

            if (!response?.messages) {
                setMessages(currentRoomId, []);
                return;
            }

            const mappedMessages = response.messages.map(mapMessage);
            setMessages(currentRoomId, mappedMessages);
            fetchMessageAuthors(mappedMessages);
        } catch (err) {
            console.error('[Chat] Failed to load messages:', err);
            setMessages(currentRoomId, []);
        } finally {
            setLoading(false);
        }
    }, [currentRoomId, setMessages, fetchMessageAuthors]);

    useEffect(() => {
        if (currentRoomId) {
            loadMessages();
        }
    }, [currentRoomId, loadMessages]);

    useEffect(() => {
        if (roomMessages.length > 0) {
            fetchMessageAuthors(roomMessages);
        }
    }, [roomMessages, fetchMessageAuthors]);

    useEffect(() => {
        if (!currentRoomId || roomMessages.length === 0) return;

        if (initialLoadRef.current) {
            initialLoadRef.current = false;

            const lastReadId = useNotificationStore.getState().getLastRead('room', currentRoomId);
            if (lastReadId) {
                const lastReadIndex = roomMessages.findIndex((message) => message.id === lastReadId);
                if (lastReadIndex >= 0 && lastReadIndex < roomMessages.length - 1) {
                    const nextUnreadId = roomMessages[lastReadIndex + 1]?.id;
                    if (nextUnreadId) {
                        requestAnimationFrame(() => {
                            scrollToMessage(nextUnreadId);
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
    }, [roomMessages.length, currentRoomId, scrollToBottom, scrollToMessage, isNearBottom]);

    useEffect(() => {
        isMountedRef.current = true;

        return () => {
            isMountedRef.current = false;

            if (markAsReadTimeoutRef.current) {
                clearTimeout(markAsReadTimeoutRef.current);
            }

            if (typingTimeoutRef.current) {
                clearTimeout(typingTimeoutRef.current);
            }

            if (sendErrorTimeoutRef.current) {
                clearTimeout(sendErrorTimeoutRef.current);
            }
        };
    }, []);

    useEffect(() => {
        lastMarkedMessageRef.current = null;
        initialLoadRef.current = true;
        setReplyingTo(null);
        setEditingMessage(null);
        setAttachments([]);
        setSendError(null);
        setContextMenu(null);
        setShowReactionPicker(null);

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = null;
        }

        isTypingRef.current = false;
    }, [currentRoomId]);

    const lastRealMessageId = useMemo(() => {
        for (let i = roomMessages.length - 1; i >= 0; i -= 1) {
            if (!roomMessages[i].id.startsWith('temp-')) {
                return roomMessages[i].id;
            }
        }
        return null;
    }, [roomMessages]);

    useEffect(() => {
        if (!currentRoomId || !lastRealMessageId) return;
        if (lastRealMessageId === lastMarkedMessageRef.current) return;

        const storedLastRead = useNotificationStore.getState().getLastRead('room', currentRoomId);
        if (storedLastRead === lastRealMessageId) {
            lastMarkedMessageRef.current = lastRealMessageId;
            return;
        }

        if (markAsReadTimeoutRef.current) {
            clearTimeout(markAsReadTimeoutRef.current);
        }

        const roomId = currentRoomId;
        const messageId = lastRealMessageId;

        markAsReadTimeoutRef.current = setTimeout(() => {
            if (!isMountedRef.current || markInFlightRef.current) return;
            if (useRoomsStore.getState().currentRoomId !== roomId) return;
            if (useNotificationStore.getState().getLastRead('room', roomId) === messageId) return;

            markInFlightRef.current = true;
            lastMarkedMessageRef.current = messageId;

            window.concord
                .markAsRead(roomId, messageId)
                .then((response: { last_read_message_id: string }) => {
                    useNotificationStore
                        .getState()
                        .setLastRead('room', roomId, response.last_read_message_id);
                })
                .catch(() => {})
                .finally(() => {
                    markInFlightRef.current = false;
                });
        }, READ_MARK_DELAY);

        return () => {
            if (markAsReadTimeoutRef.current) {
                clearTimeout(markAsReadTimeoutRef.current);
            }
        };
    }, [currentRoomId, lastRealMessageId]);

    const handleTyping = useCallback(() => {
        if (!currentRoomId) return;

        if (!isTypingRef.current) {
            isTypingRef.current = true;
            window.concord.startTyping(currentRoomId).catch(() => {});
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            isTypingRef.current = false;
            window.concord.stopTyping(currentRoomId).catch(() => {});
        }, TYPING_STOP_DELAY);
    }, [currentRoomId]);

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

    const extractMentions = useCallback(
        (content: string): string[] => {
            const regex = /@([a-zA-Z0-9_-]+)/g;
            const handles = Array.from(content.matchAll(regex), (match) => match[1]);

            return roomMembers
                .filter((member) => handles.some((handle) => member.userId.includes(handle)))
                .map((member) => member.userId);
        },
        [roomMembers]
    );

    const startEditingMessage = useCallback((message: Message) => {
        setEditingMessage(message);
        setReplyingTo(null);
        setNewMessage(message.content);
        messageInputRef.current?.focus();
    }, []);

    const handleSendMessage = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

            if (!newMessage.trim() && attachments.length === 0) return;
            if (!currentRoomId || !user?.id) return;

            setSendError(null);

            const content = newMessage.trim() || (attachments.length > 0 ? ' ' : '');
            const filesToSend = [...attachments];
            const tempId = `temp-${Date.now()}`;

            stopTyping();
            setNewMessage('');
            setAttachments([]);

            const optimisticMessage: Message = {
                id: tempId,
                roomId: currentRoomId,
                authorId: user.id,
                content,
                createdAt: new Date().toISOString(),
                deleted: false,
                replyToId: replyingTo?.id,
                replyCount: 0,
                attachments: [],
                mentions: extractMentions(content),
                reactions: [],
                pinned: false,
            };

            if (!editingMessage) {
                addMessage(currentRoomId, optimisticMessage);
                scrollToBottom();
            }

            try {
                if (editingMessage) {
                    const response = await window.concord.editMessage(currentRoomId, editingMessage.id, content);
                    if (response) {
                        updateMessage(currentRoomId, editingMessage.id, content);
                    }
                    setEditingMessage(null);
                    return;
                }

                const mentions = extractMentions(content);
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

                const response = await window.concord.sendMessage(
                    currentRoomId,
                    content,
                    replyingTo?.id,
                    mentions,
                    attachmentData
                );

                deleteMessage(currentRoomId, tempId);

                if (response?.message) {
                    addMessage(currentRoomId, mapMessage(response.message));
                    scrollToBottom();
                }

                setReplyingTo(null);
            } catch (err: any) {
                deleteMessage(currentRoomId, tempId);
                setNewMessage(content);
                setAttachments(filesToSend);
                setSendError(err?.message || 'Failed to send message');
                clearSendErrorLater();
            }
        },
        [
            newMessage,
            attachments,
            currentRoomId,
            user?.id,
            stopTyping,
            replyingTo?.id,
            editingMessage,
            addMessage,
            scrollToBottom,
            updateMessage,
            extractMentions,
            getImageDimensions,
            deleteMessage,
            clearSendErrorLater,
        ]
    );

    const handleDeleteMessage = useCallback(
        async (message: Message) => {
            setDeleteConfirm(null);
            if (!currentRoomId) return;

            try {
                await window.concord.deleteMessage(currentRoomId, message.id);
                deleteMessage(currentRoomId, message.id);
            } catch (err) {
                console.error('[Chat] Failed to delete message:', err);
            }
        },
        [currentRoomId, deleteMessage]
    );

    const handlePinMessage = useCallback(
        async (messageId: string, isPinned: boolean) => {
            if (!currentRoomId) return;

            try {
                if (isPinned) {
                    await window.concord.unpinMessage(currentRoomId, messageId);
                } else {
                    await window.concord.pinMessage(currentRoomId, messageId);
                }

                await loadMessages();
            } catch (err) {
                console.error('[Chat] Failed to pin/unpin message:', err);
            }
        },
        [currentRoomId, loadMessages]
    );

    const handleAddReaction = useCallback(
        async (messageId: string, emoji: string) => {
            if (!currentRoomId) return;

            try {
                await window.concord.addReaction(currentRoomId, messageId, emoji);
            } catch (err) {
                console.error('[Chat] Failed to add reaction:', err);
            }
        },
        [currentRoomId]
    );

    const handleRemoveReaction = useCallback(
        async (messageId: string, emoji: string) => {
            if (!currentRoomId) return;

            try {
                await window.concord.removeReaction(currentRoomId, messageId, emoji);
            } catch (err) {
                console.error('[Chat] Failed to remove reaction:', err);
            }
        },
        [currentRoomId]
    );

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
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

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            if (e.key === 'ArrowUp' && !newMessage.trim() && !editingMessage) {
                const myMessages = roomMessages.filter(
                    (message) =>
                        message.authorId === user?.id &&
                        !message.deleted &&
                        !message.id.startsWith('temp-')
                );

                const lastMessage = myMessages[myMessages.length - 1];
                if (lastMessage) {
                    e.preventDefault();
                    startEditingMessage(lastMessage);
                }
            }
        },
        [newMessage, editingMessage, roomMessages, user?.id, startEditingMessage]
    );

    const handleInviteMember = useCallback(
        async (userId: string) => {
            if (!currentRoomId) return;

            try {
                await window.concord.inviteMember(currentRoomId, userId);
                const response = await window.concord.getMembers(currentRoomId);
                useRoomsStore.getState().setMembers(currentRoomId, response?.members || []);
            } catch (err) {
                console.error('[Chat] Failed to invite member:', err);
                throw err;
            }
        },
        [currentRoomId]
    );

    const handleContextMenu = useCallback((e: React.MouseEvent, message: Message) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, message });
    }, []);

    const getContextMenuItems = useCallback(
        (message: Message): ContextMenuItem[] => {
            const items: ContextMenuItem[] = [
                {
                    label: 'Reply',
                    icon: <ReplyIcon size="sm" />,
                    onClick: () => {
                        setReplyingTo(message);
                        setContextMenu(null);
                    },
                },
                {
                    label: 'Add Reaction',
                    icon: <EmojiIcon size="sm" />,
                    onClick: () => {
                        const x = contextMenu?.x ?? Math.round(window.innerWidth / 2);
                        const y = contextMenu?.y ?? Math.round(window.innerHeight / 2);

                        setShowReactionPicker({
                            messageId: message.id,
                            x,
                            y,
                        });
                        setContextMenu(null);
                    },
                },
                {
                    label: message.pinned ? 'Unpin Message' : 'Pin Message',
                    icon: <PinIcon size="sm" />,
                    onClick: () => {
                        void handlePinMessage(message.id, !!message.pinned);
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
                        label: 'Edit Message',
                        icon: <EditIcon size="sm" />,
                        onClick: () => {
                            startEditingMessage(message);
                            setContextMenu(null);
                        },
                    },
                    {
                        label: 'Delete Message',
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
        [contextMenu, handlePinMessage, startEditingMessage, user?.id]
    );

    const typingNames = useMemo(
        () => otherTypingUsers.map((id) => getDisplayName(id)),
        [otherTypingUsers, getDisplayName]
    );

    if (!currentRoomId) {
        return (
            <EmptyState
                icon="💬"
                title="No room selected"
                description="Select a room from the sidebar to start chatting"
            />
        );
    }

    return (
        <DropZone onFileDrop={handleFileDrop}>
            <div className="flex h-full min-w-0 flex-1 flex-col bg-white dark:bg-dark-900">
                <ChatHeader room={currentRoom} onInvite={() => setShowInviteModal(true)} />
                <PinnedBanner pinnedMessages={pinnedMessages} />

                <ChatMessages
                    messages={roomMessages}
                    roomId={currentRoomId}
                    loading={loading}
                    scrollContainerRef={scrollContainerRef}
                    messagesEndRef={messagesEndRef}
                    getDisplayName={getDisplayName}
                    onContextMenu={handleContextMenu}
                    onAvatarClick={(id, name) => setAvatarHistoryUser({ id, name })}
                    onAddReaction={handleAddReaction}
                    onRemoveReaction={handleRemoveReaction}
                    onOpenReactionPicker={openReactionPicker}
                    onReply={(msg) => setReplyingTo(msg)}
                />

                <ChatInput
                    roomName={currentRoom?.name}
                    newMessage={newMessage}
                    setNewMessage={setNewMessage}
                    attachments={attachments}
                    replyingTo={replyingTo}
                    editingMessage={editingMessage}
                    sendError={sendError}
                    typingNames={typingNames}
                    inputRef={messageInputRef}
                    onSubmit={handleSendMessage}
                    onTyping={handleTyping}
                    onPaste={handlePaste}
                    onKeyDown={handleKeyDown}
                    onFileSelect={(file) => setAttachments((prev) => [...prev, file])}
                    onRemoveAttachment={(index) =>
                        setAttachments((prev) => prev.filter((_, i) => i !== index))
                    }
                    onCancelReply={() => setReplyingTo(null)}
                    onCancelEdit={() => {
                        setEditingMessage(null);
                        setNewMessage('');
                    }}
                    uploadingFile={false}
                />

                {showReactionPicker && (
                    <ReactionPicker
                        anchor={{ x: showReactionPicker.x, y: showReactionPicker.y }}
                        onSelect={(emoji) => handleAddReaction(showReactionPicker.messageId, emoji)}
                        onClose={() => setShowReactionPicker(null)}
                    />
                )}

                {contextMenu && (
                    <ContextMenu
                        x={contextMenu.x}
                        y={contextMenu.y}
                        items={getContextMenuItems(contextMenu.message)}
                        onClose={() => setContextMenu(null)}
                    />
                )}

                {showInviteModal && (
                    <InviteMemberModal
                        roomId={currentRoomId}
                        onClose={() => setShowInviteModal(false)}
                        onInvite={handleInviteMember}
                    />
                )}

                {avatarHistoryUser && (
                    <AvatarHistoryModal
                        userId={avatarHistoryUser.id}
                        displayName={avatarHistoryUser.name}
                        onClose={() => setAvatarHistoryUser(null)}
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

export default Chat;