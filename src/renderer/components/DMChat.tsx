import React, { useState, useEffect, useRef, useCallback } from 'react';
import DMCallControls from './DMCallControls';
import VoiceControls from './VoiceControls';
import { useDMStore } from '../hooks/useDMStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useNotificationStore } from '../hooks/useNotificationStore';
import { useDMCallStore } from '../hooks/useDMCallStore';
import MessageAttachment from './MessageAttachment';

const tsToIso = (ts: any): string => {
    if (!ts) return new Date().toISOString();
    return typeof ts === 'string' ? ts : new Date(Number(ts.seconds || 0) * 1000).toISOString();
};

const DMChat: React.FC = () => {
    const { currentChannelId, channels, messages, loadMessages, addMessage } = useDMStore();
    const { user } = useAuthStore();
    const [newMessage, setNewMessage] = useState('');
    const [sending, setSending] = useState(false);
    const { markAsRead, clearUnread } = useNotificationStore();
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { active: callActive, channelId: activeCallChannelId } = useDMCallStore();

    const currentChannel = channels.find(ch => ch.channel.id === currentChannelId);
    const channelMessages = currentChannelId ? messages[currentChannelId] || [] : [];

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    useEffect(() => {
        if (currentChannelId) loadMessages(currentChannelId);
    }, [currentChannelId, loadMessages]);

    useEffect(() => {
        scrollToBottom();
    }, [channelMessages.length, scrollToBottom]);

    useEffect(() => {
        if (!currentChannelId || channelMessages.length === 0) return;

        const lastMessage = channelMessages[channelMessages.length - 1];
        if (!lastMessage || lastMessage.id.startsWith('temp-')) return;

        const lastReadId = useNotificationStore.getState().getLastRead('dm', currentChannelId);
        if (lastReadId === lastMessage.id) return;

        markAsRead('dm', currentChannelId, lastMessage.id);
        clearUnread('dm', currentChannelId);
    }, [currentChannelId, channelMessages, markAsRead, clearUnread]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentChannelId || sending) return;

        const content = newMessage.trim();
        setNewMessage('');
        setSending(true);

        const tempId = `temp-${Date.now()}`;
        addMessage(currentChannelId, {
            id: tempId,
            channelId: currentChannelId,
            authorId: user?.id || '',
            content,
            createdAt: new Date().toISOString(),
            deleted: false,
            attachments: [],
        });

        try {
            const response = await window.concord.sendDMMessage(currentChannelId, content);
            if (response?.message) {
                const realMessage = {
                    id: response.message.id,
                    channelId: response.message.channel_id || currentChannelId,
                    authorId: response.message.author_id,
                    content: response.message.content,
                    createdAt: tsToIso(response.message.created_at),
                    deleted: false,
                    attachments: response.message.attachments || [],
                };

                useDMStore.setState((state) => {
                    const existing = state.messages[currentChannelId] || [];
                    const filtered = existing.filter(m => m.id !== tempId);
                    if (filtered.some(m => m.id === realMessage.id)) {
                        return { messages: { ...state.messages, [currentChannelId]: filtered } };
                    }
                    return { messages: { ...state.messages, [currentChannelId]: [...filtered, realMessage] } };
                });
            }
        } catch (err) {
            console.error('Failed to send DM:', err);
            useDMStore.setState((state) => ({
                messages: {
                    ...state.messages,
                    [currentChannelId]: (state.messages[currentChannelId] || []).filter(m => m.id !== tempId),
                },
            }));
            setNewMessage(content);
        } finally {
            setSending(false);
        }
    };

    if (!currentChannelId || !currentChannel) {
        return (
            <div className="flex-1 flex items-center justify-center bg-dark-900">
                <div className="text-center">
                    <div className="text-6xl mb-4">💬</div>
                    <h3 className="text-xl font-semibold text-white mb-2">Select a conversation</h3>
                    <p className="text-dark-400">Choose a friend to start messaging</p>
                </div>
            </div>
        );
    }

    const otherUser = {
        id: currentChannel.otherUserId,
        displayName: currentChannel.otherUserDisplay,
        avatarUrl: currentChannel.otherUserAvatar,
        status: currentChannel.otherUserStatus,
    };

    const showVoiceControls = callActive && activeCallChannelId === currentChannelId;

    return (
        <div className="flex-1 flex flex-col bg-dark-900 min-w-0">
            <div className="h-14 border-b border-dark-700 flex items-center px-4 flex-shrink-0 justify-between">
                <div className="flex items-center space-x-3">
                    <div className="relative">
                        <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center overflow-hidden">
                            {otherUser.avatarUrl ? (
                                <img src={otherUser.avatarUrl} alt={otherUser.displayName} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-white font-semibold text-sm">
                                    {otherUser.displayName?.[0]?.toUpperCase() || '?'}
                                </span>
                            )}
                        </div>
                        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-dark-700 ${
                            otherUser.status === 'online' ? 'bg-green-500' :
                                otherUser.status === 'idle' ? 'bg-yellow-500' :
                                    otherUser.status === 'dnd' ? 'bg-red-500' : 'bg-dark-500'
                        }`} />
                    </div>
                    <div>
                        <h2 className="text-white font-semibold">{otherUser.displayName}</h2>
                        <p className="text-xs text-dark-400">@{currentChannel.otherUserHandle}</p>
                    </div>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {channelMessages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-primary-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="text-white font-bold text-2xl">
                                    {otherUser.displayName?.[0]?.toUpperCase() || '?'}
                                </span>
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">{otherUser.displayName}</h3>
                            <p className="text-dark-400">
                                This is the beginning of your conversation with {otherUser.displayName}
                            </p>
                        </div>
                    </div>
                ) : (
                    channelMessages.map((msg) => {
                        const isOwn = msg.authorId === user?.id;
                        const isOptimistic = msg.id.startsWith('temp-');

                        return (
                            <div
                                key={msg.id}
                                className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${isOptimistic ? 'opacity-60' : ''}`}
                            >
                                <div className={`max-w-[70%]`}>
                                    <div className={`px-4 py-2 rounded-2xl ${
                                        isOwn
                                            ? 'bg-primary-600 text-white rounded-br-md'
                                            : 'bg-dark-700 text-white rounded-bl-md'
                                    }`}>
                                        <p className="break-words">{msg.content}</p>
                                    </div>
                                    {msg.attachments?.length > 0 && (
                                        <div className={`mt-2 ${isOwn ? 'text-right' : 'text-left'}`}>
                                            {msg.attachments.map((att: any) => (
                                                <MessageAttachment key={att.id} attachment={att} />
                                            ))}
                                        </div>
                                    )}
                                    <div className={`text-xs text-dark-500 mt-1 ${isOwn ? 'text-right' : 'text-left'}`}>
                                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        {isOptimistic && ' · Sending...'}
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </div>

            {showVoiceControls ? (
                <VoiceControls roomId={currentChannelId} isDM={true} />
            ) : (
                <DMCallControls channelId={currentChannelId} otherUserName={otherUser.displayName} />
            )}

            <div className="p-4 border-t border-dark-700 flex-shrink-0">
                <form onSubmit={handleSend} className="flex space-x-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder={`Message @${currentChannel.otherUserHandle}`}
                        className="flex-1 px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim() || sending}
                        className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
};

export default DMChat;