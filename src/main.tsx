import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
const nativeFetch = window.fetch.bind(window);
window.fetch = ((input: RequestInfo | URL, init: RequestInit = {}) => {
  const token = localStorage.getItem("fr_session_token");
  const headers = new Headers(init.headers || {});
  if (token && !headers.has("Authorization")) headers.set("Authorization", `Bearer ${token}`);
  return nativeFetch(input, { ...init, headers });
}) as typeof window.fetch;


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
