import React, { useState, useCallback, useRef } from 'react';

interface DropZoneProps {
    children: React.ReactNode;
    onFileDrop: (files: File[]) => void;
    disabled?: boolean;
    maxFileSize?: number;
    className?: string;
}

const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const DropZone: React.FC<DropZoneProps> = ({
                                               children,
                                               onFileDrop,
                                               disabled = false,
                                               maxFileSize = DEFAULT_MAX_FILE_SIZE,
                                               className = '',
                                           }) => {
    const [isDragging, setIsDragging] = useState(false);
    const dragCounter = useRef(0);

    const hasFiles = (event: React.DragEvent) =>
        Array.from(event.dataTransfer?.types || []).includes('Files');

    const resetDragState = () => {
        dragCounter.current = 0;
        setIsDragging(false);
    };

    const handleDragEnter = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            if (disabled || !hasFiles(e)) return;

            e.preventDefault();
            e.stopPropagation();

            dragCounter.current += 1;
            setIsDragging(true);
        },
        [disabled]
    );

    const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        dragCounter.current -= 1;

        if (dragCounter.current <= 0) {
            resetDragState();
        }
    }, []);

    const handleDragOver = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            if (disabled || !hasFiles(e)) return;

            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
        },
        [disabled]
    );

    const handleDrop = useCallback(
        (e: React.DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            e.stopPropagation();

            const droppedFiles = Array.from(e.dataTransfer.files || []);
            resetDragState();

            if (disabled || droppedFiles.length === 0) return;

            const validFiles = droppedFiles.filter((file) => file.size <= maxFileSize);
            if (validFiles.length > 0) {
                onFileDrop(validFiles);
            }
        },
        [disabled, maxFileSize, onFileDrop]
    );

    return (
        <div
            className={`relative flex min-h-0 flex-1 flex-col ${className}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            aria-disabled={disabled}
        >
            {children}

            {isDragging && !disabled && (
                <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary-500 bg-primary-600/10 backdrop-blur-sm">
                    <div className="px-6 text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 shadow-sm dark:bg-dark-800/80">
                            <svg
                                className="h-7 w-7 text-primary-500"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden="true"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                />
                            </svg>
                        </div>

                        <p className="text-sm font-semibold text-primary-600 dark:text-primary-400">
                            Drop files to upload
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-dark-400">
                            Max {(maxFileSize / (1024 * 1024)).toFixed(0)}MB per file
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DropZone;