import React, { useRef, useState } from 'react';

interface FileUploadProps {
    onFileSelect: (file: File) => void;
    disabled?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({ onFileSelect, disabled }) => {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragActive, setDragActive] = useState(false);

    const handleClick = () => {
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files);
            const MAX_FILE_SIZE = 10 * 1024 * 1024;

            for (const file of files) {
                if (file.size > MAX_FILE_SIZE) {
                    alert(`File "${file.name}" is too large. Maximum size is 10MB.`);
                    continue;
                }
                onFileSelect(file);
            }
        }
    };

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);

        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            onFileSelect(e.dataTransfer.files[0]);
        }
    };

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,video/*,.pdf,.doc,.docx,.txt"
                multiple
            />
            <button
                type="button"
                onClick={handleClick}
                disabled={disabled}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`p-2 rounded transition ${
                    dragActive
                        ? 'bg-primary-600 text-white'
                        : 'hover:bg-dark-700 text-dark-400 hover:text-white'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Upload file (or paste/drag & drop)"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
            </button>
        </>
    );
};

export default FileUpload;