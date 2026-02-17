import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
    children: React.ReactNode;
    onClose: () => void;
    className?: string;
}

const Modal: React.FC<ModalProps> = ({ children, onClose, className = '' }) => {
    const overlayRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const handleClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) {
            onClose();
        }
    };

    return createPortal(
        <div
            ref={overlayRef}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 animate-fade-in"
            onClick={handleClick}
        >
            <div className={`bg-dark-800 rounded-lg shadow-2xl border border-dark-700 w-full max-w-lg overflow-hidden animate-scale-in ${className}`}>
                {children}
            </div>
        </div>,
        document.body
    );
};

export default Modal;