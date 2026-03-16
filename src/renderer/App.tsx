import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import Settings from './pages/Settings';
import Friends from './pages/Friends';
import useAuthStore from './hooks/useAuthStore';
import ToastContainer from './components/ToastContainer';
import IncomingCallOverlay from './components/IncomingCallOverlay';
import ErrorBoundary from './components/ErrorBoundary';
import { useDMCallListeners } from './hooks/useDMCallListeners';
import VoiceBar from './components/VoiceBar';
import { useTheme } from './hooks/useTheme';
import { usePresence } from './hooks/usePresence';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuthStore();
    if (!isAuthenticated) return <Navigate to="/login" replace />;
    return <>{children}</>;
};

const App: React.FC = () => {
    const { startTokenRefresh, tokens } = useAuthStore();

    useTheme();
    useDMCallListeners();
    usePresence();

    useEffect(() => {
        if (tokens) startTokenRefresh();
    }, [tokens, startTokenRefresh]);

    return (
        <HashRouter>
            <ErrorBoundary name="App">
                <ToastContainer />
                <IncomingCallOverlay />
                <div className="flex flex-col h-screen overflow-hidden bg-white dark:bg-dark-900">
                    <div className="flex-1 min-h-0 overflow-hidden">
                        <Routes>
                            <Route path="/login" element={<Login />} />
                            <Route path="/" element={
                                <ProtectedRoute>
                                    <ErrorBoundary name="Home"><Home /></ErrorBoundary>
                                </ProtectedRoute>
                            } />
                            <Route path="/friends" element={
                                <ProtectedRoute>
                                    <ErrorBoundary name="Friends"><Friends /></ErrorBoundary>
                                </ProtectedRoute>
                            } />
                            <Route path="/settings" element={
                                <ProtectedRoute>
                                    <ErrorBoundary name="Settings"><Settings /></ErrorBoundary>
                                </ProtectedRoute>
                            } />
                        </Routes>
                    </div>
                    <VoiceBar />
                </div>
            </ErrorBoundary>
        </HashRouter>
    );
};

export default App;