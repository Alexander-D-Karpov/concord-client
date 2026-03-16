import React, { useEffect } from 'react';
import Modal from './Modal';

interface ConfirmModalProps {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    loading?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
                                                       title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
                                                       danger = false, onConfirm, onCancel, loading = false,
                                                   }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !loading) { e.preventDefault(); onConfirm(); }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onConfirm, loading]);

    return (
        <Modal onClose={onCancel} className="max-w-sm">
            <div className="p-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{title}</h3>
                <p className="text-gray-600 dark:text-dark-400 mb-6">{message}</p>
                <div className="flex space-x-2">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="flex-1 px-4 py-2 bg-gray-200 dark:bg-dark-700 hover:bg-gray-300 dark:hover:bg-dark-600 text-gray-900 dark:text-white rounded-lg transition"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className={`flex-1 px-4 py-2 text-gray-900 dark:text-white rounded-lg transition disabled:opacity-50 ${
                            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'
                        }`}
                    >
                        {loading ? 'Loading...' : confirmLabel}
                    </button>
                </div>
                <p className="text-xs text-gray-400 dark:text-dark-500 text-center mt-3">Press Enter to confirm, Escape to cancel</p>
            </div>
        </Modal>
    );
};

export default ConfirmModal;