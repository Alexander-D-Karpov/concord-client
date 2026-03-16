interface MarkdownToken {
    type: 'text' | 'bold' | 'italic' | 'code' | 'codeblock' | 'link';
    content: string;
    href?: string;
}

const URL_REGEX = /https?:\/\/[^\s<>)"']+/g;

export function parseMarkdown(input: string): MarkdownToken[] {
    const tokens: MarkdownToken[] = [];
    let remaining = input;

    const patterns: { regex: RegExp; type: MarkdownToken['type']; group: number }[] = [
        { regex: /```([\s\S]*?)```/, type: 'codeblock', group: 1 },
        { regex: /`([^`]+)`/, type: 'code', group: 1 },
        { regex: /\*\*(.+?)\*\*/, type: 'bold', group: 1 },
        { regex: /\*(.+?)\*/, type: 'italic', group: 1 },
    ];

    while (remaining.length > 0) {
        let earliest: { index: number; length: number; token: MarkdownToken } | null = null;

        for (const p of patterns) {
            const match = p.regex.exec(remaining);
            if (match && (!earliest || match.index < earliest.index)) {
                earliest = {
                    index: match.index,
                    length: match[0].length,
                    token: { type: p.type, content: match[p.group] },
                };
            }
        }

        const urlMatch = URL_REGEX.exec(remaining);
        URL_REGEX.lastIndex = 0;
        if (urlMatch && (!earliest || urlMatch.index < earliest.index)) {
            earliest = {
                index: urlMatch.index,
                length: urlMatch[0].length,
                token: { type: 'link', content: urlMatch[0], href: urlMatch[0] },
            };
        }

        if (!earliest) {
            if (remaining.length > 0) tokens.push({ type: 'text', content: remaining });
            break;
        }

        if (earliest.index > 0) {
            tokens.push({ type: 'text', content: remaining.slice(0, earliest.index) });
        }
        tokens.push(earliest.token);
        remaining = remaining.slice(earliest.index + earliest.length);
    }

    return tokens;
}