import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/dashboard.css';
import './styles/components.css';
import { App } from './components/App';
import { applyUrlStateToStorage } from './lib/urlState';

// Hydrate localStorage from `?d=…` *before* React mounts so the layout
// + tile-settings hooks see the URL-encoded state on their first read.
// Falls back silently to whatever's already in localStorage if the URL
// param is absent or malformed.
applyUrlStateToStorage();

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
