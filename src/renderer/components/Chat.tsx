import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useMessagesStore } from '../hooks/useMessagesStore';
import { useAuthStore } from '../hooks/useAuthStore';
import VoiceControls from './VoiceControls';
import { Message as UiMessage } from '@/types';

// TS -> ISO
const tsToIso = (ts: any): string => {
    if (!ts) return '';
    const seconds = Number(ts.seconds ?? 0);
    const nanos = Number(ts.nanos ?? 0);
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
};

// Server -> UI message
const mapMessage = (m: any): UiMessage => ({
    id: m.id,
    roomId: m.room_id,
    authorId: m.author_id,
    content: m.content,
    createdAt: tsToIso(m.created_at),
    editedAt: m.edited_at ? tsToIso(m.edited_at) : undefined,
    deleted: !!m.deleted,
});

const Chat: React.FC = () => {
    const { currentRoomId, rooms } = useRoomsStore();
    const { messages, addMessage, setMessages } = useMessagesStore();
    const { tokens } = useAuthStore(); // just to know we’re authenticated
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const currentRoom = rooms.find(r => r.id === currentRoomId);
    const roomMessages = currentRoomId ? messages[currentRoomId] || [] : [];

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
        } catch (err) {
            console.error('Failed to load messages:', err);
        } finally {
            setLoading(false);
        }
    }, [currentRoomId, setMessages]);

    useEffect(() => {
        if (tokens?.accessToken && currentRoomId) loadMessages();
    }, [tokens?.accessToken, currentRoomId, loadMessages]);

    useEffect(() => {
        scrollToBottom();
    }, [roomMessages.length]);

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !currentRoomId) return;

        const content = newMessage;
        setNewMessage('');

        try {
            const res = await window.concord.sendMessage(currentRoomId, content);
            if (res?.message) addMessage(currentRoomId, mapMessage(res.message));
        } catch (err) {
            console.error('Failed to send message:', err);
            setNewMessage(content); // restore input
        }
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
        <div className="flex-1 flex flex-col bg-dark-900">
            <div className="h-14 border-b border-dark-700 flex items-center px-4">
                <h2 className="text-lg font-semibold text-white"># {currentRoom?.name}</h2>
            </div>

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
                    roomMessages.map(msg => (
                        <div key={msg.id} className="flex items-start space-x-3">
                            <div className="w-10 h-10 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-semibold text-sm">
                  {msg.authorId?.charAt(0)?.toUpperCase() || '?'}
                </span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline space-x-2">
                                    <span className="font-semibold text-white text-sm">{msg.authorId}</span>
                                    <span className="text-xs text-dark-400">
                    {new Date(msg.createdAt).toLocaleTimeString()}
                  </span>
                                    {msg.editedAt && <span className="text-xs text-dark-500">(edited)</span>}
                                </div>
                                <p
                                    className={`text-dark-200 mt-1 break-words ${
                                        msg.deleted ? 'italic text-dark-500' : ''
                                    }`}
                                >
                                    {msg.deleted ? 'Message deleted' : msg.content}
                                </p>
                            </div>
                        </div>
                    ))
                )}
                <div ref={messagesEndRef} />
            </div>

            <VoiceControls roomId={currentRoomId} />

            <div className="p-4 border-t border-dark-700">
                <form onSubmit={handleSendMessage} className="flex space-x-2">
                    <input
                        type="text"
                        value={newMessage}
                        onChange={e => setNewMessage(e.target.value)}
                        placeholder={`Message # ${currentRoom?.name}`}
                        className="flex-1 px-4 py-3 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                    <button
                        type="submit"
                        disabled={!newMessage.trim()}
                        className="px-6 py-3 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Send
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Chat;
