import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import App from './App';
import './styles/global.css';

const root = createRoot(document.getElementById('root'));
root.render(
    <Router>
        <App />
    </Router>
);

if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('layout')) {
    import('./components/dev/LayoutEditor.jsx').then(({ default: LayoutEditor }) => {
        const mount = document.createElement('div');
        mount.id = 'layout-editor-root';
        document.body.append(mount);
        createRoot(mount).render(React.createElement(LayoutEditor));
    });
}
