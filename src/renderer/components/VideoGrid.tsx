import React, { useEffect, useRef } from 'react';
import { ParticipantState } from '../hooks/useVoiceClient';
import { useAuthStore } from '../hooks/useAuthStore';

interface VideoGridProps {
    participants: ParticipantState[];
    localVideoEnabled: boolean;
}

interface VideoTileProps {
    participant?: ParticipantState;
    isLocal?: boolean;
    videoEnabled?: boolean;
}

const VideoTile: React.FC<VideoTileProps> = ({ participant, isLocal, videoEnabled }) => {
    const { user } = useAuthStore();
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const displayName = isLocal
        ? 'You'
        : participant?.userId?.split('-')[0] || 'User';

    const isSpeaking = participant?.speaking || false;
    const isMuted = participant?.muted || false;

    useEffect(() => {
        if (!videoRef.current) return;

        const setupVideo = async () => {
            if (videoEnabled && isLocal) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480 },
                        audio: false,
                    });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } catch (err) {
                    console.error('Failed to get video stream:', err);
                }
            } else {
                if (streamRef.current) {
                    streamRef.current.getTracks().forEach(track => track.stop());
                    streamRef.current = null;
                }
                if (videoRef.current) {
                    videoRef.current.srcObject = null;
                }
            }
        };

        setupVideo();

        return () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };
    }, [isLocal, videoEnabled]);

    return (
        <div className={`relative rounded-lg overflow-hidden bg-dark-900 ${
            isSpeaking ? 'ring-2 ring-green-500' : 'border border-dark-700'
        }`}>
            <div className="aspect-video relative">
                {videoEnabled ? (
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted={isLocal}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center">
                            <span className="text-2xl font-semibold text-white">
                                {displayName.charAt(0).toUpperCase()}
                            </span>
                        </div>
                    </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                            {isSpeaking && (
                                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                            )}
                            <span className="text-white text-sm font-medium truncate">
                                {displayName}
                            </span>
                            {isLocal && (
                                <span className="text-xs text-dark-400">(You)</span>
                            )}
                        </div>
                        <div className="flex items-center space-x-1">
                            {isMuted && (
                                <div className="p-1 bg-red-600 rounded">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                                    </svg>
                                </div>
                            )}
                            {!videoEnabled && (
                                <div className="p-1 bg-dark-700 rounded">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3l18 18" />
                                    </svg>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const VideoGrid: React.FC<VideoGridProps> = ({ participants, localVideoEnabled }) => {
    const totalTiles = participants.length + (localVideoEnabled ? 1 : 0);

    const getGridClass = () => {
        if (totalTiles === 1) return 'grid-cols-1';
        if (totalTiles === 2) return 'grid-cols-2';
        if (totalTiles <= 4) return 'grid-cols-2';
        if (totalTiles <= 6) return 'grid-cols-3';
        return 'grid-cols-4';
    };

    if (totalTiles === 0) return null;

    return (
        <div className="p-4 border-t border-dark-700">
            <div className={`grid ${getGridClass()} gap-3`}>
                {localVideoEnabled && (
                    <VideoTile
                        isLocal={true}
                        videoEnabled={localVideoEnabled}
                    />
                )}
                {participants.map((participant) => (
                    <VideoTile
                        key={participant.ssrc}
                        participant={participant}
                        videoEnabled={participant.videoEnabled}
                    />
                ))}
            </div>
        </div>
    );
};

export default VideoGrid;