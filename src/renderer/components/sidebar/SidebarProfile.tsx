import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../Avatar';
import StatusPicker from '../StatusPicker';
import { SettingsIcon } from '../icons';
import { useUsersStore } from '../../hooks/useUsersStore';
import useAuthStore, {PresenceStatus} from "@/hooks/useAuthStore";

interface SidebarProfileProps {
    userId?: string;
    displayName?: string;
    handle?: string;
    currentStatus?: string;
}

const normalizeStatus = (status?: string): PresenceStatus => {
    const normalized = (status || '').toLowerCase();

    if (normalized === 'busy') return 'dnd';
    if (normalized === 'invisible') return 'offline';

    if (
        normalized === 'online' ||
        normalized === 'away' ||
        normalized === 'idle' ||
        normalized === 'dnd' ||
        normalized === 'offline'
    ) {
        return normalized;
    }

    return 'online';
};

const STATUS_LABELS: Record<PresenceStatus, string> = {
    online: 'Online',
    away: 'Away',
    idle: 'Idle',
    dnd: 'Do Not Disturb',
    offline: 'Invisible',
};

const SidebarProfile: React.FC<SidebarProfileProps> = ({
                                                           userId,
                                                           displayName,
                                                           handle,
                                                           currentStatus,
                                                       }) => {
    const navigate = useNavigate();
    const { user, setUserStatus } = useAuthStore();
    const setCachedUser = useUsersStore((s) => s.setUser);

    const resolvedUserId = userId ?? user?.id;
    const resolvedDisplayName =
        displayName ?? user?.displayName ?? handle ?? user?.handle ?? 'User';
    const resolvedHandle = handle ?? user?.handle ?? '';

    const displayStatus = normalizeStatus(currentStatus ?? user?.status);
    const pickerStatus = normalizeStatus(user?.statusPreference ?? displayStatus);

    const shownStatus =
        displayStatus === 'away'
            ? displayStatus
            : pickerStatus;

    const handleStatusChange = useCallback(
        async (status: PresenceStatus) => {
            const currentUser = useAuthStore.getState().user;
            const previousStatus = normalizeStatus(
                currentUser?.statusPreference ?? currentUser?.status
            );

            if (status === previousStatus) {
                return;
            }

            const apiStatus: PresenceStatus = status === 'idle' ? 'away' : status;

            setUserStatus(status);

            if (resolvedUserId) {
                setCachedUser({
                    id: resolvedUserId,
                    status,
                    statusPreference: status,
                } as any);
            }

            try {
                await window.concord.updateStatus(apiStatus);
            } catch (err) {
                console.error('Failed to update status:', err);
                setUserStatus(previousStatus);

                if (resolvedUserId) {
                    setCachedUser({
                        id: resolvedUserId,
                        status: previousStatus,
                        statusPreference: previousStatus,
                    } as any);
                }
            }
        },
        [resolvedUserId, setCachedUser, setUserStatus]
    );

    return (
        <div className="relative z-20 flex-shrink-0 border-t border-gray-200 bg-gray-50/95 p-2 backdrop-blur-xl dark:border-dark-700 dark:bg-dark-900/95">
            <div className="flex items-center gap-1 rounded-xl bg-white/80 p-1 shadow-sm ring-1 ring-gray-200/70 dark:bg-[#232428] dark:ring-dark-700">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2">
                    <Avatar
                        userId={resolvedUserId}
                        name={resolvedDisplayName}
                        status={shownStatus}
                        size="md"
                        showStatus
                    />

                    <div className="min-w-0 flex-1 leading-tight">
                        <div
                            className="truncate text-sm font-semibold text-gray-900 dark:text-white"
                            title={resolvedDisplayName}
                        >
                            {resolvedDisplayName}
                        </div>

                        <div
                            className="truncate text-xs text-gray-500 dark:text-dark-400"
                            title={resolvedHandle ? `@${resolvedHandle}` : STATUS_LABELS[shownStatus]}
                        >
                            {resolvedHandle ? `@${resolvedHandle}` : STATUS_LABELS[shownStatus]}
                        </div>
                    </div>
                </div>

                <StatusPicker
                    currentStatus={pickerStatus}
                    onSelect={handleStatusChange}
                    compact
                    menuSide="top"
                />

                <button
                    type="button"
                    onClick={() => navigate('/settings')}
                    title="Settings"
                    aria-label="Open settings"
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-black/5 hover:text-gray-900 dark:text-dark-300 dark:hover:bg-white/5 dark:hover:text-white"
                >
                    <SettingsIcon size="sm" className="text-current" />
                </button>
            </div>
        </div>
    );
};

export default SidebarProfile;