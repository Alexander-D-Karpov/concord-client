import React, {
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';
import type { PresenceStatus } from '../hooks/useAuthStore';

const VIEWPORT_MARGIN = 8;
const MENU_WIDTH = 288;
const MENU_GAP = 8;

const STATUS_META: Record<
    PresenceStatus,
    { value: PresenceStatus; label: string; description?: string; color: string }
> = {
    online: {
        value: 'online',
        label: 'Online',
        color: 'bg-green-500',
    },
    away: {
        value: 'away',
        label: 'Away',
        description: 'Set automatically after 30 minutes of inactivity',
        color: 'bg-yellow-500',
    },
    idle: {
        value: 'away',
        label: 'Away',
        description: 'Set automatically after 30 minutes of inactivity',
        color: 'bg-yellow-500',
    },
    dnd: {
        value: 'dnd',
        label: 'Do Not Disturb',
        description: 'You will not receive notifications',
        color: 'bg-red-500',
    },
    offline: {
        value: 'offline',
        label: 'Invisible',
        description: 'You will appear offline',
        color: 'bg-gray-500',
    },
};

const MENU_STATUSES: PresenceStatus[] = ['online', 'away', 'dnd', 'offline'];

const normalizeStatus = (status?: string): PresenceStatus => {
    const normalized = (status || '').toLowerCase();

    if (normalized === 'busy') return 'dnd';
    if (normalized === 'invisible') return 'offline';
    if (normalized === 'idle') return 'away';

    if (
        normalized === 'online' ||
        normalized === 'away' ||
        normalized === 'dnd' ||
        normalized === 'offline'
    ) {
        return normalized;
    }

    return 'online';
};

const clamp = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

interface StatusPickerProps {
    currentStatus?: string;
    onSelect: (status: PresenceStatus) => void;
    compact?: boolean;
    menuSide?: 'top' | 'bottom';
}

const StatusPicker: React.FC<StatusPickerProps> = ({
                                                       currentStatus = 'online',
                                                       onSelect,
                                                       compact = false,
                                                       menuSide = 'bottom',
                                                   }) => {
    const [open, setOpen] = useState(false);
    const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({
        position: 'fixed',
        top: 0,
        left: 0,
        width: MENU_WIDTH,
        visibility: 'hidden',
    });

    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const current = useMemo(
        () => STATUS_META[normalizeStatus(currentStatus)],
        [currentStatus]
    );

    useEffect(() => {
        if (!open) return;

        const handleClick = (e: MouseEvent) => {
            const target = e.target as Node;

            if (triggerRef.current?.contains(target)) return;
            if (menuRef.current?.contains(target)) return;

            setOpen(false);
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    useLayoutEffect(() => {
        if (!open) return;

        const updatePosition = () => {
            const trigger = triggerRef.current;
            const menu = menuRef.current;
            if (!trigger || !menu) return;

            const triggerRect = trigger.getBoundingClientRect();
            const menuHeight = menu.offsetHeight;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;

            const width = Math.min(MENU_WIDTH, viewportWidth - VIEWPORT_MARGIN * 2);

            let left = compact
                ? triggerRect.right - width
                : triggerRect.left;

            left = clamp(
                left,
                VIEWPORT_MARGIN,
                viewportWidth - width - VIEWPORT_MARGIN
            );

            const canFitAbove =
                triggerRect.top >= menuHeight + MENU_GAP + VIEWPORT_MARGIN;
            const canFitBelow =
                viewportHeight - triggerRect.bottom >=
                menuHeight + MENU_GAP + VIEWPORT_MARGIN;

            let top: number;

            if (menuSide === 'top') {
                if (canFitAbove) {
                    top = triggerRect.top - menuHeight - MENU_GAP;
                } else if (canFitBelow) {
                    top = triggerRect.bottom + MENU_GAP;
                } else {
                    top = clamp(
                        triggerRect.top - menuHeight - MENU_GAP,
                        VIEWPORT_MARGIN,
                        viewportHeight - menuHeight - VIEWPORT_MARGIN
                    );
                }
            } else {
                if (canFitBelow) {
                    top = triggerRect.bottom + MENU_GAP;
                } else if (canFitAbove) {
                    top = triggerRect.top - menuHeight - MENU_GAP;
                } else {
                    top = clamp(
                        triggerRect.bottom + MENU_GAP,
                        VIEWPORT_MARGIN,
                        viewportHeight - menuHeight - VIEWPORT_MARGIN
                    );
                }
            }

            setMenuStyle({
                position: 'fixed',
                top,
                left,
                width,
                maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
                visibility: 'visible',
                zIndex: 500,
            });
        };

        updatePosition();

        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open, compact, menuSide, currentStatus]);

    const menu =
        open && document.body
            ? createPortal(
                <div
                    ref={menuRef}
                    style={menuStyle}
                    className="overflow-hidden rounded-2xl border border-gray-200 bg-white p-2 shadow-2xl dark:border-dark-600 dark:bg-dark-700"
                >
                    {current.value === 'away' && (
                        <div className="mb-1 rounded-xl px-3 py-2 text-xs text-gray-500 dark:text-dark-400">
                            Away is currently active because this client has been inactive for 30 minutes.
                        </div>
                    )}

                    {MENU_STATUSES.map((status) => {
                        const meta = STATUS_META[status];
                        const selected = current.value === status;

                        return (
                            <button
                                key={status}
                                type="button"
                                onClick={() => {
                                    onSelect(status === 'idle' ? 'away' : status);
                                    setOpen(false);
                                }}
                                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                                    selected
                                        ? 'bg-gray-100 dark:bg-dark-600'
                                        : 'hover:bg-gray-100 dark:hover:bg-dark-600'
                                }`}
                            >
                                  <span
                                      className={`mt-1 h-3 w-3 flex-shrink-0 rounded-full ${meta.color}`}
                                  />
                                <span className="min-w-0 flex-1">
                                      <span className="block text-sm font-medium text-gray-900 dark:text-white">
                                          {meta.label}
                                      </span>
                                    {meta.description && (
                                        <span className="block text-xs text-gray-500 dark:text-dark-400">
                                              {meta.description}
                                          </span>
                                    )}
                                  </span>

                                {selected && (
                                    <svg
                                        className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary-500"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M5 13l4 4L19 7"
                                        />
                                    </svg>
                                )}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )
            : null;

    return (
        <>
            <div className="relative shrink-0">
                <button
                    ref={triggerRef}
                    type="button"
                    onClick={() => setOpen((prev) => !prev)}
                    className={
                        compact
                            ? 'inline-flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition hover:bg-black/5 hover:text-gray-900 dark:text-dark-300 dark:hover:bg-white/5 dark:hover:text-white'
                            : 'inline-flex max-w-full items-center gap-2 rounded-xl bg-gray-100 px-2.5 py-1.5 text-sm text-gray-700 transition hover:bg-gray-200 dark:bg-dark-700 dark:text-dark-200 dark:hover:bg-dark-600'
                    }
                    aria-label="Change status"
                >
                    <span className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${current.color}`} />
                    {!compact && (
                        <span className="truncate font-medium">{current.label}</span>
                    )}
                    <svg
                        className="h-4 w-4 flex-shrink-0 text-gray-400 dark:text-dark-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
            </div>

            {menu}
        </>
    );
};

export default StatusPicker;