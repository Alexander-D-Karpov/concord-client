import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

console.log('Renderer booting…');

try {
    console.log('Clearing notification storage to fix crash...');
    localStorage.removeItem('notification-storage');
} catch (e) {
    console.error('Failed to clear storage', e);
}

const container = document.getElementById('root');
if (!container) {
    throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);