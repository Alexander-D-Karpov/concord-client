import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotificationStore, ToastNotification } from '../hooks/useNotificationStore';
import { useRoomsStore } from '../hooks/useRoomsStore';
import { useDMStore } from '../hooks/useDMStore';

const Toast: React.FC<{ toast: ToastNotification; onDismiss: () => void }> = ({ toast, onDismiss }) => {
    const navigate = useNavigate();
    const { setCurrentRoom } = useRoomsStore();
    const { setCurrentChannel } = useDMStore();

    const handleClick = () => {
        if (toast.roomId) {
            setCurrentChannel(null);
            setCurrentRoom(toast.roomId);
            navigate('/');
        } else if (toast.channelId) {
            setCurrentRoom(null);
            setCurrentChannel(toast.channelId);
            navigate('/');
        } else if (toast.userId && toast.type === 'friend_request') {
            navigate('/friends');
        }
        onDismiss();
    };

    const getIcon = () => {
        switch (toast.type) {
            case 'mention':
                return (
                    <div className="w-10 h-10 bg-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-lg">@</span>
                    </div>
                );
            case 'dm':
                return (
                    <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-semibold">{toast.avatarInitial || '?'}</span>
                    </div>
                );
            case 'call':
                return (
                    <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                    </div>
                );
            case 'friend_request':
                return (
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                        </svg>
                    </div>
                );
            default:
                return (
                    <div className="w-10 h-10 bg-dark-600 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-semibold">{toast.avatarInitial || '#'}</span>
                    </div>
                );
        }
    };

    return (
        <div
            onClick={handleClick}
            className="bg-dark-800 border border-dark-600 rounded-lg shadow-2xl p-4 flex items-start space-x-3 cursor-pointer hover:bg-dark-700 transition-all duration-200 animate-slide-in max-w-sm"
        >
            {getIcon()}
            <div className="flex-1 min-w-0">
                <div className="font-semibold text-white text-sm truncate">{toast.title}</div>
                <div className="text-dark-300 text-sm truncate">{toast.body}</div>
            </div>
            <button
                onClick={(e) => { e.stopPropagation(); onDismiss(); }}
                className="flex-shrink-0 p-1 hover:bg-dark-600 rounded transition"
            >
                <svg className="w-4 h-4 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    );
};

const ToastContainer: React.FC = () => {
    const { toasts, dismissToast } = useNotificationStore();

    if (toasts.length === 0) return null;

    return (
        <div className="fixed top-4 right-4 z-[100] space-y-2">
            {toasts.map((toast) => (
                <Toast key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
            ))}
        </div>
    );
};

export default ToastContainer;