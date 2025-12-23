import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MediaDeviceInfo {
    deviceId: string;
    label: string;
    kind: MediaDeviceKind;
}

interface DeviceState {
    audioInputDevices: MediaDeviceInfo[];
    audioOutputDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
    selectedAudioInput: string | null;
    selectedAudioOutput: string | null;
    selectedVideo: string | null;
    micSensitivity: number;
    noiseSuppression: boolean;
    echoCancellation: boolean;
    autoGainControl: boolean;
    initialized: boolean;
    loading: boolean;
    error: string | null;
    setSelectedAudioInput: (deviceId: string) => void;
    setSelectedAudioOutput: (deviceId: string) => void;
    setSelectedVideo: (deviceId: string) => void;
    setMicSensitivity: (value: number) => void;
    setNoiseSuppression: (value: boolean) => void;
    setEchoCancellation: (value: boolean) => void;
    setAutoGainControl: (value: boolean) => void;
    refreshDevices: () => Promise<void>;
    testMicrophone: () => Promise<{ level: number; working: boolean }>;
}

export const useDeviceStore = create<DeviceState>()(
    persist(
        (set, get) => ({
            audioInputDevices: [],
            audioOutputDevices: [],
            videoDevices: [],
            selectedAudioInput: null,
            selectedAudioOutput: null,
            selectedVideo: null,
            micSensitivity: 50,
            noiseSuppression: true,
            echoCancellation: true,
            autoGainControl: true,
            initialized: false,
            loading: false,
            error: null,

            setSelectedAudioInput: (deviceId) => set({ selectedAudioInput: deviceId }),
            setSelectedAudioOutput: (deviceId) => set({ selectedAudioOutput: deviceId }),
            setSelectedVideo: (deviceId) => set({ selectedVideo: deviceId }),
            setMicSensitivity: (value) => set({ micSensitivity: Math.max(0, Math.min(100, value)) }),
            setNoiseSuppression: (value) => set({ noiseSuppression: value }),
            setEchoCancellation: (value) => set({ echoCancellation: value }),
            setAutoGainControl: (value) => set({ autoGainControl: value }),

            refreshDevices: async () => {
                if (get().loading) return;
                set({ loading: true, error: null });

                try {
                    const streams: MediaStream[] = [];

                    try {
                        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                        streams.push(audioStream);
                    } catch {}

                    try {
                        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
                        streams.push(videoStream);
                    } catch {}

                    const devices = await navigator.mediaDevices.enumerateDevices();

                    streams.forEach(s => s.getTracks().forEach(t => t.stop()));

                    const audioInputs = devices
                        .filter(d => d.kind === 'audioinput' && d.deviceId)
                        .map(d => ({
                            deviceId: d.deviceId,
                            label: d.label || `Microphone ${d.deviceId.slice(0, 8)}`,
                            kind: d.kind as MediaDeviceKind,
                        }));

                    const audioOutputs = devices
                        .filter(d => d.kind === 'audiooutput' && d.deviceId)
                        .map(d => ({
                            deviceId: d.deviceId,
                            label: d.label || `Speaker ${d.deviceId.slice(0, 8)}`,
                            kind: d.kind as MediaDeviceKind,
                        }));

                    const videos = devices
                        .filter(d => d.kind === 'videoinput' && d.deviceId)
                        .map(d => ({
                            deviceId: d.deviceId,
                            label: d.label || `Camera ${d.deviceId.slice(0, 8)}`,
                            kind: d.kind as MediaDeviceKind,
                        }));

                    const state = get();
                    const defaultAudioInput = audioInputs.find(d => d.deviceId === 'default') || audioInputs[0];
                    const defaultAudioOutput = audioOutputs.find(d => d.deviceId === 'default') || audioOutputs[0];

                    set({
                        audioInputDevices: audioInputs,
                        audioOutputDevices: audioOutputs,
                        videoDevices: videos,
                        selectedAudioInput: audioInputs.some(d => d.deviceId === state.selectedAudioInput)
                            ? state.selectedAudioInput
                            : defaultAudioInput?.deviceId || null,
                        selectedAudioOutput: audioOutputs.some(d => d.deviceId === state.selectedAudioOutput)
                            ? state.selectedAudioOutput
                            : defaultAudioOutput?.deviceId || null,
                        selectedVideo: videos.some(d => d.deviceId === state.selectedVideo)
                            ? state.selectedVideo
                            : videos[0]?.deviceId || null,
                        initialized: true,
                        loading: false,
                    });
                } catch (err: any) {
                    set({ error: err?.message || 'Failed to enumerate devices', loading: false, initialized: true });
                }
            },

            testMicrophone: async () => {
                const { selectedAudioInput } = get();
                let stream: MediaStream | null = null;

                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        audio: { deviceId: selectedAudioInput ? { exact: selectedAudioInput } : undefined }
                    });

                    const context = new AudioContext();
                    const source = context.createMediaStreamSource(stream);
                    const analyser = context.createAnalyser();
                    analyser.fftSize = 256;
                    source.connect(analyser);

                    const dataArray = new Uint8Array(analyser.frequencyBinCount);

                    await new Promise(resolve => setTimeout(resolve, 500));

                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

                    stream.getTracks().forEach(t => t.stop());
                    await context.close();

                    return { level: Math.round(average), working: average > 5 };
                } catch {
                    stream?.getTracks().forEach(t => t.stop());
                    return { level: 0, working: false };
                }
            },
        }),
        {
            name: 'device-storage',
            partialize: (state) => ({
                selectedAudioInput: state.selectedAudioInput,
                selectedAudioOutput: state.selectedAudioOutput,
                selectedVideo: state.selectedVideo,
                micSensitivity: state.micSensitivity,
                noiseSuppression: state.noiseSuppression,
                echoCancellation: state.echoCancellation,
                autoGainControl: state.autoGainControl,
            }),
        }
    )
);