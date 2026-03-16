import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DMMessage } from '../../utils/types';
import { CloseIcon, AlertIcon, FileIcon } from '../icons';
import FileUpload from '../FileUpload';
import MessageReply from '../MessageReply';

interface DMChatInputProps {
    handle: string;
    newMessage: string;
    setNewMessage: (v: string) => void;
    attachments: File[];
    replyingTo: DMMessage | null;
    editingMessage: DMMessage | null;
    sendError: string | null;
    typingName: string | null;
    sending: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement>;
    onSubmit: (e: React.FormEvent) => void;
    onTyping: () => void;
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
    onFileSelect: (file: File) => void;
    onRemoveAttachment: (index: number) => void;
    onCancelReply: () => void;
    onCancelEdit: () => void;
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
                        <FileIcon size="md" className="text-gray-400 dark:text-dark-400" />
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

const DMChatInput: React.FC<DMChatInputProps> = ({
                                                     handle,
                                                     newMessage,
                                                     setNewMessage,
                                                     attachments,
                                                     replyingTo,
                                                     editingMessage,
                                                     sendError,
                                                     typingName,
                                                     sending,
                                                     inputRef,
                                                     onSubmit,
                                                     onTyping,
                                                     onPaste,
                                                     onFileSelect,
                                                     onRemoveAttachment,
                                                     onCancelReply,
                                                     onCancelEdit,
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
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                formRef.current?.requestSubmit();
            }
        },
        []
    );

    useEffect(() => {
        const el = inputRef.current;
        if (!el) return;

        el.style.height = '0px';
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }, [newMessage, inputRef]);

    const placeholder = useMemo(() => `Message @${handle}`, [handle]);
    const submitDisabled = sending || (!newMessage.trim() && attachments.length === 0);

    return (
        <div className="flex-shrink-0 border-t border-gray-200 bg-white/80 p-3 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-900/80">
            {sendError && (
                <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                    <AlertIcon size="sm" className="mt-0.5 flex-shrink-0" />
                    <span>{sendError}</span>
                </div>
            )}

            {typingName && (
                <div className="mb-2 text-xs italic text-gray-400 dark:text-dark-400">
                    {typingName} is typing...
                </div>
            )}

            {replyingTo && (
                <div className="mb-2">
                    <MessageReply replyTo={replyingTo as any} onCancel={onCancelReply} />
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
                <FileUpload onFileSelect={onFileSelect} disabled={sending} />

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
                    {sending ? 'Sending...' : editingMessage ? 'Save' : 'Send'}
                </button>
            </form>
        </div>
    );
};

export default DMChatInput;