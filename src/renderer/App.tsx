import React, { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import Settings from './pages/Settings';
import { useAuthStore } from './hooks/useAuthStore';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isAuthenticated } = useAuthStore();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <>{children}</>;
};

const App: React.FC = () => {
    const { startTokenRefresh, tokens } = useAuthStore();

    useEffect(() => {
        if (tokens) {
            startTokenRefresh();
        }
    }, [tokens, startTokenRefresh]);

    return (
        <HashRouter>
            <Routes>
                <Route path="/login" element={<Login />} />
                <Route
                    path="/"
                    element={
                        <ProtectedRoute>
                            <Home />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="/settings"
                    element={
                        <ProtectedRoute>
                            <Settings />
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </HashRouter>
    );
};

export default App;