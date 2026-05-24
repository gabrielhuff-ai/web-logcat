import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/dashboard.css';
import './styles/components.css';
import { App } from './components/App';
import {
  clearShareFromUrl,
  decodeSnapshot,
  readShareFromUrl,
  stashPendingImport,
} from './lib/dashboardShare';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

// If the URL carries a `#share=…` payload (a copied dashboard link),
// decode and stash it so the dashboard applies it once a device is
// connected (the per-tile settings need the recipient's serial). Normal
// loads have no fragment and skip straight to render.
async function boot() {
  const share = readShareFromUrl();
  if (share) {
    const snapshot = await decodeSnapshot(share);
    clearShareFromUrl();
    if (snapshot) stashPendingImport(snapshot);
  }
  createRoot(rootEl!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
