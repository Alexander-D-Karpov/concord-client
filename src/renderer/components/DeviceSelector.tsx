import React, { useEffect, useState } from 'react';
import { useDeviceStore } from '../hooks/useDeviceStore';

interface DeviceSelectorProps {
    onClose: () => void;
}

const DeviceSelector: React.FC<DeviceSelectorProps> = ({ onClose }) => {
    const {
        audioInputDevices,
        audioOutputDevices,
        videoDevices,
        selectedAudioInput,
        selectedAudioOutput,
        selectedVideo,
        micSensitivity,
        noiseSuppression,
        echoCancellation,
        autoGainControl,
        initialized,
        error,
        setSelectedAudioInput,
        setSelectedAudioOutput,
        setSelectedVideo,
        setMicSensitivity,
        setNoiseSuppression,
        setEchoCancellation,
        setAutoGainControl,
        refreshDevices,
        testMicrophone,
    } = useDeviceStore();

    const [loading, setLoading] = useState(false);
    const [testResult, setTestResult] = useState<{ level: number; working: boolean } | null>(null);
    const [testing, setTesting] = useState(false);

    useEffect(() => {
        if (!initialized) {
            setLoading(true);
            refreshDevices().finally(() => setLoading(false));
        }
    }, [initialized, refreshDevices]);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        const result = await testMicrophone();
        setTestResult(result);
        setTesting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
            <div className="bg-dark-800 rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-semibold text-white">Voice & Video Settings</h2>
                    <button onClick={onClose} className="p-2 hover:bg-dark-700 rounded-lg transition">
                        <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {error && (
                    <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded text-red-400 text-sm">{error}</div>
                )}

                {loading ? (
                    <div className="text-center py-8 text-dark-400">Loading devices...</div>
                ) : (
                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">Microphone</label>
                            <select
                                value={selectedAudioInput || ''}
                                onChange={e => setSelectedAudioInput(e.target.value)}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                            >
                                {audioInputDevices.length === 0 ? (
                                    <option value="">No microphones found</option>
                                ) : (
                                    audioInputDevices.map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                                    ))
                                )}
                            </select>
                            <div className="mt-2 flex items-center space-x-2">
                                <button
                                    onClick={handleTest}
                                    disabled={testing || !selectedAudioInput}
                                    className="px-3 py-1 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 text-white text-sm rounded transition"
                                >
                                    {testing ? 'Testing...' : 'Test Microphone'}
                                </button>
                                {testResult && (
                                    <span className={`text-sm ${testResult.working ? 'text-green-400' : 'text-red-400'}`}>
                                        {testResult.working ? '✓ Working' : '✗ No input detected'}
                                    </span>
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">
                                Microphone Sensitivity: {micSensitivity}%
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={micSensitivity}
                                onChange={e => setMicSensitivity(parseInt(e.target.value))}
                                className="w-full accent-primary-500"
                            />
                            <div className="flex justify-between text-xs text-dark-500 mt-1">
                                <span>Less sensitive</span>
                                <span>More sensitive</span>
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-dark-300">Audio Processing</label>
                            {[
                                { label: 'Echo Cancellation', value: echoCancellation, setter: setEchoCancellation },
                                { label: 'Noise Suppression', value: noiseSuppression, setter: setNoiseSuppression },
                                { label: 'Auto Gain Control', value: autoGainControl, setter: setAutoGainControl },
                            ].map(({ label, value, setter }) => (
                                <div key={label} className="flex items-center justify-between">
                                    <span className="text-sm text-dark-400">{label}</span>
                                    <button
                                        onClick={() => setter(!value)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${value ? 'bg-primary-600' : 'bg-dark-600'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${value ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">Speaker</label>
                            <select
                                value={selectedAudioOutput || ''}
                                onChange={e => setSelectedAudioOutput(e.target.value)}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                            >
                                {audioOutputDevices.length === 0 ? (
                                    <option value="">No speakers found</option>
                                ) : (
                                    audioOutputDevices.map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                                    ))
                                )}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-dark-300 mb-2">Camera</label>
                            <select
                                value={selectedVideo || ''}
                                onChange={e => setSelectedVideo(e.target.value)}
                                className="w-full px-3 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:border-primary-500"
                            >
                                {videoDevices.length === 0 ? (
                                    <option value="">No cameras found</option>
                                ) : (
                                    videoDevices.map(d => (
                                        <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                                    ))
                                )}
                            </select>
                        </div>

                        <button
                            onClick={() => { setLoading(true); refreshDevices().finally(() => setLoading(false)); }}
                            className="w-full px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition flex items-center justify-center space-x-2"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span>Refresh Devices</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeviceSelector;