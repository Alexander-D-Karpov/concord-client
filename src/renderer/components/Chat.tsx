import React, {useState, useEffect, useRef, useCallback, useMemo} from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useMessagesStore } from '../hooks/useMessagesStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useUsersStore } from '../hooks/useUsersStore';
import { useTypingStore } from '../hooks/useTypingStore';
import VoiceControls from './VoiceControls';
import MessageAttachment from './MessageAttachment';
import MessageReply from './MessageReply';
import ReactionPicker from './ReactionPicker';
import FileUpload from './FileUpload';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import InviteMemberModal from './InviteMemberModal';
import { Message as UiMessage } from '../types';
import { useNotificationStore } from '../hooks/useNotificationStore';
import MessageReactions from './MessageReaction';
import MessageReadReceipts from './MessageReadReceipts';
import Avatar from "@/components/Avatar";
import AvatarHistoryModal from "@/components/AvatarHistoryModal";

const tsToIso = (ts: any): string => {
    if (!ts) return '';
    const seconds = Number(ts.seconds ?? 0);
    const nanos = Number(ts.nanos ?? 0);
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
};

const mapMessage = (m: any): UiMessage => ({
    id: m.id,
    roomId: m.room_id,
    authorId: m.author_id,
    content: m.content,
    createdAt: tsToIso(m.created_at),
    editedAt: m.edited_at ? tsToIso(m.edited_at) : undefined,
    deleted: !!m.deleted,
    replyToId: m.reply_to_id,
    replyCount: m.reply_count || 0,
    attachments: m.attachments?.map((a: any) => ({
        id: a.id,
        url: a.url,
        filename: a.filename,
        contentType: a.content_type,
        size: a.size,
        width: a.width,
        height: a.height,
        createdAt: tsToIso(a.created_at),
    })) || [],
    mentions: m.mentions || [],
    reactions: m.reactions?.map((r: any) => ({
        id: r.id,
        messageId: r.message_id,
        userId: r.user_id,
        emoji: r.emoji,
        createdAt: tsToIso(r.created_at),
    })) || [],
    pinned: !!m.pinned,
});

