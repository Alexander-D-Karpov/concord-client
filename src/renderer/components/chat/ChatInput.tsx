import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Message } from '../../utils/types';
import { CloseIcon } from '../icons';
import FileUpload from '../FileUpload';
import MessageReply from '../MessageReply';

interface ChatInputProps {
    roomName?: string;
    newMessage: string;
    setNewMessage: (v: string) => void;
    attachments: File[];
    replyingTo: Message | null;
    editingMessage: Message | null;
    sendError: string | null;
    typingNames: string[];
    inputRef: React.RefObject<HTMLTextAreaElement>;
    onSubmit: (e: React.FormEvent) => void;
    onTyping: () => void;
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
    onFileSelect: (file: File) => void;
    onRemoveAttachment: (index: number) => void;
    onCancelReply: () => void;
    onCancelEdit: () => void;
    uploadingFile: boolean;
}

interface AttachmentPreviewItemProps {
    file: File;
    index: number;
    onRemove: (index: number) => void;
}

const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentPreviewItem: React.FC<AttachmentPreviewItemProps> = ({
                                                                         file,
                                                                         index,
                                                                         onRemove,
                                                                     }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const isImage = file.type.startsWith('image/');

    useEffect(() => {
        if (!isImage) {
            setPreviewUrl(null);
            return;
        }

        const url = URL.createObjectURL(file);
        setPreviewUrl(url);

        return () => {
            URL.revokeObjectURL(url);
        };
    }, [file, isImage]);

    return (
        <div className="group relative flex min-w-0 items-center gap-3 rounded-2xl border border-gray-200 bg-white px-3 py-2 shadow-sm dark:border-dark-700 dark:bg-dark-800">
            <div className="flex-shrink-0">
                {isImage && previewUrl ? (
                    <img
                        src={previewUrl}
                        alt={file.name}
                        className="h-12 w-12 rounded-xl object-cover"
                    />
                ) : (
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-dark-700">
                        <svg
                            className="h-6 w-6 text-gray-400 dark:text-dark-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                            />
                        </svg>
                    </div>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {file.name}
                </div>
                <div className="text-xs text-gray-500 dark:text-dark-400">
                    {formatFileSize(file.size)}
                </div>
            </div>

            <button
                type="button"
                onClick={() => onRemove(index)}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-900 dark:text-dark-400 dark:hover:bg-dark-700 dark:hover:text-white"
                title="Remove attachment"
                aria-label={`Remove ${file.name}`}
            >
                <CloseIcon size="sm" className="text-current" />
            </button>
        </div>
    );
};

const ChatInput: React.FC<ChatInputProps> = ({
                                                 roomName,
                                                 newMessage,
                                                 setNewMessage,
                                                 attachments,
                                                 replyingTo,
                                                 editingMessage,
                                                 sendError,
                                                 typingNames,
                                                 inputRef,
                                                 onSubmit,
                                                 onTyping,
                                                 onPaste,
                                                 onKeyDown,
                                                 onFileSelect,
                                                 onRemoveAttachment,
                                                 onCancelReply,
                                                 onCancelEdit,
                                                 uploadingFile,
                                             }) => {
    const formRef = useRef<HTMLFormElement>(null);

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            setNewMessage(e.target.value);
            onTyping();
        },
        [setNewMessage, onTyping]
    );

    const handleTextareaKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
            onKeyDown?.(e);

            if (e.defaultPrevented) return;

            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                formRef.current?.requestSubmit();
            }
        },
        [onKeyDown]
    );

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;

        el.style.height = '0px';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [newMessage, inputRef]);

    const typingLabel = useMemo(() => {
        if (typingNames.length === 0) return null;
        if (typingNames.length === 1) return `${typingNames[0]} is typing...`;
        if (typingNames.length === 2) return `${typingNames[0]} and ${typingNames[1]} are typing...`;
        return `${typingNames[0]} and ${typingNames.length - 1} others are typing...`;
    }, [typingNames]);

    const submitDisabled = uploadingFile || (!newMessage.trim() && attachments.length === 0);
    const placeholder = roomName ? `Message #${roomName}` : 'Message this room';

    return (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white/80 p-3 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-900/80">
            {sendError && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                    <svg
                        className="mt-0.5 h-4 w-4 flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                    </svg>
                    <span>{sendError}</span>
                </div>
            )}

            {typingLabel && (
                <div className="mb-2 text-xs italic text-gray-400 dark:text-dark-400">
                    {typingLabel}
                </div>
            )}

            {replyingTo && (
                <div className="mb-2">
                    <MessageReply replyTo={replyingTo} onCancel={onCancelReply} />
                </div>
            )}

            {editingMessage && (
                <div className="mb-2 flex items-center justify-between rounded-2xl border border-primary-500/20 bg-primary-500/10 px-3 py-2">
                    <div className="min-w-0">
                        <div className="text-sm font-medium text-primary-600 dark:text-primary-400">
                            Editing message
                        </div>
                        <div className="truncate text-xs text-gray-500 dark:text-dark-400">
                            Enter to save, Shift+Enter for a new line
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onCancelEdit}
                        className="ml-3 text-sm text-gray-500 transition hover:text-gray-900 dark:text-dark-400 dark:hover:text-white"
                    >
                        Cancel
                    </button>
                </div>
            )}

            {attachments.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                    {attachments.map((file, index) => (
                        <AttachmentPreviewItem
                            key={`${file.name}-${file.size}-${index}`}
                            file={file}
                            index={index}
                            onRemove={onRemoveAttachment}
                        />
                    ))}
                </div>
            )}

            <form ref={formRef} onSubmit={onSubmit} className="flex items-end gap-2">
                <FileUpload onFileSelect={onFileSelect} disabled={uploadingFile} />

                <div className="flex min-w-0 flex-1 items-end rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2 shadow-sm dark:border-dark-700 dark:bg-dark-800">
                    <textarea
                        ref={inputRef}
                        value={newMessage}
                        onChange={handleChange}
                        onPaste={onPaste}
                        onKeyDown={handleTextareaKeyDown}
                        placeholder={placeholder}
                        rows={1}
                        className="max-h-40 w-full min-w-0 resize-none overflow-y-auto bg-transparent text-sm text-gray-900 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-dark-400"
                    />
                </div>

                <button
                    type="submit"
                    disabled={submitDisabled}
                    className="inline-flex h-11 flex-shrink-0 items-center justify-center rounded-2xl bg-primary-600 px-4 text-sm font-medium text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {uploadingFile ? 'Uploading...' : editingMessage ? 'Save' : 'Send'}
                </button>
            </form>
        </div>
    );
};

export default ChatInput;