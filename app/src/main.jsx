import React from 'react';
import { createRoot } from 'react-dom/client';
import Shell from './Shell.jsx';
import './styles.css';

/* global __TARGET__ */
createRoot(document.getElementById('root')).render(<Shell />);

// Offline support + fast reopen for the installed app (GitHub Pages build only)
if (__TARGET__ === 'pages' && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').catch(() => {}); });
}
