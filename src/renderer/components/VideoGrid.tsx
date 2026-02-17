import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ParticipantState } from '../hooks/useVoiceClient';
import { useAuthStore } from '../hooks/useAuthStore';
import { useVideoCapture } from '../hooks/useVideoCapture';
import { useVideoPlayback } from '../hooks/useVideoPlayback';
import ScreenSourcePicker from './ScreenSourcePicker';

interface VideoGridProps {
    roomId: string;
    participants: Map<string, ParticipantState>;
    localVideoEnabled: boolean;
    localScreenSharing: boolean;
    localMuted: boolean;
    localSpeaking: boolean;
    ssrcToUserId: Map<number, string>;
    disabledSSRCs: Set<number>;
    toggleSubscription: (ssrc: number) => void;
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

    // Video State
    videoEnabled: boolean;
    videoStream?: MediaStream | null;
    videoCanvas?: HTMLCanvasElement | null;

    // Screen Share State
    isScreenShare?: boolean;

    // Subscription/View State
    isSubscribed?: boolean;
    onToggleSubscription?: () => void;
    ssrc?: number;

    // Layout
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
                                                 isSubscribed = true,
                                                 onToggleSubscription,
                                                 onClick,
                                                 isExpanded,
                                                 size = 'medium',
                                             }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();

    // Handle Local Stream (MediaStream)
    useEffect(() => {
        if (videoRef.current && videoStream) {
            videoRef.current.srcObject = videoStream;
        }
        return () => {
            if (videoRef.current) videoRef.current.srcObject = null;
        };
    }, [videoStream]);

    // Handle Remote Stream (Canvas from Decoder)
    useEffect(() => {
        if (!videoCanvas || !canvasRef.current) return;

        const targetCanvas = canvasRef.current;
        const ctx = targetCanvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let lastDrawTime = 0;
        const targetFps = 30;
        const frameInterval = 1000 / targetFps;

        const render = (timestamp: number) => {
            if (!isSubscribed) return;

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
    }, [videoCanvas, isSubscribed]);

    const showVideo = isSubscribed && videoEnabled && (videoStream || videoCanvas);
    const initial = displayName.charAt(0).toUpperCase();

    const sizeClasses = {
        small: 'w-48 h-36',
        medium: 'w-full aspect-video',
        large: 'w-full h-full',
    };

    const avatarSizes = {
        small: 'w-10 h-10 text-sm',
        medium: 'w-16 h-16 text-2xl',
        large: 'w-24 h-24 text-4xl',
    };

    return (
        <div
            className={`relative rounded-lg overflow-hidden bg-dark-900 cursor-pointer transition-all duration-200 group ${
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
                    <div className="absolute inset-0 flex items-center justify-center bg-dark-800">
                        <div className="flex flex-col items-center">
                            {avatarUrl ? (
                                <img src={avatarUrl} alt={displayName} className={`rounded-full object-cover ${avatarSizes[size]}`} />
                            ) : (
                                <div className={`rounded-full bg-primary-600 flex items-center justify-center ${avatarSizes[size]}`}>
                                    <span className="font-semibold text-white">{initial}</span>
                                </div>
                            )}
                            {!isSubscribed && (
                                <span className="mt-2 text-xs text-dark-400 font-medium px-2 py-1 bg-dark-900/50 rounded">
                                    Video Paused
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Status Badges */}
                <div className="absolute top-2 left-2 flex space-x-1">
                    {isScreenShare && (
                        <div className="px-2 py-1 bg-primary-600/90 rounded text-xs text-white font-medium shadow-sm backdrop-blur-sm">
                            Screen
                        </div>
                    )}
                </div>

                {/* Overlay Controls */}
                {!isLocal && videoEnabled && onToggleSubscription && (
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleSubscription();
                            }}
                            className={`p-1.5 rounded-full backdrop-blur-md transition ${
                                isSubscribed
                                    ? 'bg-dark-900/50 text-white hover:bg-red-500/80'
                                    : 'bg-red-500/80 text-white hover:bg-green-500/80'
                            }`}
                            title={isSubscribed ? "Disable Video" : "Enable Video"}
                        >
                            {isSubscribed ? (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                            )}
                        </button>
                    </div>
                )}

                {/* Name Tag */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 min-w-0">
                            {/* Only show circle indicator if this specific tile should show speaking */}
                            {!isScreenShare && isSpeaking && <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0" />}
                            <span className="text-white text-xs font-medium truncate">{displayName}</span>
                        </div>
                        <div className="flex items-center space-x-1 flex-shrink-0">
                            {isMuted && !isScreenShare && (
                                <div className="p-1 bg-red-600/80 rounded backdrop-blur-sm">
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
                                                 roomId,
                                                 participants,
                                                 localVideoEnabled,
                                                 localScreenSharing,
                                                 localMuted,
                                                 localSpeaking,
                                                 ssrcToUserId,
                                                 disabledSSRCs,
                                                 toggleSubscription,
                                                 isFullscreenCall = false,
                                                 onToggleFullscreen,
                                             }) => {
    const { user } = useAuthStore();
    const [expandedTileKey, setExpandedTileKey] = useState<string | null>(null);

    const stableSsrcToUserId = useMemo(() => new Map(ssrcToUserId), [JSON.stringify(Array.from(ssrcToUserId.entries()))]);

    const { stream: localVideoStream } = useVideoCapture(localVideoEnabled, false);
    const {
        stream: screenShareStream,
        showSourcePicker,
        screenSources,
        selectScreenSource,
        cancelSourcePicker
    } = useVideoCapture(localScreenSharing, true);

    const { remoteVideos } = useVideoPlayback(true, stableSsrcToUserId);

    const handleTileClick = useCallback((tileKey: string) => {
        setExpandedTileKey(prev => prev === tileKey ? null : tileKey);
    }, []);

    // 1. Local Camera Tile
    // Show local camera if video is enabled OR screen sharing is disabled (default avatar view)
    const showLocalCamera = localVideoEnabled || !localScreenSharing;
    const localCameraTile = showLocalCamera ? {
        key: 'local-cam',
        userId: 'local',
        displayName: user?.displayName || 'You',
        avatarUrl: user?.avatarUrl,
        isLocal: true,
        isSpeaking: localSpeaking,
        isMuted: localMuted,
        videoEnabled: localVideoEnabled,
        videoStream: localVideoStream,
        isScreenShare: false,
        ssrc: undefined
    } : null;

    // 2. Local Screen Tile
    const localScreenTile = localScreenSharing ? {
        key: 'local-screen',
        userId: 'local',
        displayName: `${user?.displayName || 'You'} (Screen)`,
        avatarUrl: user?.avatarUrl,
        isLocal: true,
        isSpeaking: !showLocalCamera && localSpeaking, // Highlight if no camera tile
        isMuted: localMuted,
        videoEnabled: true,
        videoStream: screenShareStream,
        isScreenShare: true,
        ssrc: undefined
    } : null;

    // 3. Remote Tiles
    const remoteTiles = Array.from(participants.values())
        .filter(p => p.userId !== user?.id) // Filter out self
        .flatMap(p => {
            const tiles = [];

            const showRemoteCamera = p.videoEnabled || !p.screenSharing;

            if (showRemoteCamera) {
                tiles.push({
                    key: `${p.userId}-cam`,
                    userId: p.userId,
                    displayName: p.displayName || p.userId.split('-')[0],
                    avatarUrl: p.avatarUrl,
                    isLocal: false,
                    isSpeaking: p.speaking,
                    isMuted: p.muted,
                    videoEnabled: p.videoEnabled,
                    videoCanvas: p.videoSsrc ? remoteVideos.get(p.videoSsrc)?.canvas : null,
                    isScreenShare: false,
                    isSubscribed: p.videoSsrc ? !disabledSSRCs.has(p.videoSsrc) : true,
                    ssrc: p.videoSsrc,
                });
            }

            // Remote Screen Share Tile
            if (p.screenSharing && p.screenSsrc) {
                tiles.push({
                    key: `${p.userId}-screen`,
                    userId: p.userId,
                    displayName: `${p.displayName || p.userId.split('-')[0]}'s Screen`,
                    avatarUrl: undefined,
                    isLocal: false,
                    isSpeaking: !showRemoteCamera && p.speaking, // Highlight if no camera tile
                    isMuted: p.muted,
                    videoEnabled: true,
                    videoCanvas: remoteVideos.get(p.screenSsrc)?.canvas,
                    isScreenShare: true,
                    isSubscribed: !disabledSSRCs.has(p.screenSsrc),
                    ssrc: p.screenSsrc,
                });
            }

            return tiles;
        });

    const allTiles = [
        ...(localCameraTile ? [localCameraTile] : []),
        ...(localScreenTile ? [localScreenTile] : []),
        ...remoteTiles
    ];

    // Filter out tiles that shouldn't be visible (e.g. screen share without SSRC)
    // IMPORTANT: Keep remote camera tiles even if no SSRC yet (audio only participants)
    const visibleTiles = allTiles.filter(t => {
        if (t.isScreenShare && !t.isLocal && !t.ssrc) return false;
        return true;
    });

    const totalTiles = visibleTiles.length;

    const getGridLayout = () => {
        if (expandedTileKey) return 'grid-cols-1';
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
                    Waiting for others to join...
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
                    {expandedTileKey ? (
                        <>
                            {visibleTiles.filter(t => t.key === expandedTileKey).map(({ key, ...t }) => (
                                <VideoTile
                                    key={key}
                                    {...t}
                                    onClick={() => handleTileClick(key)}
                                    isExpanded={true}
                                    size="large"
                                    onToggleSubscription={t.ssrc ? () => toggleSubscription(t.ssrc!) : undefined}
                                />
                            ))}
                        </>
                    ) : (
                        visibleTiles.map(({ key, ...t }) => (
                            <VideoTile
                                key={key}
                                {...t}
                                onClick={() => handleTileClick(key)}
                                size={isFullscreenCall ? 'large' : 'medium'}
                                onToggleSubscription={t.ssrc ? () => toggleSubscription(t.ssrc!) : undefined}
                            />
                        ))
                    )}
                </div>

                {expandedTileKey && !isFullscreenCall && (
                    <div className="absolute bottom-4 left-4 right-4 flex space-x-2 overflow-x-auto py-2">
                        {visibleTiles
                            .filter(t => t.key !== expandedTileKey)
                            .map(({ key, ...t }) => (
                                <div key={key} className="flex-shrink-0">
                                    <VideoTile
                                        {...t}
                                        onClick={() => handleTileClick(key)}
                                        size="small"
                                        onToggleSubscription={t.ssrc ? () => toggleSubscription(t.ssrc!) : undefined}
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