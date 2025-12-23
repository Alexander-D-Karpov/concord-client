import React from 'react';

interface ScreenSource {
    id: string;
    name: string;
    thumbnail: string;
}

interface ScreenSourcePickerProps {
    sources: ScreenSource[];
    onSelect: (sourceId: string) => void;
    onCancel: () => void;
}

const ScreenSourcePicker: React.FC<ScreenSourcePickerProps> = ({ sources, onSelect, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-dark-800 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden">
                <div className="p-4 border-b border-dark-700 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">Choose what to share</h3>
                    <button
                        onClick={onCancel}
                        className="p-2 hover:bg-dark-700 rounded-lg transition"
                    >
                        <svg className="w-5 h-5 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="p-4 overflow-y-auto max-h-[60vh]">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                        {sources.map((source) => (
                            <button
                                key={source.id}
                                onClick={() => onSelect(source.id)}
                                className="bg-dark-700 rounded-lg p-2 hover:bg-dark-600 transition border-2 border-transparent hover:border-primary-500 text-left"
                            >
                                <img
                                    src={source.thumbnail}
                                    alt={source.name}
                                    className="w-full aspect-video object-cover rounded mb-2 bg-dark-900"
                                />
                                <p className="text-sm text-white truncate">{source.name}</p>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ScreenSourcePicker;