const Chat: React.FC = () => {
    const { currentRoomId, rooms, members } = useRoomsStore();
    const { messages, addMessage, setMessages, updateMessage, deleteMessage } = useMessagesStore();
    const { user } = useAuthStore();
    const { getUser, fetchUser } = useUsersStore();
    const { typingUsers } = useTypingStore();
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [replyingTo, setReplyingTo] = useState<UiMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<UiMessage | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: UiMessage } | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const [sendError, setSendError] = useState<string | null>(null);
    const [attachments, setAttachments] = useState<File[]>([]);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLInputElement>(null);
    const initialLoadRef = useRef(true);
    const markAsReadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastMarkedMessageRef = useRef<string | null>(null);
    const markInFlightRef = useRef(false);
    const isMountedRef = useRef(true);
    const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isTypingRef = useRef(false);
    const [avatarHistoryUser, setAvatarHistoryUser] = useState<{ id: string; name: string } | null>(null);

    const currentRoom = rooms.find(r => r.id === currentRoomId);
    const roomMessages = currentRoomId ? messages[currentRoomId] || [] : [];
    const roomMembers = currentRoomId ? members[currentRoomId] || [] : [];
    const pinnedMessages = roomMessages.filter(m => m.pinned);

    // Typing indicators
    const activeTypingUsers = currentRoomId ? Array.from(typingUsers[currentRoomId] || []) : [];
    const otherTypingUsers = activeTypingUsers.filter(id => id !== user?.id);

    const getMemberInfo = useCallback((userId: string) => {
        const member = roomMembers.find(m => m.userId === userId);
        return member;
    }, [roomMembers]);

    const getDisplayName = useCallback((userId: string) => {
        if (userId === user?.id) {
            return user?.displayName || user?.handle || 'You';
        }

        const cachedUser = getUser(userId);
        if (cachedUser) {
            const member = getMemberInfo(userId);
            if (member?.nickname) return member.nickname;
            return cachedUser.displayName || cachedUser.handle;
        }

        return userId.split('-')[0];
    }, [user, getUser, getMemberInfo]);

    const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
        messagesEndRef.current?.scrollIntoView({ behavior });
    };

    const isNearBottom = () => {
        const el = scrollContainerRef.current;
        if (!el) return true;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 150;
    };

    const scrollToMessage = (messageId: string) => {
        const el = document.getElementById(`msg-${messageId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'instant', block: 'center' });
            el.classList.add('bg-primary-900/20');
            setTimeout(() => el.classList.remove('bg-primary-900/20'), 1500);
            return true;
        }
        return false;
    };

    const loadMessages = useCallback(async () => {
        if (!currentRoomId) return;
        setLoading(true);
        try {
            const res = await window.concord.getMessages(currentRoomId, 50);

            if (!res || !res.messages) {
                console.warn('[Chat] No messages in response');
                setMessages(currentRoomId, []);
                return;
            }

            const mapped = res.messages.map(mapMessage);
            setMessages(currentRoomId, mapped);

            const uniqueUserIds = [...new Set(mapped.map((m: UiMessage) => m.authorId))] as string[];
            if (uniqueUserIds.length > 0) {
                const { fetchUsers } = useUsersStore.getState();
                setTimeout(() => fetchUsers(uniqueUserIds), 0);
            }
        } catch (err: any) {
            console.error('[Chat] Failed to load messages:', err);
            setMessages(currentRoomId, []);
        } finally {
            setLoading(false);
        }
    }, [currentRoomId, setMessages]);

    useEffect(() => {
        if (currentRoomId) {
            loadMessages();
        }
    }, [currentRoomId, loadMessages]);

    useEffect(() => {
        if (roomMessages.length > 0) {
            const uniqueUserIds = [...new Set(roomMessages.map(m => m.authorId))];
            if (uniqueUserIds.length > 0) {
                const { fetchUsers } = useUsersStore.getState();
                fetchUsers(uniqueUserIds);
            }
        }
    }, [roomMessages]);

    useEffect(() => {
        if (!currentRoomId || roomMessages.length === 0) return;

        if (initialLoadRef.current) {
            initialLoadRef.current = false;
            const lastReadId = useNotificationStore.getState().getLastRead('room', currentRoomId);

            if (lastReadId) {
                const lastReadIndex = roomMessages.findIndex(m => m.id === lastReadId);
                const hasUnread = lastReadIndex >= 0 && lastReadIndex < roomMessages.length - 1;

                if (hasUnread) {
                    const nextUnreadId = roomMessages[lastReadIndex + 1]?.id;
                    if (nextUnreadId) {
                        requestAnimationFrame(() => scrollToMessage(nextUnreadId));
                        return;
                    }
                }
            }
            requestAnimationFrame(() => scrollToBottom('instant'));
            return;
        }

        if (isNearBottom()) {
            scrollToBottom();
        }
    }, [roomMessages.length, currentRoomId]);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

    const lastRealMessageId = useMemo(() => {
        if (!roomMessages || roomMessages.length === 0) return null;
        for (let i = roomMessages.length - 1; i >= 0; i--) {
            const id = roomMessages[i].id;
            if (!id.startsWith('temp-')) return id;
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
            if (!isMountedRef.current) return;
            if (markInFlightRef.current) return;

            const activeRoomId = useRoomsStore.getState().currentRoomId;
            if (activeRoomId !== roomId) return;

            const currentLastRead = useNotificationStore.getState().getLastRead('room', roomId);
            if (currentLastRead === messageId) return;

            markInFlightRef.current = true;
            lastMarkedMessageRef.current = messageId;

            window.concord.markAsRead(roomId, messageId)
                .then((res: { last_read_message_id: string; }) => {
                    useNotificationStore.getState().setLastRead('room', roomId, res.last_read_message_id);
                })
                .catch((err: any) => console.error('[Chat] Failed to mark as read:', err))
                .finally(() => { markInFlightRef.current = false; });
        }, 1000);

        return () => {
            if (markAsReadTimeoutRef.current) {
                clearTimeout(markAsReadTimeoutRef.current);
            }
        };
    }, [currentRoomId, lastRealMessageId]);

    useEffect(() => {
        lastMarkedMessageRef.current = null;
        initialLoadRef.current = true;
    }, [currentRoomId]);

    const handleTyping = () => {
        if (!currentRoomId) return;

        if (!isTypingRef.current) {
            isTypingRef.current = true;
            window.concord.startTyping(currentRoomId).catch(console.error);
        }

        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
            isTypingRef.current = false;
            window.concord.stopTyping(currentRoomId).catch(console.error);
        }, 3000);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!newMessage.trim() && attachments.length === 0) {
            return;
        }

        if (!currentRoomId) {
            return;
        }

        if (!user?.id) {
            setSendError('You must be logged in to send messages');
            return;
        }

        setSendError(null);
        const content = newMessage.trim() || (attachments.length > 0 ? ' ' : '');
        const filesToSend = [...attachments];
        const tempId = `temp-${Date.now()}`;

        // Stop typing immediately when sending
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        isTypingRef.current = false;
        window.concord.stopTyping(currentRoomId).catch(console.error);

        setNewMessage('');
        setAttachments([]);

        const optimisticMessage: UiMessage = {
            id: tempId,
            roomId: currentRoomId,
            authorId: user.id,
            content: content,
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
                const response = await window.concord.editMessage(editingMessage.id, content);
                if (response) {
                    updateMessage(currentRoomId, editingMessage.id, content);
                }
                setEditingMessage(null);
            } else {
                const mentions = extractMentions(content);
                let attachmentData: Array<{
                    filename: string;
                    content_type: string;
                    data: number[];
                    width?: number;
                    height?: number;
                }> | undefined;

                if (filesToSend.length > 0) {
                    attachmentData = await Promise.all(
                        filesToSend.map(async (file) => {
                            const arrayBuffer = await file.arrayBuffer();
                            const uint8Array = new Uint8Array(arrayBuffer);

                            let width: number | undefined;
                            let height: number | undefined;

                            if (file.type.startsWith('image/')) {
                                try {
                                    const dimensions = await getImageDimensions(file);
                                    width = dimensions.width;
                                    height = dimensions.height;
                                } catch (err) {
                                    console.error('[Chat] Failed to get image dimensions:', err);
                                }
                            }

                            return {
                                filename: file.name,
                                content_type: file.type,
                                data: Array.from(uint8Array),
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

                if (response && response.message) {
                    const mapped = mapMessage(response.message);
                    addMessage(currentRoomId, mapped);
                    scrollToBottom();
                } else {
                    console.warn('[Chat] No message in response');
                }

                setReplyingTo(null);
            }
        } catch (err: any) {
            console.error('[Chat] Failed to send message:', err);
            deleteMessage(currentRoomId, tempId);
            setNewMessage(content);
            setAttachments(filesToSend);
            setSendError(err?.message || 'Failed to send message');
            setTimeout(() => setSendError(null), 5000);
        }
    };

    const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.width, height: img.height }); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')); };
            img.src = url;
        });
    };

    const extractMentions = (content: string): string[] => {
        const mentionRegex = /@([a-zA-Z0-9_-]+)/g;
        const matches = content.matchAll(mentionRegex);
        const mentionedHandles = Array.from(matches, m => m[1]);
        return roomMembers
            .filter(m => mentionedHandles.some(h => m.userId.includes(h)))
            .map(m => m.userId);
    };

    const handleDeleteMessage = async (messageId: string) => {
        if (!currentRoomId) return;
        try {
            await window.concord.deleteMessage(messageId);
            deleteMessage(currentRoomId, messageId);
        } catch (err: any) {
            console.error('[Chat] Failed to delete message:', err);
        }
    };

    const handlePinMessage = async (messageId: string, isPinned: boolean) => {
        if (!currentRoomId) return;
        try {
            if (isPinned) await window.concord.unpinMessage(currentRoomId, messageId);
            else await window.concord.pinMessage(currentRoomId, messageId);
            await loadMessages();
        } catch (err: any) {
            console.error('[Chat] Failed to pin/unpin message:', err);
        }
    };

    const handleAddReaction = async (messageId: string, emoji: string) => {
        try { await window.concord.addReaction(messageId, emoji); }
        catch (err: any) { console.error('[Chat] Failed to add reaction:', err); }
    };

    const handleRemoveReaction = async (messageId: string, emoji: string) => {
        try { await window.concord.removeReaction(messageId, emoji); }
        catch (err: any) { console.error('[Chat] Failed to remove reaction:', err); }
    };

    const handleFileUpload = async (file: File) => {
        if (!currentRoomId) return;
        setAttachments(prev => [...prev, file]);
    };

    const removeAttachment = (index: number) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (item.kind === 'file') {
                e.preventDefault();
                const file = item.getAsFile();
                if (file) setAttachments(prev => [...prev, file]);
            }
        }
    }, []);

    const handleInviteMember = async (userId: string) => {
        if (!currentRoomId) return;
        try {
            await window.concord.inviteMember(currentRoomId, userId);
            const res = await window.concord.getMembers(currentRoomId);
            const { setMembers } = useRoomsStore.getState();
            setMembers(currentRoomId, res?.members || []);
        } catch (err: any) {
            console.error('[Chat] Failed to invite member:', err);
            throw err;
        }
    };

    const handleContextMenu = (e: React.MouseEvent, message: UiMessage) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, message });
    };

    const getContextMenuItems = (message: UiMessage): ContextMenuItem[] => {
        const items: ContextMenuItem[] = [
            {
                label: 'Reply',
                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>,
                onClick: () => setReplyingTo(message),
            },
            {
                label: 'Add Reaction',
                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                onClick: () => setShowReactionPicker(message.id),
            },
            {
                label: message.pinned ? 'Unpin Message' : 'Pin Message',
                icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" /></svg>,
                onClick: () => handlePinMessage(message.id, message.pinned || false),
            },
            { separator: true, label: '', onClick: () => {} },
            {
                label: 'Copy Message ID',
                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>,
                onClick: () => navigator.clipboard.writeText(message.id),
            },
        ];

        if (message.authorId === user?.id && !message.deleted) {
            items.push(
                { separator: true, label: '', onClick: () => {} },
                {
                    label: 'Edit Message',
                    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>,
                    onClick: () => {
                        setEditingMessage(message);
                        setNewMessage(message.content);
                        messageInputRef.current?.focus();
                    },
                },
                {
                    label: 'Delete Message',
                    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
                    onClick: () => handleDeleteMessage(message.id),
                    danger: true,
                }
            );
        }
        return items;
    };

    if (!currentRoomId) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-900">
                <div className="text-center">
                    <div className="text-6xl mb-4">💬</div>
                    <h3 className="text-xl font-semibold text-white mb-2">No room selected</h3>
                    <p className="text-dark-400">Select a room from the sidebar to start chatting</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-dark-900 min-w-0">
            <div className="h-14 border-b border-dark-700 flex items-center justify-between px-4 flex-shrink-0">
                <div className="flex items-center space-x-2 min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-white truncate"># {currentRoom?.name}</h2>
                    {currentRoom?.description && (
                        <span className="ml-3 text-sm text-dark-400 truncate hidden sm:block">— {currentRoom.description}</span>
                    )}
                </div>
                <button onClick={() => setShowInviteModal(true)} className="flex-shrink-0 p-2 hover:bg-dark-700 rounded-lg transition">
                    <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>
                </button>
            </div>

            {pinnedMessages.length > 0 && (
                <div className="bg-primary-900 bg-opacity-10 border-b border-primary-600 p-3 flex-shrink-0">
                    <div className="flex items-start space-x-2">
                        <svg className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" /></svg>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-primary-300 mb-1">{pinnedMessages.length} Pinned Message{pinnedMessages.length !== 1 && 's'}</div>
                            <div className="text-sm text-dark-300 truncate">{pinnedMessages[0].content}</div>
                        </div>
                    </div>
                </div>
            )}

            {sendError && (
                <div className="bg-red-500 bg-opacity-10 border-b border-red-500 p-3 flex-shrink-0">
                    <div className="flex items-center space-x-2">
                        <svg className="w-5 h-5 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <span className="text-sm text-red-500">{sendError}</span>
                    </div>
                </div>
            )}

            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full"><div className="text-dark-400">Loading messages...</div></div>
                ) : roomMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="text-4xl mb-2">👋</div>
                            <p className="text-dark-400">No messages yet. Start the conversation!</p>
                        </div>
                    </div>
                ) : (
                    roomMessages.map(msg => {
                        const replyToMessage = msg.replyToId ? roomMessages.find(m => m.id === msg.replyToId) : null;
                        const isOptimistic = msg.id.startsWith('temp-');

                        return (
                            <div key={msg.id} id={`msg-${msg.id}`} className={`flex items-start space-x-3 group transition-colors duration-1000 ${isOptimistic ? 'opacity-60' : ''}`} onContextMenu={(e) => !isOptimistic && handleContextMenu(e, msg)}>
                                <Avatar
                                    userId={msg.authorId}
                                    size="md"
                                    showStatus={false}
                                    onClick={() => setAvatarHistoryUser({ id: msg.authorId, name: getDisplayName(msg.authorId) })}
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline space-x-2">
                                        <span className="font-semibold text-white text-sm truncate">{getDisplayName(msg.authorId)}</span>
                                        <span className="text-xs text-dark-400 flex-shrink-0">{new Date(msg.createdAt).toLocaleTimeString()}</span>
                                        {msg.editedAt && <span className="text-xs text-dark-500 flex-shrink-0">(edited)</span>}
                                        {msg.pinned && <svg className="w-4 h-4 text-primary-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" /></svg>}
                                        {isOptimistic && <span className="text-xs text-dark-500 flex-shrink-0">(sending...)</span>}
                                    </div>

                                    {replyToMessage && <div className="mt-2"><MessageReply replyTo={replyToMessage} /></div>}

                                    <p className={`text-dark-200 mt-1 break-words ${msg.deleted ? 'italic text-dark-500' : ''}`}>{msg.deleted ? 'Message deleted' : msg.content}</p>

                                    {!msg.deleted && msg.attachments && msg.attachments.length > 0 && (
                                        <div className="mt-2 space-y-2">{msg.attachments.map(attachment => <MessageAttachment key={attachment.id} attachment={attachment} />)}</div>
                                    )}

                                    {!msg.deleted && msg.reactions && msg.reactions.length > 0 && (
                                        <MessageReactions
                                            messageId={msg.id}
                                            reactions={msg.reactions}
                                            onAddReaction={(emoji) => handleAddReaction(msg.id, emoji)}
                                            onRemoveReaction={(emoji) => handleRemoveReaction(msg.id, emoji)}
                                            onOpenPicker={() => setShowReactionPicker(msg.id)}
                                        />
                                    )}

                                    <MessageReadReceipts roomId={currentRoomId} messageId={msg.id} />

                                    {(msg.replyCount ?? 0) > 0 && <button className="mt-2 text-xs text-primary-400 hover:text-primary-300 transition">{msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}</button>}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <VoiceControls roomId={currentRoomId} />

            <div className="p-4 border-t border-dark-700 flex-shrink-0">
                {otherTypingUsers.length > 0 && (
                    <div className="text-xs text-dark-400 mb-2 italic animate-pulse">
                        {otherTypingUsers.map(id => getDisplayName(id)).join(', ')} {otherTypingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                )}

                {replyingTo && <div className="mb-2"><MessageReply replyTo={replyingTo} onCancel={() => setReplyingTo(null)} /></div>}

                {editingMessage && (
                    <div className="mb-2 flex items-center justify-between px-3 py-2 bg-dark-800 rounded">
                        <div className="text-sm text-primary-400">Editing message</div>
                        <button onClick={() => { setEditingMessage(null); setNewMessage(''); }} className="text-dark-400 hover:text-white transition">Cancel</button>
                    </div>
                )}

                {attachments.length > 0 && (
                    <div className="px-4 pb-2">
                        <div className="flex flex-wrap gap-2">
                            {attachments.map((file, index) => (
                                <div key={index} className="relative bg-dark-800 border border-dark-600 rounded-lg p-2 flex items-center space-x-2">
                                    <div className="flex-shrink-0">
                                        {file.type.startsWith('image/') ? <img src={URL.createObjectURL(file)} alt={file.name} className="w-12 h-12 object-cover rounded" /> : <div className="w-12 h-12 bg-dark-700 rounded flex items-center justify-center"><svg className="w-6 h-6 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg></div>}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-white truncate">{file.name}</div>
                                        <div className="text-xs text-dark-400">{(file.size / 1024).toFixed(1)} KB</div>
                                    </div>
                                    <button type="button" onClick={() => removeAttachment(index)} className="flex-shrink-0 p-1 hover:bg-dark-700 rounded transition"><svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <form onSubmit={handleSendMessage} className="flex space-x-2">
                    <FileUpload onFileSelect={handleFileUpload} disabled={uploadingFile} />
                    <input
                        ref={messageInputRef}
                        type="text"
                        value={newMessage}
                        onChange={e => { setNewMessage(e.target.value); handleTyping(); }}
                        onPaste={handlePaste}
                        placeholder={`Message # ${currentRoom?.name}`}
                        className="flex-1 min-w-0 px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button type="submit" disabled={!newMessage.trim() && attachments.length === 0} className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">{editingMessage ? 'Save' : 'Send'}</button>
                </form>
            </div>

            {showReactionPicker && <ReactionPicker onSelect={(emoji) => handleAddReaction(showReactionPicker, emoji)} onClose={() => setShowReactionPicker(null)} />}
            {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} items={getContextMenuItems(contextMenu.message)} onClose={() => setContextMenu(null)} />}
            {showInviteModal && <InviteMemberModal roomId={currentRoomId} onClose={() => setShowInviteModal(false)} onInvite={handleInviteMember} />}
            {avatarHistoryUser && (
                <AvatarHistoryModal
                    userId={avatarHistoryUser.id}
                    displayName={avatarHistoryUser.name}
                    onClose={() => setAvatarHistoryUser(null)}
                />
            )}
        </div>
    );
};

export default Chat;