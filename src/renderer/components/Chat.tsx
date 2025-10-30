import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useMessagesStore } from '../hooks/useMessagesStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useUsersStore } from '../hooks/useUsersStore';
import VoiceControls from './VoiceControls';
import MessageAttachment from './MessageAttachment';
import MessageReply from './MessageReply';
import ReactionPicker from './ReactionPicker';
import FileUpload from './FileUpload';
import ContextMenu, { ContextMenuItem } from './ContextMenu';
import InviteMemberModal from './InviteMemberModal';
import { Message as UiMessage } from '../types';
import MessageReactions from './MessageReaction';

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
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [replyingTo, setReplyingTo] = useState<UiMessage | null>(null);
    const [editingMessage, setEditingMessage] = useState<UiMessage | null>(null);
    const [showReactionPicker, setShowReactionPicker] = useState<string | null>(null);
    const [uploadingFile, setUploadingFile] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; message: UiMessage } | null>(null);
    const [showInviteModal, setShowInviteModal] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messageInputRef = useRef<HTMLInputElement>(null);

    const currentRoom = rooms.find(r => r.id === currentRoomId);
    const roomMessages = currentRoomId ? messages[currentRoomId] || [] : [];
    const roomMembers = currentRoomId ? members[currentRoomId] || [] : [];
    const pinnedMessages = roomMessages.filter(m => m.pinned);

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

        fetchUser(userId);
        return userId.split('-')[0];
    }, [user, getUser, fetchUser, getMemberInfo]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const loadMessages = useCallback(async () => {
        if (!currentRoomId) return;
        setLoading(true);
        try {
            const res = await window.concord.getMessages(currentRoomId, 50);
            const mapped = (res?.messages ?? []).map(mapMessage);
            setMessages(currentRoomId, mapped);

            const uniqueUserIds = [...new Set(mapped.map((m: UiMessage) => m.authorId))] as string[];
            const { fetchUsers } = useUsersStore.getState();
            await fetchUsers(uniqueUserIds);
        } catch (err) {
            console.error('Failed to load messages:', err);
        } finally {
            setLoading(false);
        }
    }, [currentRoomId, setMessages]);

    useEffect(() => {
        if (currentRoomId) loadMessages();
    }, [currentRoomId, loadMessages]);

    useEffect(() => {
        const uniqueUserIds = [...new Set(roomMessages.map(m => m.authorId))];
        if (uniqueUserIds.length > 0) {
            const { fetchUsers } = useUsersStore.getState();
            fetchUsers(uniqueUserIds);
        }
    }, [roomMessages]);

    useEffect(() => {
        scrollToBottom();
    }, [roomMessages.length]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentRoomId) return;

        const content = newMessage;
        setNewMessage('');

        try {
            if (editingMessage) {
                await window.concord.editMessage(editingMessage.id, content);
                updateMessage(currentRoomId, editingMessage.id, content);
                setEditingMessage(null);
            } else {
                const mentions = extractMentions(content);
                const res = await window.concord.sendMessage(
                    currentRoomId,
                    content,
                    replyingTo?.id,
                    mentions
                );
                if (res?.message) {
                    const mapped = mapMessage(res.message);
                    addMessage(currentRoomId, mapped);
                }
                setReplyingTo(null);
            }
        } catch (err) {
            console.error('Failed to send message:', err);
            setNewMessage(content);
        }
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
        } catch (err) {
            console.error('Failed to delete message:', err);
        }
    };

    const handlePinMessage = async (messageId: string, isPinned: boolean) => {
        if (!currentRoomId) return;
        try {
            if (isPinned) {
                await window.concord.unpinMessage(currentRoomId, messageId);
            } else {
                await window.concord.pinMessage(currentRoomId, messageId);
            }
            await loadMessages();
        } catch (err) {
            console.error('Failed to pin/unpin message:', err);
        }
    };

    const handleAddReaction = async (messageId: string, emoji: string) => {
        try {
            await window.concord.addReaction(messageId, emoji);
            await loadMessages();
        } catch (err) {
            console.error('Failed to add reaction:', err);
        }
    };

    const handleRemoveReaction = async (messageId: string, emoji: string) => {
        try {
            await window.concord.removeReaction(messageId, emoji);
            await loadMessages();
        } catch (err) {
            console.error('Failed to remove reaction:', err);
        }
    };

    const handleFileUpload = async (file: File) => {
        if (!currentRoomId) return;
        setUploadingFile(true);
        try {
            const result = await window.concord.uploadAttachment(file);
            console.log('File uploaded:', result);
        } catch (err) {
            console.error('Failed to upload file:', err);
        } finally {
            setUploadingFile(false);
        }
    };

    const handleInviteMember = async (userId: string) => {
        if (!currentRoomId) return;
        try {
            await window.concord.inviteMember(currentRoomId, userId);
            const res = await window.concord.getMembers(currentRoomId);
            const { setMembers } = useRoomsStore.getState();
            setMembers(currentRoomId, res?.members || []);
        } catch (err) {
            console.error('Failed to invite member:', err);
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
                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>,
                onClick: () => setReplyingTo(message),
            },
            {
                label: 'Add Reaction',
                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>,
                onClick: () => setShowReactionPicker(message.id),
            },
            {
                label: message.pinned ? 'Unpin Message' : 'Pin Message',
                icon: <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                </svg>,
                onClick: () => handlePinMessage(message.id, message.pinned || false),
            },
            { separator: true, label: '', onClick: () => {} },
            {
                label: 'Copy Message ID',
                icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>,
                onClick: () => navigator.clipboard.writeText(message.id),
            },
        ];

        if (message.authorId === user?.id && !message.deleted) {
            items.push(
                { separator: true, label: '', onClick: () => {} },
                {
                    label: 'Edit Message',
                    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>,
                    onClick: () => {
                        setEditingMessage(message);
                        setNewMessage(message.content);
                        messageInputRef.current?.focus();
                    },
                },
                {
                    label: 'Delete Message',
                    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>,
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
                <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex-shrink-0 p-2 hover:bg-dark-700 rounded-lg transition"
                    title="Invite Member"
                >
                    <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                </button>
            </div>

            {pinnedMessages.length > 0 && (
                <div className="bg-primary-900 bg-opacity-10 border-b border-primary-600 p-3 flex-shrink-0">
                    <div className="flex items-start space-x-2">
                        <svg className="w-5 h-5 text-primary-400 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                        </svg>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-primary-300 mb-1">
                                {pinnedMessages.length} Pinned Message{pinnedMessages.length !== 1 && 's'}
                            </div>
                            <div className="text-sm text-dark-300 truncate">
                                {pinnedMessages[0].content}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-dark-400">Loading messages...</div>
                    </div>
                ) : roomMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="text-4xl mb-2">👋</div>
                            <p className="text-dark-400">No messages yet. Start the conversation!</p>
                        </div>
                    </div>
                ) : (
                    roomMessages.map(msg => {
                        const replyToMessage = msg.replyToId
                            ? roomMessages.find(m => m.id === msg.replyToId)
                            : null;

                        return (
                            <div
                                key={msg.id}
                                className="flex items-start space-x-3 group"
                                onContextMenu={(e) => handleContextMenu(e, msg)}
                            >
                                <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-white font-semibold text-sm">
                                        {getDisplayName(msg.authorId).charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-baseline space-x-2">
                                        <span className="font-semibold text-white text-sm truncate">
                                            {getDisplayName(msg.authorId)}
                                        </span>
                                        <span className="text-xs text-dark-400 flex-shrink-0">
                                            {new Date(msg.createdAt).toLocaleTimeString()}
                                        </span>
                                        {msg.editedAt && (
                                            <span className="text-xs text-dark-500 flex-shrink-0">(edited)</span>
                                        )}
                                        {msg.pinned && (
                                            <svg className="w-4 h-4 text-primary-400" fill="currentColor" viewBox="0 0 20 20">
                                                <path d="M10 2a1 1 0 011 1v1.323l3.954 1.582 1.599-.8a1 1 0 01.894 1.79l-1.233.616 1.738 5.42a1 1 0 01-.285 1.05A3.989 3.989 0 0115 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.715-5.349L11 6.477V16h2a1 1 0 110 2H7a1 1 0 110-2h2V6.477L6.237 7.582l1.715 5.349a1 1 0 01-.285 1.05A3.989 3.989 0 015 15a3.989 3.989 0 01-2.667-1.019 1 1 0 01-.285-1.05l1.738-5.42-1.233-.617a1 1 0 01.894-1.788l1.599.799L9 4.323V3a1 1 0 011-1z" />
                                            </svg>
                                        )}
                                    </div>

                                    {replyToMessage && (
                                        <div className="mt-2">
                                            <MessageReply replyTo={replyToMessage} />
                                        </div>
                                    )}

                                    <p className={`text-dark-200 mt-1 break-words ${msg.deleted ? 'italic text-dark-500' : ''}`}>
                                        {msg.deleted ? 'Message deleted' : msg.content}
                                    </p>

                                    {!msg.deleted && msg.attachments && msg.attachments.length > 0 && (
                                        <div className="mt-2 space-y-2">
                                            {msg.attachments.map(attachment => (
                                                <MessageAttachment key={attachment.id} attachment={attachment} />
                                            ))}
                                        </div>
                                    )}

                                    {!msg.deleted && msg.reactions && msg.reactions.length > 0 && (
                                        <MessageReactions
                                            messageId={msg.id}
                                            reactions={msg.reactions}
                                            onAddReaction={() => setShowReactionPicker(msg.id)}
                                            onRemoveReaction={(emoji) => handleRemoveReaction(msg.id, emoji)}
                                        />
                                    )}

                                    {(msg.replyCount ?? 0) > 0 && (
                                        <button className="mt-2 text-xs text-primary-400 hover:text-primary-300 transition">
                                            {msg.replyCount} {msg.replyCount === 1 ? 'reply' : 'replies'}
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            <VoiceControls roomId={currentRoomId} />

            <div className="p-4 border-t border-dark-700 flex-shrink-0">
                {replyingTo && (
                    <div className="mb-2">
                        <MessageReply replyTo={replyingTo} onCancel={() => setReplyingTo(null)} />
                    </div>
                )}

                {editingMessage && (
                    <div className="mb-2 flex items-center justify-between px-3 py-2 bg-dark-800 rounded">
                        <div className="text-sm text-primary-400">
                            Editing message
                        </div>
                        <button
                            onClick={() => {
                                setEditingMessage(null);
                                setNewMessage('');
                            }}
                            className="text-dark-400 hover:text-white transition"
                        >
                            Cancel
                        </button>
                    </div>
                )}

                <form onSubmit={handleSendMessage} className="flex space-x-2">
                    <FileUpload onFileSelect={handleFileUpload} disabled={uploadingFile} />
                    <input
                        ref={messageInputRef}
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder={`Message # ${currentRoom?.name}`}
                        className="flex-1 min-w-0 px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                    >
                        {editingMessage ? 'Save' : 'Send'}
                    </button>
                </form>
            </div>

            {showReactionPicker && (
                <ReactionPicker
                    onSelect={(emoji) => handleAddReaction(showReactionPicker, emoji)}
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
        </div>
    );
};

export default Chat;