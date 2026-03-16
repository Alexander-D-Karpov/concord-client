import React, { useState, useEffect, useRef, useCallback } from 'react';
import Modal from './Modal';
import Avatar from './Avatar';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useDMStore } from '../hooks/useDMStore';
import useAuthStore from '../hooks/useAuthStore';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { SearchIcon } from './icons';
import { formatTimestamp } from '../utils/format';
import { resolveApiUrl } from '../utils/urls';

interface SearchResult {
    type: 'room_message' | 'dm_message' | 'room' | 'dm_channel';
    id: string;
    title: string;
    subtitle: string;
    roomId?: string;
    channelId?: string;
    messageId?: string;
    timestamp?: string;
    userId?: string;
}

interface SearchModalProps {
    onClose: () => void;
    onNavigate: (result: SearchResult) => void;
}

const SearchModal: React.FC<SearchModalProps> = ({ onClose, onNavigate }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);
    const searchRequestRef = useRef(0);

    const { rooms, currentRoomId } = useRoomsStore();
    const { channels, messages: dmMessagesByChannel } = useDMStore();
    const accessToken = useAuthStore((state) => state.tokens?.accessToken);
    const { settings } = useSettingsStore();

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const searchRoomMessages = useCallback(
        async (roomId: string, q: string, limit = 10) => {
            const url = resolveApiUrl(
                `/v1/rooms/${roomId}/messages/search?query=${encodeURIComponent(q)}&limit=${limit}`,
                settings.serverAddress
            );

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
                },
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.status}`);
            }

            return response.json();
        },
        [settings.serverAddress, accessToken]
    );

    const search = useCallback(
        async (q: string) => {
            const normalized = q.trim().toLowerCase();
            const requestId = ++searchRequestRef.current;

            if (normalized.length < 2) {
                setSearching(false);

                const quickResults: SearchResult[] = [
                    ...rooms.map((room) => ({
                        type: 'room' as const,
                        id: room.id,
                        title: `# ${room.name}`,
                        subtitle: room.description || 'Room',
                        roomId: room.id,
                    })),
                    ...channels.map((channel) => ({
                        type: 'dm_channel' as const,
                        id: channel.channel.id,
                        title: channel.otherUserDisplay,
                        subtitle: `@${channel.otherUserHandle}`,
                        channelId: channel.channel.id,
                        userId: channel.otherUserId,
                    })),
                ];

                setResults(
                    quickResults.filter((result) => {
                        if (!normalized) return true;
                        return (
                            result.title.toLowerCase().includes(normalized) ||
                            result.subtitle.toLowerCase().includes(normalized)
                        );
                    })
                );
                return;
            }

            setSearching(true);

            try {
                const roomResults: SearchResult[] = rooms
                    .filter(
                        (room) =>
                            room.name.toLowerCase().includes(normalized) ||
                            (room.description || '').toLowerCase().includes(normalized)
                    )
                    .map((room) => ({
                        type: 'room' as const,
                        id: room.id,
                        title: `# ${room.name}`,
                        subtitle: room.description || 'Room',
                        roomId: room.id,
                    }));

                const dmChannelResults: SearchResult[] = channels
                    .filter(
                        (channel) =>
                            channel.otherUserDisplay.toLowerCase().includes(normalized) ||
                            channel.otherUserHandle.toLowerCase().includes(normalized)
                    )
                    .map((channel) => ({
                        type: 'dm_channel' as const,
                        id: channel.channel.id,
                        title: channel.otherUserDisplay,
                        subtitle: `@${channel.otherUserHandle}`,
                        channelId: channel.channel.id,
                        userId: channel.otherUserId,
                    }));

                const dmMessageResults: SearchResult[] = channels.flatMap((channel) => {
                    const channelMessages = dmMessagesByChannel[channel.channel.id] || [];

                    return channelMessages
                        .filter(
                            (message) =>
                                !message.deleted &&
                                !!message.content?.trim() &&
                                message.content.toLowerCase().includes(normalized)
                        )
                        .slice(-5)
                        .map((message) => ({
                            type: 'dm_message' as const,
                            id: `dm-${message.id}`,
                            title: message.content.slice(0, 100),
                            subtitle: `in DM with ${channel.otherUserDisplay}`,
                            channelId: channel.channel.id,
                            messageId: message.id,
                            timestamp: message.createdAt,
                            userId: channel.otherUserId,
                        }));
                });

                const roomMessageResults: SearchResult[] = [];

                if (currentRoomId) {
                    const response = await searchRoomMessages(currentRoomId, q, 10);
                    const currentRoom = rooms.find((room) => room.id === currentRoomId);

                    for (const message of response?.messages || []) {
                        roomMessageResults.push({
                            type: 'room_message',
                            id: `room-${message.id}`,
                            title: message.content?.slice(0, 100) || 'Message',
                            subtitle: `in #${currentRoom?.name || 'unknown'}`,
                            roomId: currentRoomId,
                            messageId: message.id,
                            timestamp: message.created_at?.seconds
                                ? new Date(Number(message.created_at.seconds) * 1000).toISOString()
                                : undefined,
                        });
                    }
                }

                if (searchRequestRef.current !== requestId) return;

                setResults([
                    ...roomResults,
                    ...dmChannelResults,
                    ...roomMessageResults,
                    ...dmMessageResults,
                ]);
            } catch (err) {
                console.error('[SearchModal] Search failed:', err);
                if (searchRequestRef.current !== requestId) return;
                setResults([]);
            } finally {
                if (searchRequestRef.current === requestId) {
                    setSearching(false);
                }
            }
        },
        [rooms, channels, currentRoomId, dmMessagesByChannel, searchRoomMessages]
    );

    useEffect(() => {
        const timer = window.setTimeout(() => {
            search(query);
        }, 200);

        return () => window.clearTimeout(timer);
    }, [query, search]);

    useEffect(() => {
        setSelectedIndex(0);
    }, [results]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (results.length === 0) return;
            setSelectedIndex((index) => Math.min(results.length - 1, index + 1));
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (results.length === 0) return;
            setSelectedIndex((index) => Math.max(0, index - 1));
            return;
        }

        if (e.key === 'Enter' && results[selectedIndex]) {
            e.preventDefault();
            onNavigate(results[selectedIndex]);
            onClose();
        }
    };

    const renderResultIcon = (result: SearchResult) => {
        if (result.type === 'dm_channel' || result.type === 'dm_message') {
            return (
                <Avatar
                    userId={result.userId || ''}
                    name={result.title}
                    size="sm"
                    showStatus={false}
                />
            );
        }

        return (
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gray-200 text-sm dark:bg-dark-600">
                {result.type === 'room' && '#'}
                {result.type === 'room_message' && '💬'}
            </div>
        );
    };

    return (
        <Modal onClose={onClose} className="max-w-xl">
            <div className="p-4">
                <div className="relative mb-3">
                    <SearchIcon
                        size="md"
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-dark-400"
                    />
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Search messages, rooms, people..."
                        className="input-base pl-10"
                    />
                </div>

                <div className="max-h-80 overflow-y-auto">
                    {searching && (
                        <div className="space-y-2 py-3">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="flex animate-pulse items-center gap-3 rounded-xl px-3 py-2.5"
                                >
                                    <div className="h-8 w-8 flex-shrink-0 rounded-lg bg-gray-200 dark:bg-dark-600" />
                                    <div className="min-w-0 flex-1">
                                        <div className="mb-2 h-4 w-2/3 rounded bg-gray-200 dark:bg-dark-600" />
                                        <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-dark-600" />
                                    </div>
                                    <div className="h-3 w-14 flex-shrink-0 rounded bg-gray-200 dark:bg-dark-600" />
                                </div>
                            ))}
                        </div>
                    )}

                    {!searching && results.length === 0 && query.trim().length >= 2 && (
                        <div className="py-8 text-center text-gray-400 dark:text-dark-400">
                            No results found
                        </div>
                    )}

                    {!searching &&
                        results.map((result, i) => (
                            <button
                                key={`${result.type}-${result.id}`}
                                onClick={() => {
                                    onNavigate(result);
                                    onClose();
                                }}
                                onMouseEnter={() => setSelectedIndex(i)}
                                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                                    i === selectedIndex
                                        ? 'bg-primary-600/10 text-gray-900 dark:text-white'
                                        : 'text-gray-700 hover:bg-gray-100 dark:text-dark-300 dark:hover:bg-dark-700'
                                }`}
                            >
                                {renderResultIcon(result)}

                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium">{result.title}</div>
                                    <div className="truncate text-xs text-gray-500 dark:text-dark-400">
                                        {result.subtitle}
                                    </div>
                                </div>

                                {result.timestamp && (
                                    <span className="flex-shrink-0 text-xs text-gray-400 dark:text-dark-500">
                                        {formatTimestamp(result.timestamp)}
                                    </span>
                                )}
                            </button>
                        ))}
                </div>

                <div className="mt-3 flex items-center gap-4 border-t border-gray-200 pt-3 text-xs text-gray-400 dark:border-dark-700 dark:text-dark-500">
                    <span>
                        <kbd className="rounded bg-gray-200 px-1.5 py-0.5 dark:bg-dark-600">↑↓</kbd> Navigate
                    </span>
                    <span>
                        <kbd className="rounded bg-gray-200 px-1.5 py-0.5 dark:bg-dark-600">Enter</kbd> Select
                    </span>
                    <span>
                        <kbd className="rounded bg-gray-200 px-1.5 py-0.5 dark:bg-dark-600">Esc</kbd> Close
                    </span>
                </div>
            </div>
        </Modal>
    );
};

export default SearchModal;