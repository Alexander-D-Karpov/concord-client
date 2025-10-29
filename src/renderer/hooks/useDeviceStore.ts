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
    setSelectedAudioInput: (deviceId: string) => void;
    setSelectedAudioOutput: (deviceId: string) => void;
    setSelectedVideo: (deviceId: string) => void;
    refreshDevices: () => Promise<void>;
}

async function requestPermissionsWithTimeout(timeout: number = 10000): Promise<MediaStream | null> {
    return Promise.race([
        navigator.mediaDevices.getUserMedia({ audio: true, video: true }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeout))
    ]);
}

export const useDeviceStore = create<DeviceState>()(
    persist(
        (set) => ({
            audioInputDevices: [],
            audioOutputDevices: [],
            videoDevices: [],
            selectedAudioInput: null,
            selectedAudioOutput: null,
            selectedVideo: null,

            setSelectedAudioInput: (deviceId: string) => {
                set({ selectedAudioInput: deviceId });
            },

            setSelectedAudioOutput: (deviceId: string) => {
                set({ selectedAudioOutput: deviceId });
            },

            setSelectedVideo: (deviceId: string) => {
                set({ selectedVideo: deviceId });
            },

            refreshDevices: async () => {
                try {
                    const stream = await requestPermissionsWithTimeout(5000);

                    if (stream) {
                        stream.getTracks().forEach(track => track.stop());
                    }

                    const devices = await navigator.mediaDevices.enumerateDevices();

                    const audioInputs = devices
                        .filter((d) => d.kind === 'audioinput')
                        .map((d) => ({
                            deviceId: d.deviceId,
                            label: d.label,
                            kind: d.kind,
                        }));

                    const audioOutputs = devices
                        .filter((d) => d.kind === 'audiooutput')
                        .map((d) => ({
                            deviceId: d.deviceId,
                            label: d.label,
                            kind: d.kind,
                        }));

                    const videos = devices
                        .filter((d) => d.kind === 'videoinput')
                        .map((d) => ({
                            deviceId: d.deviceId,
                            label: d.label,
                            kind: d.kind,
                        }));

                    set((state) => ({
                        audioInputDevices: audioInputs,
                        audioOutputDevices: audioOutputs,
                        videoDevices: videos,
                        selectedAudioInput:
                            state.selectedAudioInput ||
                            audioInputs[0]?.deviceId ||
                            null,
                        selectedAudioOutput:
                            state.selectedAudioOutput ||
                            audioOutputs[0]?.deviceId ||
                            null,
                        selectedVideo:
                            state.selectedVideo ||
                            videos[0]?.deviceId ||
                            null,
                    }));
                } catch (err: any) {
                    console.error('Failed to enumerate devices:', err);
                    throw new Error(err?.message || 'Failed to access devices. Please check permissions.');
                }
            },
        }),
        {
            name: 'device-storage',
            partialize: (state) => ({
                selectedAudioInput: state.selectedAudioInput,
                selectedAudioOutput: state.selectedAudioOutput,
                selectedVideo: state.selectedVideo,
            }),
        }
    )
);