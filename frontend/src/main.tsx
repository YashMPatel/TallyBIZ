import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'


// Global Fetch Interceptor to attach RBAC User Headers on every API request
const originalFetch = window.fetch;
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  if (url.includes('/api/')) {
    const headers = new Headers(init?.headers || {});
    try {
      const savedUser = localStorage.getItem('rbac_user');
      if (savedUser) {
        const parsed = JSON.parse(savedUser);
        if (parsed?.id) headers.set('X-User-ID', String(parsed.id));
        if (parsed?.username) headers.set('X-Username', String(parsed.username));
      }
    } catch {
      // ignore storage errors
    }
    return originalFetch(input, { ...init, headers });
  }
  return originalFetch(input, init);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
