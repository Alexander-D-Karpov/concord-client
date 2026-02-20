import React, { useEffect, useRef, useState, useCallback } from 'react';
import Modal from './Modal';

interface AvatarCropModalProps {
    file: File;
    onCrop: (croppedData: ArrayBuffer) => void;
    onCancel: () => void;
}

const VIEWPORT_SIZE = 300;

const AvatarCropModal: React.FC<AvatarCropModalProps> = ({ file, onCrop, onCancel }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const [imgUrl, setImgUrl] = useState('');
    const [imgNatural, setImgNatural] = useState({ w: 0, h: 0 });
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0, ox: 0, oy: 0 });
    const [ready, setReady] = useState(false);

    useEffect(() => {
        const url = URL.createObjectURL(file);
        setImgUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const img = e.currentTarget;
        imgRef.current = img;
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        setImgNatural({ w, h });

        const fitZoom = VIEWPORT_SIZE / Math.min(w, h);
        setZoom(fitZoom);
        setOffset({
            x: (VIEWPORT_SIZE - w * fitZoom) / 2,
            y: (VIEWPORT_SIZE - h * fitZoom) / 2,
        });
        setReady(true);
    };

    const clampOffset = useCallback((ox: number, oy: number, z: number) => {
        const scaledW = imgNatural.w * z;
        const scaledH = imgNatural.h * z;
        return {
            x: Math.min(0, Math.max(VIEWPORT_SIZE - scaledW, ox)),
            y: Math.min(0, Math.max(VIEWPORT_SIZE - scaledH, oy)),
        };
    }, [imgNatural]);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y });
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        setOffset(clampOffset(dragStart.ox + dx, dragStart.oy + dy, zoom));
    }, [dragging, dragStart, zoom, clampOffset]);

    const handleMouseUp = useCallback(() => setDragging(false), []);

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [dragging, handleMouseMove, handleMouseUp]);

    const handleWheel = (e: React.WheelEvent) => {
        e.preventDefault();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        const minZoom = VIEWPORT_SIZE / Math.min(imgNatural.w, imgNatural.h);
        const maxZoom = minZoom * 5;
        const factor = e.deltaY < 0 ? 1.1 : 0.9;
        const newZoom = Math.min(maxZoom, Math.max(minZoom, zoom * factor));

        const ratio = newZoom / zoom;
        const newOx = mx - ratio * (mx - offset.x);
        const newOy = my - ratio * (my - offset.y);

        setZoom(newZoom);
        setOffset(clampOffset(newOx, newOy, newZoom));
    };

    const handleCrop = () => {
        if (!imgRef.current) return;

        const canvas = document.createElement('canvas');
        canvas.width = VIEWPORT_SIZE;
        canvas.height = VIEWPORT_SIZE;
        const ctx = canvas.getContext('2d')!;

        ctx.drawImage(
            imgRef.current,
            -offset.x / zoom,
            -offset.y / zoom,
            VIEWPORT_SIZE / zoom,
            VIEWPORT_SIZE / zoom,
            0, 0,
            VIEWPORT_SIZE, VIEWPORT_SIZE,
        );

        canvas.toBlob((blob) => {
            if (blob) blob.arrayBuffer().then(onCrop);
        }, 'image/png');
    };

    return (
        <Modal onClose={onCancel} className="max-w-md">
            <div className="p-6">
                <h3 className="text-xl font-semibold text-white mb-4">Crop Avatar</h3>

                <div className="flex justify-center mb-4">
                    <div
                        ref={containerRef}
                        className="relative overflow-hidden rounded-full bg-dark-700 cursor-grab active:cursor-grabbing"
                        style={{ width: VIEWPORT_SIZE, height: VIEWPORT_SIZE }}
                        onMouseDown={handleMouseDown}
                        onWheel={handleWheel}
                    >
                        {imgUrl && (
                            <img
                                src={imgUrl}
                                onLoad={handleImageLoad}
                                className="absolute select-none pointer-events-none"
                                style={{
                                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                                    transformOrigin: '0 0',
                                    maxWidth: 'none',
                                }}
                                draggable={false}
                                crossOrigin="anonymous"
                            />
                        )}
                        {!ready && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}
                    </div>
                </div>

                <p className="text-center text-sm text-dark-400 mb-4">
                    Drag to reposition, scroll to zoom
                </p>

                <div className="flex space-x-2">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleCrop}
                        disabled={!ready}
                        className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white rounded-lg transition"
                    >
                        Upload
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default AvatarCropModal;