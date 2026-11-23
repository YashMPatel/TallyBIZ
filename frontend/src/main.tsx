import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import axios from 'axios'

let isRedirectingToLogin = false;

const handleSessionExpired = () => {
  if (isRedirectingToLogin) return;
  isRedirectingToLogin = true;
  ['access_token', 'refresh_token', 'token', 'jwt_access', 'rbac_user', 'user'].forEach((k) => {
    try { localStorage.removeItem(k); } catch {}
  });
  window.location.reload();
};

const originalFetch = window.fetch.bind(window);
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

    const response = (typeof input === 'string' || input instanceof URL)
      ? await originalFetch(rawUrl, { ...init, headers })
      : await originalFetch(new Request(rawUrl, input), init);

    // Only a rejected token means the session expired; a tokenless 401 (login screen) must not reload.
    if (
      token &&
      response.status === 401 &&
      rawUrl.includes('/api/') &&
      !rawUrl.includes('/auth/login') &&
      !rawUrl.includes('/auth/register')
    ) {
      handleSessionExpired();
    }

    return response;
  } catch {
    return originalFetch(input, init);
  }
};

// axios bypasses the fetch wrapper above; give it the same token and expiry handling.
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token') || localStorage.getItem('token');
  if (token && !config.headers.Authorization) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
axios.interceptors.response.use(undefined, (error) => {
  if (error?.response?.status === 401 && error.config?.headers?.Authorization) handleSessionExpired();
  return Promise.reject(error);
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
