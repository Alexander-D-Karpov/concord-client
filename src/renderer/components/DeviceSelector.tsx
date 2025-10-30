import React, { useState, useEffect, useRef } from 'react';
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
        setSelectedAudioInput,
        setSelectedAudioOutput,
        setSelectedVideo,
        refreshDevices,
    } = useDeviceStore();

    const [loading, setLoading] = useState(true);
    const [testingAudio, setTestingAudio] = useState(false);
    const [audioLevel, setAudioLevel] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [videoPreviewEnabled, setVideoPreviewEnabled] = useState(false);

    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const animationFrameRef = useRef<number>();
    const videoRef = useRef<HTMLVideoElement>(null);
    const videoStreamRef = useRef<MediaStream | null>(null);

    useEffect(() => {
        const init = async () => {
            setLoading(true);
            setError(null);
            try {
                await refreshDevices();
            } catch (err: any) {
                console.error('Failed to refresh devices:', err);
                setError(err?.message || 'Failed to load devices. Please check permissions.');
            } finally {
                setLoading(false);
            }
        };
        init();
    }, [refreshDevices]);

    useEffect(() => {
        if (!selectedAudioInput || loading) return;

        const startAudioMonitoring = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: { deviceId: selectedAudioInput },
                });
                streamRef.current = stream;

                const audioContext = new AudioContext();
                const analyser = audioContext.createAnalyser();
                analyser.fftSize = 256;
                analyser.smoothingTimeConstant = 0.8;

                const source = audioContext.createMediaStreamSource(stream);
                source.connect(analyser);

                audioContextRef.current = audioContext;
                analyserRef.current = analyser;

                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                const updateLevel = () => {
                    if (!analyserRef.current) return;

                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                    const level = Math.min((average / 128) * 100, 100);
                    setAudioLevel(level);

                    animationFrameRef.current = requestAnimationFrame(updateLevel);
                };

                updateLevel();
            } catch (err) {
                console.error('Failed to start audio monitoring:', err);
            }
        };

        startAudioMonitoring();

        return () => {
            if (animationFrameRef.current) {
                cancelAnimationFrame(animationFrameRef.current);
            }
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, [selectedAudioInput, loading]);

    useEffect(() => {
        if (!videoPreviewEnabled || !selectedVideo) {
            if (videoStreamRef.current) {
                videoStreamRef.current.getTracks().forEach(track => track.stop());
                videoStreamRef.current = null;
            }
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
            return;
        }

        const startVideoPreview = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { deviceId: selectedVideo, width: 640, height: 480 },
                });
                videoStreamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                }
            } catch (err) {
                console.error('Failed to start video preview:', err);
                setError('Failed to access camera');
            }
        };

        startVideoPreview();

        return () => {
            if (videoStreamRef.current) {
                videoStreamRef.current.getTracks().forEach(track => track.stop());
                videoStreamRef.current = null;
            }
        };
    }, [videoPreviewEnabled, selectedVideo]);

    const testAudioOutput = async () => {
        setTestingAudio(true);
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZVAUMU6Pn77BfGAg+ltrzxnMpBSl+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBSp+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBSp+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBSp+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBSp+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBSp+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBSp+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBSp+zPLaizsIGGS57OihUhELTKXo8bllHAU2jdXzyn0vBQ==');
        try {
            await audio.play();
            setTimeout(() => setTestingAudio(false), 1000);
        } catch (err) {
            console.error('Failed to test audio:', err);
            setTestingAudio(false);
        }
    };

    const handleRefresh = async () => {
        setLoading(true);
        setError(null);
        try {
            await refreshDevices();
        } catch (err: any) {
            setError(err?.message || 'Failed to refresh devices');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-800 rounded-lg w-full max-w-2xl border border-dark-700 max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-dark-700 flex items-center justify-between sticky top-0 bg-dark-800 z-10">
                    <h3 className="text-xl font-semibold text-white">Voice & Video Settings</h3>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-dark-700 rounded-lg transition"
                    >
                        <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-6">
                    {error && (
                        <div className="px-4 py-3 bg-red-500 bg-opacity-10 border border-red-500 text-red-500 rounded-lg text-sm">
                            <div className="font-semibold mb-1">Error</div>
                            <div>{error}</div>
                        </div>
                    )}

                    {loading ? (
                        <div className="text-center py-8 text-dark-400">
                            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                            <p>Loading devices...</p>
                        </div>
                    ) : (
                        <>
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <label className="block text-sm font-medium text-white">
                                        Microphone
                                    </label>
                                    <button
                                        onClick={handleRefresh}
                                        className="text-xs text-primary-400 hover:text-primary-300 transition"
                                    >
                                        Refresh
                                    </button>
                                </div>
                                {audioInputDevices.length === 0 ? (
                                    <div className="px-4 py-3 bg-dark-700 rounded-lg text-dark-400 text-sm">
                                        No microphones detected
                                    </div>
                                ) : (
                                    <select
                                        value={selectedAudioInput || ''}
                                        onChange={(e) => setSelectedAudioInput(e.target.value)}
                                        className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    >
                                        {audioInputDevices.map((device) => (
                                            <option key={device.deviceId} value={device.deviceId}>
                                                {device.label || `Microphone ${device.deviceId.substring(0, 8)}`}
                                            </option>
                                        ))}
                                    </select>
                                )}
                                <div className="mt-2 flex items-center space-x-2">
                                    <div className="flex-1 h-2 bg-dark-700 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-green-500 to-green-400"
                                            style={{ width: `${audioLevel}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-xs text-dark-400 w-16 text-right">
                                        {Math.round(audioLevel)}%
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white mb-3">
                                    Speaker/Headphones
                                </label>
                                {audioOutputDevices.length === 0 ? (
                                    <div className="px-4 py-3 bg-dark-700 rounded-lg text-dark-400 text-sm">
                                        No audio output devices detected
                                    </div>
                                ) : (
                                    <>
                                        <select
                                            value={selectedAudioOutput || ''}
                                            onChange={(e) => setSelectedAudioOutput(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        >
                                            {audioOutputDevices.map((device) => (
                                                <option key={device.deviceId} value={device.deviceId}>
                                                    {device.label || `Speaker ${device.deviceId.substring(0, 8)}`}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={testAudioOutput}
                                            disabled={testingAudio}
                                            className="mt-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 disabled:cursor-not-allowed text-white text-sm rounded-lg transition"
                                        >
                                            {testingAudio ? 'Playing...' : 'Test Output'}
                                        </button>
                                    </>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white mb-3">
                                    Camera
                                </label>
                                {videoDevices.length === 0 ? (
                                    <div className="px-4 py-3 bg-dark-700 rounded-lg text-dark-400 text-sm">
                                        No cameras detected
                                    </div>
                                ) : (
                                    <>
                                        <select
                                            value={selectedVideo || ''}
                                            onChange={(e) => setSelectedVideo(e.target.value)}
                                            className="w-full px-4 py-2.5 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                        >
                                            {videoDevices.map((device) => (
                                                <option key={device.deviceId} value={device.deviceId}>
                                                    {device.label || `Camera ${device.deviceId.substring(0, 8)}`}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => setVideoPreviewEnabled(!videoPreviewEnabled)}
                                            className="mt-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition"
                                        >
                                            {videoPreviewEnabled ? 'Stop Preview' : 'Test Camera'}
                                        </button>
                                        {videoPreviewEnabled && (
                                            <div className="mt-3 bg-dark-900 rounded-lg overflow-hidden">
                                                <video
                                                    ref={videoRef}
                                                    autoPlay
                                                    playsInline
                                                    muted
                                                    className="w-full aspect-video object-cover"
                                                />
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>

                <div className="p-6 border-t border-dark-700 bg-dark-800">
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-semibold rounded-lg transition"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

export default DeviceSelector;