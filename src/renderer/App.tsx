import React from 'react';
import { useAuthStore } from './hooks/useAuthStore';
import Login from './pages/Login';
import Home from './pages/Home';

const App: React.FC = () => {
    const { isAuthenticated } = useAuthStore();

    return isAuthenticated ? <Home /> : <Login />;
};

export default App;