import React from 'react';

interface ConnectionBarsProps {
    quality: number; // 0=unknown, 1=poor, 2=medium, 3=good
    size?: 'sm' | 'md';
}

const ConnectionBars: React.FC<ConnectionBarsProps> = ({ quality, size = 'sm' }) => {
    if (quality === 0) return null;

    const heights = size === 'sm' ? [4, 7, 10] : [6, 10, 14];
    const width = size === 'sm' ? 3 : 4;
    const gap = size === 'sm' ? 1 : 1.5;
    const totalH = heights[2];

    const color =
        quality >= 3 ? '#22c55e' :
            quality === 2 ? '#eab308' :
                '#ef4444';

    const dimColor = 'rgba(255,255,255,0.15)';

    return (
        <svg
            width={width * 3 + gap * 2}
            height={totalH}
            viewBox={`0 0 ${width * 3 + gap * 2} ${totalH}`}
            className="flex-shrink-0"
        >
            {[0, 1, 2].map(i => {
                const h = heights[i];
                const x = i * (width + gap);
                const y = totalH - h;
                const active = i < quality;
                return (
                    <rect
                        key={i}
                        x={x}
                        y={y}
                        width={width}
                        height={h}
                        rx={1}
                        fill={active ? color : dimColor}
                    />
                );
            })}
        </svg>
    );
};

export default ConnectionBars;