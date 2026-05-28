import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/tokens.css';
import './styles/app.css';
import './styles/dashboard.css';
import './styles/components.css';
import { App } from './components/App';
import { ingestShareFromUrl } from './lib/dashboardShare';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('#root element not found');

// Ingest any `#share=…` payload pasted into the URL of an already-running
// tab. The Dashboard's pending-import listener picks the stashed snapshot
// up and surfaces the trust modal (or applies directly when there are no
// scripting panels). Fresh-tab boots are handled by the awaited call below.
window.addEventListener('hashchange', () => {
  void ingestShareFromUrl();
});

// If the URL carries a `#share=…` payload (a fresh tab opened from a
// copied dashboard link), ingest before rendering so the Dashboard sees
// the pending snapshot on its very first mount.
async function boot() {
  await ingestShareFromUrl();
  createRoot(rootEl!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();
