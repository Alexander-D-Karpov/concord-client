import React, { useCallback, useEffect, useRef, useState } from 'react';
import Modal from './Modal';
import { useDeviceStore } from '../hooks/useDeviceStore';
import { RefreshIcon, CloseIcon } from './icons';

interface DeviceSelectorProps {
    onClose: () => void;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({ onClose }) => {
    const {
        audioInputDevices, audioOutputDevices, videoDevices,
        selectedAudioInput, selectedAudioOutput, selectedVideo,
        micSensitivity, noiseSuppression, echoCancellation, autoGainControl, initialized, error,
        setSelectedAudioInput, setSelectedAudioOutput, setSelectedVideo,
        setMicSensitivity, setNoiseSuppression, setEchoCancellation, setAutoGainControl, refreshDevices,
    } = useDeviceStore();

    const [loading, setLoading] = useState(false);
    const [liveMicLevel, setLiveMicLevel] = useState(0);
    const [liveMicWorking, setLiveMicWorking] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const previewCleanupRef = useRef<(() => void) | null>(null);

    const stopPreview = useCallback(() => {
        previewCleanupRef.current?.();
        previewCleanupRef.current = null;
        setLiveMicLevel(0);
        setLiveMicWorking(false);
    }, []);

    const startPreview = useCallback(async () => {
        stopPreview();
        setPreviewError(null);

        if (!selectedAudioInput) return;

        let stream: MediaStream | null = null;
        let context: AudioContext | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let analyser: AnalyserNode | null = null;
        let rafId = 0;

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: { exact: selectedAudioInput },
                    echoCancellation,
                    noiseSuppression,
                    autoGainControl,
                },
                video: false,
            });

            context = new AudioContext();
            source = context.createMediaStreamSource(stream);
            analyser = context.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);

            const samples = new Float32Array(analyser.fftSize);

            const tick = () => {
                if (!analyser) return;
                analyser.getFloatTimeDomainData(samples);

                let sum = 0;
                for (let i = 0; i < samples.length; i++) {
                    sum += samples[i] * samples[i];
                }

                const rms = Math.sqrt(sum / samples.length);
                const level = Math.min(100, Math.round(rms * 500));

                setLiveMicLevel(level);
                setLiveMicWorking(rms > 0.002);
                rafId = window.requestAnimationFrame(tick);
            };

            tick();

            previewCleanupRef.current = () => {
                if (rafId) window.cancelAnimationFrame(rafId);
                try { source?.disconnect(); } catch {}
                try { analyser?.disconnect(); } catch {}
                try { stream?.getTracks().forEach(t => t.stop()); } catch {}
                try { context?.close().catch(() => {}); } catch {}
            };
        } catch (err: any) {
            setPreviewError(err?.message || 'Microphone preview unavailable');
        }
    }, [selectedAudioInput, echoCancellation, noiseSuppression, autoGainControl, stopPreview]);

    useEffect(() => {
        if (!initialized) {
            setLoading(true);
            refreshDevices().finally(() => setLoading(false));
            return;
        }

        startPreview();

        const handleDeviceChange = () => {
            refreshDevices().catch(() => {});
        };

        navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);

        return () => {
            navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
            stopPreview();
        };
    }, [initialized, refreshDevices, startPreview, stopPreview]);

    const selectClass = "w-full px-3 py-2 bg-gray-100 dark:bg-dark-700 border border-gray-200 dark:border-dark-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:border-primary-500";

    const Toggle: React.FC<{ label: string; value: boolean; onChange: (v: boolean) => void }> = ({ label, value, onChange }) => (
        <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-dark-400">{label}</span>
            <button
                onClick={() => onChange(!value)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${value ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-600'}`}
            >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
        </div>
    );

    return (
        <Modal onClose={onClose} className="max-w-lg">
            <div className="p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Voice & Video Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-dark-700 rounded-lg transition">
                        <CloseIcon className="text-gray-400 dark:text-dark-400" />
                    </button>
                </div>

                {error && <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">{error}</div>}

                {loading ? (
                    <div className="text-center py-8 text-gray-400 dark:text-dark-400">Loading devices...</div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">Microphone</label>
                            <select value={selectedAudioInput || ''} onChange={e => setSelectedAudioInput(e.target.value)} className={selectClass}>
                                {audioInputDevices.length === 0
                                    ? <option value="">No microphones found</option>
                                    : audioInputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)
                                }
                            </select>

                            <div className="mt-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-xs text-gray-500 dark:text-dark-400">Live input level</span>
                                    <span className={`text-xs ${liveMicWorking ? 'text-green-500' : 'text-gray-400 dark:text-dark-500'}`}>
                                        {previewError ? 'Preview unavailable' : liveMicWorking ? 'Input detected' : 'Listening...'}
                                    </span>
                                </div>

                                <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-dark-700 overflow-hidden">
                                    <div
                                        className="h-full rounded-full bg-green-500 transition-all duration-75"
                                        style={{ width: `${liveMicLevel}%` }}
                                    />
                                </div>

                                <p className="mt-2 text-xs text-gray-500 dark:text-dark-400">
                                    Changes apply immediately during an active call.
                                </p>

                                {previewError && (
                                    <p className="mt-2 text-xs text-red-500">{previewError}</p>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">Sensitivity: {micSensitivity}%</label>
                            <input type="range" min="0" max="100" value={micSensitivity} onChange={e => setMicSensitivity(parseInt(e.target.value))} className="w-full accent-primary-500" />
                            <div className="flex justify-between text-xs text-gray-400 dark:text-dark-500 mt-1"><span>Less</span><span>More</span></div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300">Audio Processing</label>
                            <Toggle label="Echo Cancellation" value={echoCancellation} onChange={setEchoCancellation} />
                            <Toggle label="Noise Suppression" value={noiseSuppression} onChange={setNoiseSuppression} />
                            <Toggle label="Auto Gain Control" value={autoGainControl} onChange={setAutoGainControl} />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">Speaker</label>
                            <select value={selectedAudioOutput || ''} onChange={e => setSelectedAudioOutput(e.target.value)} className={selectClass}>
                                {audioOutputDevices.length === 0
                                    ? <option value="">No speakers found</option>
                                    : audioOutputDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)
                                }
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-600 dark:text-dark-300 mb-2">Camera</label>
                            <select value={selectedVideo || ''} onChange={e => setSelectedVideo(e.target.value)} className={selectClass}>
                                {videoDevices.length === 0
                                    ? <option value="">No cameras found</option>
                                    : videoDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.label}</option>)
                                }
                            </select>
                        </div>

                        <button
                            onClick={() => { setLoading(true); refreshDevices().finally(() => setLoading(false)); }}
                            className="w-full px-4 py-2 bg-gray-200 dark:bg-dark-700 hover:bg-gray-300 dark:hover:bg-dark-600 text-gray-900 dark:text-white rounded-lg transition flex items-center justify-center space-x-2"
                        >
                            <RefreshIcon size="sm" />
                            <span>Refresh Devices</span>
                        </button>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default DeviceSelector;