import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface ImageLightboxProps {
    src: string;
    alt?: string;
    onClose: () => void;
    allImages?: string[];
    initialIndex?: number;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, onClose, allImages, initialIndex = 0 }) => {
    const images = allImages || [src];
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const [scale, setScale] = useState(1);

    const currentSrc = images[currentIndex] || src;
    const hasNext = currentIndex < images.length - 1;
    const hasPrev = currentIndex > 0;

    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowRight' && hasNext) setCurrentIndex(i => i + 1);
        if (e.key === 'ArrowLeft' && hasPrev) setCurrentIndex(i => i - 1);
        if (e.key === '+' || e.key === '=') setScale(s => Math.min(5, s + 0.5));
        if (e.key === '-') setScale(s => Math.max(0.5, s - 0.5));
        if (e.key === '0') setScale(1);
    }, [onClose, hasNext, hasPrev]);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        document.body.style.overflow = 'hidden';
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [handleKeyDown]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        setScale(s => Math.min(5, Math.max(0.5, s + (e.deltaY < 0 ? 0.2 : -0.2))));
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[10000] bg-black/90 backdrop-blur-sm flex items-center justify-center animate-fade-in"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-xl transition text-white z-10"
            >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>

            <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
                <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.max(0.5, s - 0.5)); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                    </svg>
                </button>
                <span className="text-white text-sm font-medium min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
                <button onClick={(e) => { e.stopPropagation(); setScale(s => Math.min(5, s + 0.5)); }} className="p-2 bg-white/10 hover:bg-white/20 rounded-xl transition text-white">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                </button>
            </div>

            {hasPrev && (
                <button
                    onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => i - 1); setScale(1); }}
                    className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition text-white z-10"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
            )}

            {hasNext && (
                <button
                    onClick={(e) => { e.stopPropagation(); setCurrentIndex(i => i + 1); setScale(1); }}
                    className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-white/10 hover:bg-white/20 rounded-xl transition text-white z-10"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            )}

            <img
                src={currentSrc}
                alt={alt || ''}
                className="max-w-[90vw] max-h-[90vh] object-contain transition-transform duration-200 select-none"
                style={{ transform: `scale(${scale})` }}
                onClick={(e) => e.stopPropagation()}
                onWheel={handleWheel}
                draggable={false}
                crossOrigin="anonymous"
            />

            {images.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                    {images.map((_, i) => (
                        <button
                            key={i}
                            onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); setScale(1); }}
                            className={`w-2 h-2 rounded-full transition ${i === currentIndex ? 'bg-white' : 'bg-white/40 hover:bg-white/60'}`}
                        />
                    ))}
                </div>
            )}
        </div>,
        document.body
    );
};

export default ImageLightbox;