import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
const nativeFetch = window.fetch.bind(window);
const API_HOST = window.location.hostname.includes('web.app') || window.location.hostname.includes('firebaseapp.com')
  ? 'https://listifycraft.onrender.com'
  : '';

window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  let url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
  if (url.startsWith('/api')) {
    url = `${API_HOST}${url}`;
  }
  const token = localStorage.getItem("fr_session_token");
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return nativeFetch(url, { ...init, headers });
}) as typeof window.fetch;


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
