import React from 'react';
import { parseMarkdown } from '../utils/markdown';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
    const tokens = parseMarkdown(content);
    const hasBlockContent = tokens.some((token) => token.type === 'codeblock');

    const rendered = tokens.map((token, i) => {
        switch (token.type) {
            case 'bold':
                return (
                    <strong key={i} className="font-semibold">
                        {token.content}
                    </strong>
                );

            case 'italic':
                return <em key={i}>{token.content}</em>;

            case 'code':
                return (
                    <code
                        key={i}
                        className="px-1.5 py-0.5 bg-gray-200 dark:bg-dark-600 rounded text-sm font-mono text-pink-500 dark:text-pink-400"
                    >
                        {token.content}
                    </code>
                );

            case 'codeblock':
                return (
                    <pre
                        key={i}
                        className="my-2 p-3 bg-gray-200 dark:bg-dark-600 rounded-xl overflow-x-auto"
                    >
                        <code className="text-sm font-mono text-gray-900 dark:text-white">
                            {token.content}
                        </code>
                    </pre>
                );

            case 'link':
                return (
                    <a
                        key={i}
                        href={token.href || token.content}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary-400 hover:text-primary-300 underline underline-offset-2"
                    >
                        {token.content}
                    </a>
                );

            default:
                return (
                    <span key={i} className="whitespace-pre-wrap">
                        {token.content}
                    </span>
                );
        }
    });

    if (hasBlockContent) {
        return <div className={className}>{rendered}</div>;
    }

    return <span className={className}>{rendered}</span>;
};

export default MarkdownRenderer;