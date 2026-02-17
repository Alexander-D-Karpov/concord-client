import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface CustomSounds {
    message?: string;
    dm?: string;
    mention?: string;
    call?: string;
}

export interface NotificationSettings {
    enabled: boolean;
    sound: boolean;
    toast: boolean;
    native: boolean;
    mentionsOnly: boolean;
    dmSound: boolean;
    dmToast: boolean;
    dmNative: boolean;
}

export interface UnreadState {
    rooms: Record<string, number>;
    dms: Record<string, number>;
    totalRooms: number;
    totalDMs: number;
    lastReadTimestamps: Record<string, string>;
}

export interface ToastNotification {
    id: string;
    type: 'message' | 'dm' | 'mention' | 'friend_request' | 'call';
    title: string;
    body: string;
    avatarInitial?: string;
    roomId?: string;
    channelId?: string;
    userId?: string;
    timestamp: number;
}

interface NotificationState {
    settings: NotificationSettings;
    customSounds: CustomSounds;
    unread: UnreadState;
    toasts: ToastNotification[];
    muted: Set<string>;
    soundsLoading: Record<string, boolean>;

    updateSettings: (settings: Partial<NotificationSettings>) => void;
    setCustomSound: (type: keyof CustomSounds, dataUrl: string | undefined) => void;
    clearCustomSound: (type: keyof CustomSounds) => void;

    addUnread: (type: 'room' | 'dm', id: string, count?: number) => void;
    setUnread: (type: 'room' | 'dm', id: string, count: number) => void;
    clearUnread: (type: 'room' | 'dm', id: string) => void;
    clearAllUnread: () => void;
    setLastRead: (type: 'room' | 'dm', id: string, messageId: string) => void;
    getLastRead: (type: 'room' | 'dm', id: string) => string | null;
    syncUnreadFromApi: () => Promise<void>;
    markAsRead: (type: 'room' | 'dm', id: string, messageId: string) => Promise<void>;

    showToast: (notification: Omit<ToastNotification, 'id' | 'timestamp'>) => void;
    dismissToast: (id: string) => void;
    clearToasts: () => void;

    muteChannel: (id: string) => void;
    unmuteChannel: (id: string) => void;
    isMuted: (id: string) => boolean;

    playSound: (type: 'message' | 'dm' | 'mention' | 'call') => void;
    previewSound: (type: keyof CustomSounds) => void;
    sendNativeNotification: (title: string, body: string, onClick?: () => void) => void;
}

const defaultSettings: NotificationSettings = {
    enabled: true,
    sound: true,
    toast: true,
    native: true,
    mentionsOnly: false,
    dmSound: true,
    dmToast: true,
    dmNative: true,
};

let audioContext: AudioContext | null = null;
const audioBuffers: Map<string, AudioBuffer> = new Map();
let audioInitialized = false;

const getAudioContext = (): AudioContext => {
    if (!audioContext || audioContext.state === 'closed') {
        audioContext = new AudioContext();
    }
    return audioContext;
};

const initializeAudio = async (): Promise<boolean> => {
    if (audioInitialized) return true;

    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        audioInitialized = true;
        console.log('[Sound] AudioContext initialized, state:', ctx.state);
        return true;
    } catch (err) {
        console.error('[Sound] Failed to initialize AudioContext:', err);
        return false;
    }
};

const createSilentBuffer = (ctx: AudioContext): AudioBuffer => {
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    return buffer;
};

const unlockAudio = async (): Promise<void> => {
    try {
        const ctx = getAudioContext();
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        const buffer = createSilentBuffer(ctx);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
        source.start(0);
        console.log('[Sound] Audio unlocked');
    } catch (err) {
        console.error('[Sound] Failed to unlock audio:', err);
    }
};

const generateBeep = (ctx: AudioContext, frequency: number = 440, duration: number = 0.15): AudioBuffer => {
    const sampleRate = ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const envelope = Math.min(1, 10 * t) * Math.min(1, 10 * (duration - t));
        data[i] = Math.sin(2 * Math.PI * frequency * t) * 0.3 * envelope;
    }

    return buffer;
};

const FALLBACK_SOUNDS: Record<string, { frequency: number; duration: number }> = {
    message: { frequency: 880, duration: 0.1 },
    dm: { frequency: 988, duration: 0.12 },
    mention: { frequency: 1046, duration: 0.15 },
    call: { frequency: 659, duration: 0.3 },
};

