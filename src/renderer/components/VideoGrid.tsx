import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { ParticipantState } from '../hooks/useVoiceClient';
import useAuthStore from '../hooks/useAuthStore';
import { useVideoCapture } from '../hooks/useVideoCapture';
import { useVideoPlayback } from '../hooks/useVideoPlayback';
import ScreenSourcePicker from './ScreenSourcePicker';
import ConnectionBars from './ConnectionBars';

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
    localQuality?: number;
}

interface VideoTileProps {
    displayName: string;
    avatarUrl?: string;
    isLocal: boolean;
    isSpeaking: boolean;
    isMuted: boolean;
    videoEnabled: boolean;
    videoStream?: MediaStream | null;
    videoCanvas?: HTMLCanvasElement | null;
    connectionQuality?: number;
    isScreenShare?: boolean;
    isSubscribed?: boolean;
    onToggleSubscription?: () => void;
    onClick?: () => void;
    isExpanded?: boolean;
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
                                                 connectionQuality,
                                                 isScreenShare = false,
                                                 isSubscribed = true,
                                                 onToggleSubscription,
                                                 onClick,
                                                 isExpanded = false,
                                             }) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animationRef = useRef<number>();

    useEffect(() => {
        if (videoRef.current && videoStream) {
            videoRef.current.srcObject = videoStream;
        }

        return () => {
            if (videoRef.current) {
                videoRef.current.srcObject = null;
            }
        };
    }, [videoStream]);

    useEffect(() => {
        if (!videoCanvas || !canvasRef.current) return;

        const targetCanvas = canvasRef.current;
        const ctx = targetCanvas.getContext('2d', { alpha: false });
        if (!ctx) return;

        let lastDrawTime = 0;
        const frameInterval = 1000 / 30;

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
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [videoCanvas, isSubscribed]);

    const showVideo = isSubscribed && videoEnabled && (videoStream || videoCanvas);
    const initial = displayName.charAt(0).toUpperCase();
    const mediaFitClass = isScreenShare ? 'object-contain' : 'object-cover';

    return (
        <div
            className={`group relative min-h-0 overflow-hidden rounded-2xl bg-white transition-all duration-200 dark:bg-dark-900 ${
                isSpeaking ? 'ring-2 ring-green-500' : 'ring-1 ring-dark-700'
            } ${isExpanded ? 'row-span-full col-span-full' : ''}`}
            onClick={onClick}
        >
            <div className="relative h-full min-h-0 bg-gray-50 dark:bg-dark-800">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted={isLocal}
                    className={`absolute inset-0 h-full w-full bg-black ${mediaFitClass}`}
                    style={{ display: showVideo && videoStream ? 'block' : 'none' }}
                />

                <canvas
                    ref={canvasRef}
                    className={`absolute inset-0 h-full w-full bg-black ${mediaFitClass}`}
                    style={{ display: showVideo && !videoStream && videoCanvas ? 'block' : 'none' }}
                />

                {!showVideo && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-dark-800">
                        <div className="flex flex-col items-center">
                            {avatarUrl ? (
                                <img
                                    src={avatarUrl}
                                    alt={displayName}
                                    className="h-16 w-16 rounded-full object-cover sm:h-20 sm:w-20"
                                />
                            ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary-600 sm:h-20 sm:w-20">
                                    <span className="text-2xl font-semibold text-white">{initial}</span>
                                </div>
                            )}

                            {!isSubscribed && (
                                <span className="mt-2 rounded-lg bg-white/90 px-2 py-1 text-xs font-medium text-gray-500 dark:bg-dark-900/80 dark:text-dark-400">
                                    Video Paused
                                </span>
                            )}
                        </div>
                    </div>
                )}

                <div className="absolute left-2 top-2 flex items-center gap-1">
                    {isScreenShare && (
                        <div className="rounded-lg bg-primary-600/90 px-2 py-1 text-xs font-medium text-white shadow-sm backdrop-blur-sm">
                            Screen
                        </div>
                    )}
                </div>

                {!isLocal && videoEnabled && onToggleSubscription && (
                    <div className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleSubscription();
                            }}
                            className={`rounded-full p-1.5 backdrop-blur-md transition ${
                                isSubscribed
                                    ? 'bg-dark-900/50 text-white hover:bg-red-500/80'
                                    : 'bg-red-500/80 text-white hover:bg-green-500/80'
                            }`}
                            title={isSubscribed ? 'Disable Video' : 'Enable Video'}
                        >
                            {isSubscribed ? (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                            ) : (
                                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                                </svg>
                            )}
                        </button>
                    </div>
                )}

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                            {!isScreenShare && isSpeaking && (
                                <div className="h-2 w-2 flex-shrink-0 animate-pulse rounded-full bg-green-500" />
                            )}
                            <span className="truncate text-xs font-medium text-white">{displayName}</span>
                            <ConnectionBars quality={connectionQuality ?? 0} size="sm" />
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-1">
                            {isMuted && !isScreenShare && (
                                <div className="rounded bg-red-600/80 p-1 backdrop-blur-sm">
                                    <svg className="h-3 w-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

type TileData = {
    key: string;
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
    isSubscribed?: boolean;
    ssrc?: number;
    connectionQuality?: number;
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
                                                 localQuality,
                                             }) => {
    const { user } = useAuthStore();
    const [expandedTileKey, setExpandedTileKey] = useState<string | null>(null);

    const stableSsrcToUserId = useMemo(
        () => new Map(ssrcToUserId),
        [JSON.stringify(Array.from(ssrcToUserId.entries()))]
    );

    const { stream: localVideoStream } = useVideoCapture(localVideoEnabled, false);

    const {
        stream: screenShareStream,
        showSourcePicker,
        screenSources,
        selectScreenSource,
        cancelSourcePicker,
    } = useVideoCapture(localScreenSharing, true);

    const { remoteVideos } = useVideoPlayback(true, stableSsrcToUserId);

    const handleTileClick = useCallback((tileKey: string) => {
        setExpandedTileKey((prev) => (prev === tileKey ? null : tileKey));
    }, []);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setExpandedTileKey(null);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const showLocalCamera = localVideoEnabled || !localScreenSharing;

    const localCameraTile: TileData | null = showLocalCamera
        ? {
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
            connectionQuality: localQuality,
        }
        : null;

    const localScreenTile: TileData | null = localScreenSharing
        ? {
            key: 'local-screen',
            userId: 'local',
            displayName: `${user?.displayName || 'You'} (Screen)`,
            isLocal: true,
            isSpeaking: false,
            isMuted: localMuted,
            videoEnabled: true,
            videoStream: screenShareStream,
            isScreenShare: true,
            connectionQuality: localQuality,
        }
        : null;

    const remoteCameraTiles: TileData[] = Array.from(participants.values())
        .filter((participant) => participant.userId !== user?.id)
        .flatMap((participant) => {
            const tiles: TileData[] = [];
            const showRemoteCamera = participant.videoEnabled || !participant.screenSharing;

            if (showRemoteCamera) {
                tiles.push({
                    key: `${participant.userId}-cam`,
                    userId: participant.userId,
                    displayName: participant.displayName || participant.userId.split('-')[0],
                    avatarUrl: participant.avatarUrl,
                    isLocal: false,
                    isSpeaking: participant.speaking,
                    isMuted: participant.muted,
                    videoEnabled: participant.videoEnabled,
                    videoCanvas: participant.videoSsrc ? remoteVideos.get(participant.videoSsrc)?.canvas : null,
                    isScreenShare: false,
                    isSubscribed: participant.videoSsrc ? !disabledSSRCs.has(participant.videoSsrc) : true,
                    ssrc: participant.videoSsrc,
                    connectionQuality: participant.connectionQuality,
                });
            }

            return tiles;
        });

    const remoteScreenTiles: TileData[] = Array.from(participants.values())
        .filter((participant) => participant.userId !== user?.id && participant.screenSharing && participant.screenSsrc)
        .map((participant) => ({
            key: `${participant.userId}-screen`,
            userId: participant.userId,
            displayName: `${participant.displayName || participant.userId.split('-')[0]}'s Screen`,
            isLocal: false,
            isSpeaking: false,
            isMuted: participant.muted,
            videoEnabled: true,
            videoCanvas: remoteVideos.get(participant.screenSsrc!)?.canvas,
            isScreenShare: true,
            isSubscribed: !disabledSSRCs.has(participant.screenSsrc!),
            ssrc: participant.screenSsrc!,
            connectionQuality: participant.connectionQuality,
        }));

    const allTiles = [
        ...(localCameraTile ? [localCameraTile] : []),
        ...remoteCameraTiles,
        ...(localScreenTile ? [localScreenTile] : []),
        ...remoteScreenTiles,
    ];

    const visibleTiles = allTiles.filter((tile) => {
        if (tile.isScreenShare && !tile.isLocal && !tile.ssrc) return false;
        return true;
    });

    const totalTiles = visibleTiles.length;
    const hasScreenShare = visibleTiles.some((tile) => tile.isScreenShare);

    const getGridLayout = () => {
        if (expandedTileKey) return 'grid-cols-1';
        if (hasScreenShare) return 'grid-cols-1';
        if (totalTiles <= 1) return 'grid-cols-1';
        if (totalTiles === 2) return 'grid-cols-1 sm:grid-cols-2';
        if (totalTiles <= 4) return 'grid-cols-2';
        if (totalTiles <= 6) return 'grid-cols-2 2xl:grid-cols-3';
        return 'grid-cols-2 2xl:grid-cols-3';
    };

    if (totalTiles === 0) {
        return (
            <>
                <div className="flex h-full items-center justify-center rounded-2xl border border-dark-700 bg-white dark:bg-dark-900">
                    <div className="py-8 text-center text-gray-500 dark:text-dark-400">
                        Waiting for others to join...
                    </div>
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
    }

    return (
        <>
            <div className={`grid h-full min-h-0 auto-rows-[minmax(0,1fr)] gap-2 ${getGridLayout()}`}>
                {expandedTileKey
                    ? visibleTiles
                        .filter((tile) => tile.key === expandedTileKey)
                        .map(({ key, ...tile }) => (
                            <VideoTile
                                key={key}
                                {...tile}
                                isExpanded
                                onClick={() => handleTileClick(key)}
                                onToggleSubscription={
                                    tile.ssrc ? () => toggleSubscription(tile.ssrc!) : undefined
                                }
                            />
                        ))
                    : visibleTiles.map(({ key, ...tile }) => (
                        <VideoTile
                            key={key}
                            {...tile}
                            onClick={() => handleTileClick(key)}
                            onToggleSubscription={
                                tile.ssrc ? () => toggleSubscription(tile.ssrc!) : undefined
                            }
                        />
                    ))}
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