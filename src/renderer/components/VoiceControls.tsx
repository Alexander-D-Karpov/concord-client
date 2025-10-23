import React, { useState } from 'react';

interface VoiceControlsProps {
    roomId: string;
}

const VoiceControls: React.FC<VoiceControlsProps> = ({ roomId }) => {
    const [inCall, setInCall] = useState(false);
    const [muted, setMuted] = useState(false);
    const [deafened, setDeafened] = useState(false);

    const toggleCall = () => {
        setInCall(!inCall);
        if (!inCall) {
            setMuted(false);
            setDeafened(false);
        }
    };

    if (!inCall) {
        return (
            <div className="p-4 border-t border-dark-700">
                <button
                    onClick={toggleCall}
                    className="w-full px-4 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition flex items-center justify-center space-x-2"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    <span>Join Voice</span>
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 border-t border-dark-700 bg-dark-800">
            <div className="bg-dark-700 rounded-lg p-3 mb-3">
                <div className="text-sm font-medium text-white mb-1">Voice Connected</div>
                <div className="text-xs text-dark-400">Room: {roomId.slice(0, 8)}</div>
            </div>

            <div className="flex space-x-2">
                <button
                    onClick={() => setMuted(!muted)}
                    className={`flex-1 p-3 rounded-lg transition ${
                        muted
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-dark-600 hover:bg-dark-500 text-white'
                    }`}
                    title={muted ? 'Unmute' : 'Mute'}
                >
                    {muted ? (
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" clipRule="evenodd" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                    )}
                </button>

                <button
                    onClick={() => setDeafened(!deafened)}
                    className={`flex-1 p-3 rounded-lg transition ${
                        deafened
                            ? 'bg-red-600 hover:bg-red-700 text-white'
                            : 'bg-dark-600 hover:bg-dark-500 text-white'
                    }`}
                    title={deafened ? 'Undeafen' : 'Deafen'}
                >
                    <svg className="w-5 h-5 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l2 2m0 0l2 2m-2-2l-2 2m2-2l2-2" />
                    </svg>
                </button>

                <button
                    onClick={toggleCall}
                    className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                    title="Disconnect"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
                    </svg>
                </button>
            </div>
        </div>
    );
};

export default VoiceControls;