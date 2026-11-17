import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const originalfetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  let rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  try {
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    
    // Grab token from anywhere it might be stored
    let token = localStorage.getItem('access_token') || localStorage.getItem('token') || localStorage.getItem('jwt_access');
    if (!token) {
      const rbac = localStorage.getItem('rbac_user');
      if (rbac) {
        try {
          const parsed = JSON.parse(rbac);
          token = parsed?.access || parsed?.token || parsed?.access_token;
        } catch {}
      }
    }
    
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const unitId = localStorage.getItem('active_unit_id');
    if (unitId && unitId !== 'all' && unitId !== 'undefined' && unitId !== 'null') {
      if (!headers.has('X-Unit-Id')) headers.set('X-Unit-Id', unitId);
      if (rawUrl.includes('/api/') && !rawUrl.includes('unit_id=')) {
        rawUrl += (rawUrl.includes('?') ? '&' : '?') + `unit_id=${encodeURIComponent(unitId)}`;
      }
    }

    if (typeof input === 'string' || input instanceof URL) {
      return originalfetch(rawUrl, { ...init, headers });
    }
    return originalfetch(new Request(rawUrl, input), init);
  } catch {
    return originalfetch(input, init);
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
