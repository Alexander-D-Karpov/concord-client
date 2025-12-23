import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ParticipantState } from '../hooks/useVoiceClient';
import { useAuthStore } from '../hooks/useAuthStore';
import { useVideoCapture } from '../hooks/useVideoCapture';
import { useVideoPlayback } from '../hooks/useVideoPlayback';
import ScreenSourcePicker from './ScreenSourcePicker';

interface VideoGridProps {
    participants: Map<string, ParticipantState>;
    localVideoEnabled: boolean;
    localScreenSharing: boolean;
    localMuted: boolean;
    localSpeaking: boolean;
    ssrcToUserId: Map<number, string>;
    isFullscreenCall?: boolean;
    onToggleFullscreen?: () => void;
}

interface VideoTileProps {
    userId: string;
    displayName: string;
    avatarUrl?: string;
    isLocal: boolean;
    isSpeaking: boolean;
    isMuted: boolean;
    videoEnabled: boolean;
    videoStream?: MediaStream | null;
    videoCanvas?: HTMLCanvasElement | null;
    isScreenShare?: boolean;
    onClick?: () => void;
    isExpanded?: boolean;
    size?: 'small' | 'medium' | 'large';
}

const VideoTile: React.FC<VideoTileProps> = ({
                                                 displayName,
                                                 avatarUrl,
                                                 isLocal,
                                                 isSpeaking,
                                                 isMuted,
                                                 videoEnabled,
                                                 videoStream,
                                                 videoCanvas,
                                                 isScreenShare,
                                                 onClick,
                                                 isExpanded,
                                                 size = 'medium',
                                             }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();

    useEffect(() => {
        if (videoRef.current && videoStream) {
            videoRef.current.srcObject = videoStream;
        }
        return () => {
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, [videoStream]);

    useEffect(() => {
        if (!videoCanvas || !canvasRef.current) return;

        const targetCanvas = canvasRef.current;
        const ctx = targetCanvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let lastDrawTime = 0;
        const targetFps = 30;
        const frameInterval = 1000 / targetFps;

        const render = (timestamp: number) => {
            if (timestamp - lastDrawTime >= frameInterval) {
                if (videoCanvas.width > 0 && videoCanvas.width !== targetCanvas.width) {
                    targetCanvas.width = videoCanvas.width;
                }
                if (videoCanvas.height > 0 && videoCanvas.height !== targetCanvas.height) {
                    targetCanvas.height = videoCanvas.height;
                }
                ctx.drawImage(videoCanvas, 0, 0);
                lastDrawTime = timestamp;
            }
            animationRef.current = requestAnimationFrame(render);
        };

        animationRef.current = requestAnimationFrame(render);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [videoCanvas]);

    const showVideo = videoEnabled && (videoStream || videoCanvas);
    const initial = displayName.charAt(0).toUpperCase();

    const sizeClasses = {
        small: 'w-32 h-24',
        medium: 'w-full aspect-video',
        large: 'w-full h-full',
    };

    const avatarSizes = {
        small: 'w-8 h-8 text-sm',
        medium: 'w-16 h-16 text-2xl',
        large: 'w-24 h-24 text-4xl',
    };

    return (
        <div
            className={`relative rounded-lg overflow-hidden bg-dark-900 cursor-pointer transition-all duration-200 ${
                isSpeaking ? 'ring-2 ring-green-500' : 'ring-1 ring-dark-700'
            } ${isExpanded ? 'col-span-full row-span-full' : ''}`}
            onClick={onClick}
        >
            <div className={`${isExpanded ? 'h-full' : sizeClasses[size]} relative bg-dark-800`}>
                {showVideo ? (
                    videoStream ? (
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            muted={isLocal}
                            className="w-full h-full object-contain bg-black"
                        />
                    ) : (
                        <canvas
                            ref={canvasRef}
                            className="w-full h-full object-contain bg-black"
                        />
                    )
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        {avatarUrl ? (
                            <img src={avatarUrl} alt={displayName} className={`rounded-full object-cover ${avatarSizes[size]}`} />
                        ) : (
                            <div className={`rounded-full bg-primary-600 flex items-center justify-center ${avatarSizes[size]}`}>
                                <span className="font-semibold text-white">{initial}</span>
                            </div>
                        )}
                    </div>
                )}

                {isScreenShare && (
                    <div className="absolute top-2 left-2 px-2 py-1 bg-primary-600 rounded text-xs text-white">
                        Screen
                    </div>
                )}

                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                            {isSpeaking && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />}
                            <span className="text-white text-xs font-medium truncate">{displayName}</span>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                            {isMuted && (
                                <div className="p-1 bg-red-600 rounded">
                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
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

const VideoGrid: React.FC<VideoGridProps> = ({
                                                 participants,
                                                 localVideoEnabled,
                                                 localScreenSharing,
                                                 localMuted,
                                                 localSpeaking,
                                                 ssrcToUserId,
                                                 isFullscreenCall = false,
                                                 onToggleFullscreen,
                                             }) => {
    const { user } = useAuthStore();
    const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

    const stableSsrcToUserId = useMemo(() => new Map(ssrcToUserId), [JSON.stringify(Array.from(ssrcToUserId.entries()))]);

    const { stream: localVideoStream } = useVideoCapture(localVideoEnabled && !localScreenSharing, false);
    const { stream: screenShareStream, showSourcePicker, screenSources, selectScreenSource, cancelSourcePicker } = useVideoCapture(localScreenSharing, true);
    const { remoteVideos } = useVideoPlayback(true, stableSsrcToUserId);

    const handleTileClick = useCallback((userId: string) => {
        setExpandedUserId(prev => prev === userId ? null : userId);
    }, []);

    const showLocalVideo = localVideoEnabled || localScreenSharing;
    const localStream = localScreenSharing ? screenShareStream : localVideoStream;
    const participantArray = Array.from(participants.values());
    const totalTiles = participantArray.length + (showLocalVideo ? 1 : 0);

    const getGridLayout = () => {
        if (expandedUserId) return 'grid-cols-1';
        if (totalTiles <= 1) return 'grid-cols-1';
        if (totalTiles === 2) return 'grid-cols-2';
        if (totalTiles <= 4) return 'grid-cols-2 grid-rows-2';
        if (totalTiles <= 6) return 'grid-cols-3 grid-rows-2';
        if (totalTiles <= 9) return 'grid-cols-3 grid-rows-3';
        return 'grid-cols-4';
    };

    const containerClass = isFullscreenCall
        ? 'fixed inset-0 z-50 bg-dark-900 p-4'
        : 'p-4 border-t border-dark-700';

    if (totalTiles === 0) {
        return (
            <div className={containerClass}>
                <div className="text-center text-dark-400 py-8">
                    No video participants
                </div>
            </div>
        );
    }

    return (
        <>
            <div className={containerClass}>
                {isFullscreenCall && (
                    <div className="absolute top-4 right-4 z-10 flex space-x-2">
                        <button
                            onClick={onToggleFullscreen}
                            className="p-2 bg-dark-800 hover:bg-dark-700 rounded-lg transition"
                            title="Exit fullscreen"
                        >
                            <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                )}

                <div className={`grid ${getGridLayout()} gap-2 ${isFullscreenCall ? 'h-full' : ''}`}>
                    {expandedUserId ? (
                        <>
                            {expandedUserId === 'local' && showLocalVideo && (
                                <VideoTile
                                    userId="local"
                                    displayName={user?.displayName || 'You'}
                                    avatarUrl={user?.avatarUrl}
                                    isLocal={true}
                                    isSpeaking={localSpeaking}
                                    isMuted={localMuted}
                                    videoEnabled={showLocalVideo}
                                    videoStream={localStream}
                                    isScreenShare={localScreenSharing}
                                    onClick={() => handleTileClick('local')}
                                    isExpanded={true}
                                    size="large"
                                />
                            )}
                            {participantArray.find(p => p.userId === expandedUserId) && (
                                <VideoTile
                                    userId={expandedUserId}
                                    displayName={participantArray.find(p => p.userId === expandedUserId)?.displayName || expandedUserId.split('-')[0]}
                                    avatarUrl={participantArray.find(p => p.userId === expandedUserId)?.avatarUrl}
                                    isLocal={false}
                                    isSpeaking={participantArray.find(p => p.userId === expandedUserId)?.speaking || false}
                                    isMuted={participantArray.find(p => p.userId === expandedUserId)?.muted || false}
                                    videoEnabled={participantArray.find(p => p.userId === expandedUserId)?.videoEnabled || false}
                                    videoCanvas={remoteVideos.get(participantArray.find(p => p.userId === expandedUserId)?.videoSsrc || 0)?.canvas}
                                    onClick={() => handleTileClick(expandedUserId)}
                                    isExpanded={true}
                                    size="large"
                                />
                            )}
                        </>
                    ) : (
                        <>
                            {showLocalVideo && (
                                <VideoTile
                                    userId="local"
                                    displayName={user?.displayName || 'You'}
                                    avatarUrl={user?.avatarUrl}
                                    isLocal={true}
                                    isSpeaking={localSpeaking}
                                    isMuted={localMuted}
                                    videoEnabled={showLocalVideo}
                                    videoStream={localStream}
                                    isScreenShare={localScreenSharing}
                                    onClick={() => handleTileClick('local')}
                                    size={isFullscreenCall ? 'large' : 'medium'}
                                />
                            )}
                            {participantArray.map((participant) => (
                                <VideoTile
                                    key={participant.userId}
                                    userId={participant.userId}
                                    displayName={participant.displayName || participant.userId.split('-')[0]}
                                    avatarUrl={participant.avatarUrl}
                                    isLocal={false}
                                    isSpeaking={participant.speaking}
                                    isMuted={participant.muted}
                                    videoEnabled={participant.videoEnabled}
                                    videoCanvas={remoteVideos.get(participant.videoSsrc)?.canvas}
                                    onClick={() => handleTileClick(participant.userId)}
                                    size={isFullscreenCall ? 'large' : 'medium'}
                                />
                            ))}
                        </>
                    )}
                </div>

                {expandedUserId && !isFullscreenCall && (
                    <div className="absolute bottom-4 left-4 right-4 flex space-x-2 overflow-x-auto py-2">
                        {showLocalVideo && expandedUserId !== 'local' && (
                            <div className="flex-shrink-0">
                                <VideoTile
                                    userId="local"
                                    displayName={user?.displayName || 'You'}
                                    isLocal={true}
                                    isSpeaking={localSpeaking}
                                    isMuted={localMuted}
                                    videoEnabled={showLocalVideo}
                                    videoStream={localStream}
                                    onClick={() => handleTileClick('local')}
                                    size="small"
                                />
                            </div>
                        )}
                        {participantArray
                            .filter(p => p.userId !== expandedUserId)
                            .map((participant) => (
                                <div key={participant.userId} className="flex-shrink-0">
                                    <VideoTile
                                        userId={participant.userId}
                                        displayName={participant.displayName || participant.userId.split('-')[0]}
                                        isLocal={false}
                                        isSpeaking={participant.speaking}
                                        isMuted={participant.muted}
                                        videoEnabled={participant.videoEnabled}
                                        videoCanvas={remoteVideos.get(participant.videoSsrc)?.canvas}
                                        onClick={() => handleTileClick(participant.userId)}
                                        size="small"
                                    />
                                </div>
                            ))}
                    </div>
                )}
            </div>

            {showSourcePicker && (
                <ScreenSourcePicker
                    sources={screenSources}
                    onSelect={selectScreenSource}
                    onCancel={cancelSourcePicker}
                />
            )}
        </>
    );
};

export default VideoGrid;