const loadSoundBuffer = async (url: string, type: string): Promise<AudioBuffer | null> => {
    const cacheKey = url.startsWith('data:') ? `custom-${type}` : url;

    if (audioBuffers.has(cacheKey)) {
        return audioBuffers.get(cacheKey)!;
    }

    const ctx = getAudioContext();

    try {
        let arrayBuffer: ArrayBuffer;

        if (url.startsWith('data:')) {
            const base64 = url.split(',')[1];
            const binary = atob(base64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            arrayBuffer = bytes.buffer;
        } else {
            const urlsToTry = [
                url,
                `/${url}`,
                `./${url}`,
                `file://${url}`,
            ];

            let response: Response | null = null;
            let lastError: Error | null = null;

            for (const tryUrl of urlsToTry) {
                try {
                    response = await fetch(tryUrl);
                    if (response.ok) {
                        console.log('[Sound] Loaded from:', tryUrl);
                        break;
                    }
                } catch (e) {
                    lastError = e as Error;
                }
            }

            if (!response || !response.ok) {
                throw lastError || new Error('Failed to load sound file');
            }

            arrayBuffer = await response.arrayBuffer();
        }

        const buffer = await ctx.decodeAudioData(arrayBuffer);
        audioBuffers.set(cacheKey, buffer);
        console.log('[Sound] Decoded and cached:', cacheKey);
        return buffer;
    } catch (err) {
        console.warn('[Sound] Failed to load sound file, using fallback beep:', err);

        const fallback = FALLBACK_SOUNDS[type] || FALLBACK_SOUNDS.message;
        const buffer = generateBeep(ctx, fallback.frequency, fallback.duration);
        audioBuffers.set(cacheKey, buffer);
        return buffer;
    }
};

const playSoundBuffer = async (url: string, type: string): Promise<void> => {
    try {
        await initializeAudio();

        const ctx = getAudioContext();

        if (ctx.state === 'suspended') {
            console.log('[Sound] Resuming suspended AudioContext');
            await ctx.resume();
        }

        const buffer = await loadSoundBuffer(url, type);
        if (!buffer) {
            console.error('[Sound] No buffer available');
            return;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 0.5;

        source.connect(gainNode);
        gainNode.connect(ctx.destination);

        source.start(0);
        console.log('[Sound] Playing sound:', type, 'duration:', buffer.duration);
    } catch (err) {
        console.error('[Sound] Failed to play sound:', err);
    }
};

if (typeof window !== 'undefined') {
    const initOnInteraction = () => {
        unlockAudio();
        document.removeEventListener('click', initOnInteraction);
        document.removeEventListener('keydown', initOnInteraction);
        document.removeEventListener('touchstart', initOnInteraction);
    };

    document.addEventListener('click', initOnInteraction, { once: true });
    document.addEventListener('keydown', initOnInteraction, { once: true });
    document.addEventListener('touchstart', initOnInteraction, { once: true });
}

export const useNotificationStore = create<NotificationState>()(
    persist(
        (set, get) => ({
            settings: defaultSettings,
            customSounds: {},
            unread: { rooms: {}, dms: {}, totalRooms: 0, totalDMs: 0, lastReadTimestamps: {} },
            toasts: [],
            muted: new Set(),
            soundsLoading: {},

            updateSettings: (newSettings) => set((state) => ({
                settings: { ...state.settings, ...newSettings }
            })),

            setCustomSound: (type, dataUrl) => {
                const cacheKey = `custom-${type}`;
                audioBuffers.delete(cacheKey);

                set((state) => ({
                    customSounds: { ...state.customSounds, [type]: dataUrl }
                }));
            },

            clearCustomSound: (type) => {
                const cacheKey = `custom-${type}`;
                audioBuffers.delete(cacheKey);

                set((state) => {
                    const { [type]: _, ...rest } = state.customSounds;
                    return { customSounds: rest };
                });
            },

            addUnread: (type, id, count = 1) => set((state) => {
                if (get().isMuted(id)) return state;
                const key = type === 'room' ? 'rooms' : 'dms';
                const totalKey = type === 'room' ? 'totalRooms' : 'totalDMs';
                const current = state.unread[key][id] || 0;
                return {
                    unread: {
                        ...state.unread,
                        [key]: { ...state.unread[key], [id]: current + count },
                        [totalKey]: state.unread[totalKey] + count,
                    }
                };
            }),

            setUnread: (type, id, count) => set((state) => {
                const key = type === 'room' ? 'rooms' : 'dms';
                const totalKey = type === 'room' ? 'totalRooms' : 'totalDMs';
                const oldCount = state.unread[key][id] || 0;
                const diff = count - oldCount;
                return {
                    unread: {
                        ...state.unread,
                        [key]: { ...state.unread[key], [id]: count },
                        [totalKey]: Math.max(0, state.unread[totalKey] + diff),
                    }
                };
            }),

            clearUnread: (type, id) => set((state) => {
                const key = type === 'room' ? 'rooms' : 'dms';
                const totalKey = type === 'room' ? 'totalRooms' : 'totalDMs';
                const current = state.unread[key][id] || 0;
                const { [id]: _, ...rest } = state.unread[key];
                return {
                    unread: {
                        ...state.unread,
                        [key]: rest,
                        [totalKey]: Math.max(0, state.unread[totalKey] - current),
                    }
                };
            }),

            clearAllUnread: () => set({
                unread: { rooms: {}, dms: {}, totalRooms: 0, totalDMs: 0, lastReadTimestamps: {} }
            }),

            setLastRead: (type, id, messageId) => set((state) => ({
                unread: {
                    ...state.unread,
                    lastReadTimestamps: {
                        ...state.unread.lastReadTimestamps,
                        [`${type}:${id}`]: messageId,
                    }
                }
            })),

            getLastRead: (type, id) => {
                return get().unread.lastReadTimestamps[`${type}:${id}`] || null;
            },

            syncUnreadFromApi: async () => {
                try {
                    const response = await window.concord.getUnreadCounts?.();
                    if (!response) return;
                    const rooms: Record<string, number> = {};
                    const lastReadTimestamps: Record<string, string> = { ...get().unread.lastReadTimestamps };
                    let totalRooms = 0;
                    for (const room of response.rooms || []) {
                        rooms[room.room_id] = room.unread_count || 0;
                        totalRooms += room.unread_count || 0;
                        if (room.last_read_message_id) {
                            lastReadTimestamps[`room:${room.room_id}`] = room.last_read_message_id;
                        }
                    }
                    set((state) => ({
                        unread: {
                            ...state.unread,
                            rooms,
                            totalRooms,
                            lastReadTimestamps,
                        }
                    }));
                } catch (err) {
                    console.error('[NotificationStore] Failed to sync unread counts:', err);
                }
            },

            markAsRead: async (type, id, messageId) => {
                const lastRead = get().getLastRead(type, id);
                if (lastRead === messageId) {
                    return;
                }

                try {
                    if (type === 'room') {
                        const response = await window.concord.markAsRead?.(id, messageId);
                        if (response) {
                            set((state) => {
                                const newCount = response.unread_count || 0;
                                const oldCount = state.unread.rooms[id] || 0;
                                return {
                                    unread: {
                                        ...state.unread,
                                        rooms: { ...state.unread.rooms, [id]: newCount },
                                        totalRooms: Math.max(0, state.unread.totalRooms - oldCount + newCount),
                                        lastReadTimestamps: {
                                            ...state.unread.lastReadTimestamps,
                                            [`room:${id}`]: response.last_read_message_id || messageId,
                                        }
                                    }
                                };
                            });
                        }
                    } else {
                        const response = await window.concord.markDMAsRead?.(id, messageId);
                        if (response) {
                            set((state) => {
                                const newCount = response.unread_count || 0;
                                const oldCount = state.unread.dms[id] || 0;
                                return {
                                    unread: {
                                        ...state.unread,
                                        dms: { ...state.unread.dms, [id]: newCount },
                                        totalDMs: Math.max(0, state.unread.totalDMs - oldCount + newCount),
                                        lastReadTimestamps: {
                                            ...state.unread.lastReadTimestamps,
                                            [`dm:${id}`]: response.last_read_message_id || messageId,
                                        }
                                    }
                                };
                            });
                        }
                    }
                } catch (err) {
                    console.error('[NotificationStore] Failed to mark as read:', err);
                }
            },

            showToast: (notification) => {
                const { settings } = get();
                if (!settings.enabled || !settings.toast) return;
                const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                const toast: ToastNotification = { ...notification, id, timestamp: Date.now() };
                set((state) => ({ toasts: [...state.toasts.slice(-4), toast] }));
                setTimeout(() => { get().dismissToast(id); }, 5000);
            },

            dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter(t => t.id !== id) })),
            clearToasts: () => set({ toasts: [] }),
            muteChannel: (id) => set((state) => { const muted = new Set(state.muted); muted.add(id); return { muted }; }),
            unmuteChannel: (id) => set((state) => { const muted = new Set(state.muted); muted.delete(id); return { muted }; }),
            isMuted: (id) => get().muted.has(id),

            playSound: async (type) => {
                const { settings, customSounds } = get();
                const shouldPlay = type === 'dm' ? settings.dmSound : settings.sound;
                if (!settings.enabled || !shouldPlay) return;

                const soundUrl = customSounds[type] || `sounds/${type === 'call' ? 'call' : 'message'}.mp3`;
                await playSoundBuffer(soundUrl, type);
            },

            previewSound: async (type) => {
                const { customSounds } = get();
                const soundUrl = customSounds[type] || `sounds/${type === 'call' ? 'call' : 'message'}.mp3`;
                await playSoundBuffer(soundUrl, type);
            },

            sendNativeNotification: (title, body, onClick) => {
                const { settings } = get();
                if (!settings.enabled || !settings.native) return;
                if ('Notification' in window && Notification.permission === 'granted') {
                    const notification = new Notification(title, { body, icon: '/icon.png', silent: true });
                    if (onClick) {
                        notification.onclick = () => { window.focus(); onClick(); notification.close(); };
                    }
                }
            },
        }),
        {
            name: 'notification-storage',
            partialize: (state) => ({
                settings: state.settings,
                customSounds: state.customSounds,
                muted: Array.from(state.muted),
                unread: state.unread,
            }),
            merge: (persisted: any, current) => ({
                ...current,
                settings: persisted?.settings || current.settings,
                customSounds: persisted?.customSounds || {},
                muted: new Set(persisted?.muted || []),
                unread: persisted?.unread || current.unread,
            }),
        }
    )
);