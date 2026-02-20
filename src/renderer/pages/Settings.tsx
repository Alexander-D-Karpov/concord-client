import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSettingsStore } from '../hooks/useSettingsStore';
import { useAuthStore } from '../hooks/useAuthStore';
import { useNotificationStore } from '../hooks/useNotificationStore';
import SoundSettings from '../components/SoundSettings';
import AvatarUpload from "@/components/AvatarUpload";
import AvatarHistoryModal from "@/components/AvatarHistoryModal";

const Settings: React.FC = () => {
    const navigate = useNavigate();
    const { settings, updateSettings, resetSettings } = useSettingsStore();
    const { user, logout } = useAuthStore();
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [profileForm, setProfileForm] = useState({
        displayName: user?.displayName || '',
        bio: '',
    });
    const [saving, setSaving] = useState(false);
    const [showAvatarHistory, setShowAvatarHistory] = useState(false);
    const { settings: notifSettings, updateSettings: updateNotifSettings } = useNotificationStore();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const handleReset = () => {
        resetSettings();
        setShowResetConfirm(false);
    };

    const handleSaveProfile = async () => {
        setSaving(true);
        try {
            await window.concord.updateProfile(
                profileForm.displayName,
                undefined,
                profileForm.bio
            );
        } catch (err) {
            console.error('Failed to save profile:', err);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex-1 bg-dark-900 h-screen overflow-y-auto">
            <div className="max-w-4xl mx-auto p-4 sm:p-8">
                <div className="mb-8">
                    <button
                        onClick={() => navigate('/')}
                        className="flex items-center text-dark-400 hover:text-white transition mb-4"
                    >
                        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                        Back to Home
                    </button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Settings</h1>
                    <p className="text-dark-400 mt-2">Customize your Concord experience</p>
                </div>

                <div className="space-y-6">
                    <div className="bg-dark-800 rounded-lg p-4 sm:p-6 border border-dark-700">
                        <h2 className="text-xl font-semibold text-white mb-4">Profile</h2>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between mb-4">
                                <AvatarUpload />
                                {user?.id && (
                                    <button
                                        onClick={() => setShowAvatarHistory(true)}
                                        className="text-sm text-primary-400 hover:text-primary-300 transition"
                                    >
                                        View avatar history
                                    </button>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-dark-300 mb-2">
                                    Display Name
                                </label>
                                <input
                                    type="text"
                                    value={profileForm.displayName}
                                    onChange={(e) => setProfileForm(prev => ({ ...prev, displayName: e.target.value }))}
                                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Your display name"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-dark-300 mb-2">
                                    Bio
                                </label>
                                <textarea
                                    value={profileForm.bio}
                                    onChange={(e) => setProfileForm(prev => ({ ...prev, bio: e.target.value }))}
                                    rows={3}
                                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="Tell us about yourself..."
                                />
                            </div>
                            <button
                                onClick={handleSaveProfile}
                                disabled={saving}
                                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-dark-600 text-white rounded-lg transition"
                            >
                                {saving ? 'Saving...' : 'Save Profile'}
                            </button>
                        </div>
                    </div>

                    <div className="bg-dark-800 rounded-lg p-4 sm:p-6 border border-dark-700">
                        <h2 className="text-xl font-semibold text-white mb-4">Connection</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-dark-300 mb-2">
                                    Server Address
                                </label>
                                <input
                                    type="text"
                                    value={settings.serverAddress}
                                    onChange={(e) => updateSettings({ serverAddress: e.target.value })}
                                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white placeholder-dark-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                                    placeholder="localhost:9090"
                                />
                                <p className="text-xs text-dark-500 mt-1">
                                    The address of your Concord server (requires restart)
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-dark-800 rounded-lg p-4 sm:p-6 border border-dark-700">
                        <h2 className="text-xl font-semibold text-white mb-4">Appearance</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-dark-300 mb-2">
                                    Theme
                                </label>
                                <select
                                    value={settings.theme}
                                    onChange={(e) => updateSettings({ theme: e.target.value as any })}
                                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="dark">Dark</option>
                                    <option value="light">Light</option>
                                    <option value="auto">Auto (System)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-dark-300 mb-2">
                                    Font Size
                                </label>
                                <select
                                    value={settings.fontSize}
                                    onChange={(e) => updateSettings({ fontSize: e.target.value as any })}
                                    className="w-full px-4 py-2 bg-dark-700 border border-dark-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                                >
                                    <option value="small">Small</option>
                                    <option value="medium">Medium</option>
                                    <option value="large">Large</option>
                                </select>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-white">Compact Mode</div>
                                    <div className="text-sm text-dark-400">Reduce spacing between messages</div>
                                </div>
                                <button
                                    onClick={() => updateSettings({ compactMode: !settings.compactMode })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                        settings.compactMode ? 'bg-primary-600' : 'bg-dark-600'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                            settings.compactMode ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>

                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-white">Show Member List</div>
                                    <div className="text-sm text-dark-400">Display member list in chat</div>
                                </div>
                                <button
                                    onClick={() => updateSettings({ showMemberList: !settings.showMemberList })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                        settings.showMemberList ? 'bg-primary-600' : 'bg-dark-600'
                                    }`}
                                >
                                    <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                            settings.showMemberList ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="bg-dark-800 rounded-lg p-4 sm:p-6 border border-dark-700">
                        <h2 className="text-xl font-semibold text-white mb-4">Notifications</h2>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="font-medium text-white">Enable Notifications</div>
                                    <div className="text-sm text-dark-400">Master toggle for all notifications</div>
                                </div>
                                <button
                                    onClick={() => updateNotifSettings({ enabled: !notifSettings.enabled })}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                        notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                    }`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                        notifSettings.enabled ? 'translate-x-6' : 'translate-x-1'
                                    }`} />
                                </button>
                            </div>

                            <div className="border-t border-dark-700 pt-4">
                                <h3 className="text-sm font-medium text-dark-300 mb-3">Room Messages</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white">Sound</span>
                                        <button
                                            onClick={() => updateNotifSettings({ sound: !notifSettings.sound })}
                                            disabled={!notifSettings.enabled}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                                notifSettings.sound && notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                            } ${!notifSettings.enabled ? 'opacity-50' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                notifSettings.sound ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-white">Toast Popup</span>
                                        <button
                                            onClick={() => updateNotifSettings({ toast: !notifSettings.toast })}
                                            disabled={!notifSettings.enabled}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                                notifSettings.toast && notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                            } ${!notifSettings.enabled ? 'opacity-50' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                notifSettings.toast ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-white">Desktop Notification</span>
                                        <button
                                            onClick={() => updateNotifSettings({ native: !notifSettings.native })}
                                            disabled={!notifSettings.enabled}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                                notifSettings.native && notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                            } ${!notifSettings.enabled ? 'opacity-50' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                notifSettings.native ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-white">Mentions Only</span>
                                        <button
                                            onClick={() => updateNotifSettings({ mentionsOnly: !notifSettings.mentionsOnly })}
                                            disabled={!notifSettings.enabled}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                                notifSettings.mentionsOnly && notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                            } ${!notifSettings.enabled ? 'opacity-50' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                notifSettings.mentionsOnly ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-dark-700 pt-4">
                                <h3 className="text-sm font-medium text-dark-300 mb-3">Direct Messages</h3>
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-white">Sound</span>
                                        <button
                                            onClick={() => updateNotifSettings({ dmSound: !notifSettings.dmSound })}
                                            disabled={!notifSettings.enabled}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                                notifSettings.dmSound && notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                            } ${!notifSettings.enabled ? 'opacity-50' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                notifSettings.dmSound ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-white">Toast Popup</span>
                                        <button
                                            onClick={() => updateNotifSettings({ dmToast: !notifSettings.dmToast })}
                                            disabled={!notifSettings.enabled}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                                notifSettings.dmToast && notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                            } ${!notifSettings.enabled ? 'opacity-50' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                notifSettings.dmToast ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-white">Desktop Notification</span>
                                        <button
                                            onClick={() => updateNotifSettings({ dmNative: !notifSettings.dmNative })}
                                            disabled={!notifSettings.enabled}
                                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                                                notifSettings.dmNative && notifSettings.enabled ? 'bg-primary-600' : 'bg-dark-600'
                                            } ${!notifSettings.enabled ? 'opacity-50' : ''}`}
                                        >
                                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                                                notifSettings.dmNative ? 'translate-x-6' : 'translate-x-1'
                                            }`} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="bg-dark-800 rounded-lg p-4 sm:p-6 border border-dark-700">
                        <h2 className="text-xl font-semibold text-white mb-4">Notification Sounds</h2>
                        <SoundSettings />
                    </div>

                    <div className="bg-dark-800 rounded-lg p-4 sm:p-6 border border-dark-700">
                        <h2 className="text-xl font-semibold text-white mb-4">Account</h2>
                        <div className="space-y-4">
                            <button
                                onClick={handleLogout}
                                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg transition"
                            >
                                Logout
                            </button>
                        </div>
                    </div>

                    <div className="bg-dark-800 rounded-lg p-4 sm:p-6 border border-dark-700">
                        <h2 className="text-xl font-semibold text-white mb-4">Danger Zone</h2>
                        <div className="space-y-4">
                            <button
                                onClick={() => setShowResetConfirm(true)}
                                className="w-full px-4 py-2 bg-dark-700 hover:bg-dark-600 text-red-400 font-semibold rounded-lg transition border border-red-600"
                            >
                                Reset All Settings
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            {showAvatarHistory && user?.id && (
                <AvatarHistoryModal
                    userId={user.id}
                    displayName={user.displayName || user.handle || 'You'}
                    onClose={() => setShowAvatarHistory(false)}
                />
            )}
            {showResetConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-dark-800 p-6 rounded-lg w-full max-w-md border border-dark-700">
                        <h3 className="text-white text-lg font-semibold mb-4">Reset Settings?</h3>
                        <p className="text-dark-400 mb-6">
                            This will reset all settings to their default values. This action cannot be undone.
                        </p>
                        <div className="flex space-x-2">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="flex-1 px-4 py-2 bg-dark-700 hover:bg-dark-600 text-white rounded-lg transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReset}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Settings;