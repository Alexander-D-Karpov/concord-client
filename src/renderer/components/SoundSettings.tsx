import React, { useRef, useState } from 'react';
import { useNotificationStore } from '../hooks/useNotificationStore';

type SoundType = 'message' | 'dm' | 'mention' | 'call';

const SOUND_LABELS: Record<SoundType, string> = {
    message: 'Room Message',
    dm: 'Direct Message',
    mention: 'Mention',
    call: 'Incoming Call',
};

const SoundSettings: React.FC = () => {
    const { customSounds, setCustomSound, clearCustomSound, previewSound } = useNotificationStore();
    const [loading, setLoading] = useState<SoundType | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedType, setSelectedType] = useState<SoundType | null>(null);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !selectedType) return;

        if (!file.type.startsWith('audio/')) {
            setError('Please select an audio file (MP3, WAV, OGG)');
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            setError('File size must be less than 5MB');
            return;
        }

        setError(null);
        setLoading(selectedType);

        try {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result as string;
                setCustomSound(selectedType, dataUrl);
                setLoading(null);
            };
            reader.onerror = () => {
                setError('Failed to read file');
                setLoading(null);
            };
            reader.readAsDataURL(file);
        } catch (err) {
            setError('Failed to process file');
            setLoading(null);
        }

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
        setSelectedType(null);
    };

    const openFilePicker = (type: SoundType) => {
        setSelectedType(type);
        fileInputRef.current?.click();
    };

    return (
        <div className="space-y-4">
            <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={handleFileSelect}
            />

            {error && (
                <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg text-red-500 text-sm">
                    {error}
                </div>
            )}

            {(Object.keys(SOUND_LABELS) as SoundType[]).map((type) => (
                <div key={type} className="flex items-center justify-between p-3 bg-dark-700 rounded-lg">
                    <div className="flex-1">
                        <div className="font-medium text-white">{SOUND_LABELS[type]}</div>
                        <div className="text-sm text-dark-400">
                            {customSounds[type] ? 'Custom sound' : 'Default sound'}
                        </div>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={() => previewSound(type)}
                            className="p-2 hover:bg-dark-600 rounded-lg transition"
                            title="Preview sound"
                        >
                            <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                            </svg>
                        </button>
                        <button
                            onClick={() => openFilePicker(type)}
                            disabled={loading === type}
                            className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 text-white text-sm rounded-lg transition"
                        >
                            {loading === type ? 'Loading...' : 'Change'}
                        </button>
                        {customSounds[type] && (
                            <button
                                onClick={() => clearCustomSound(type)}
                                className="p-2 hover:bg-dark-600 rounded-lg transition text-red-400"
                                title="Reset to default"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>
            ))}

            <p className="text-xs text-dark-500">
                Supported formats: MP3, WAV, OGG. Maximum file size: 5MB.
            </p>
        </div>
    );
};

export default SoundSettings;