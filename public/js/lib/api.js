/**
 * Thin JSON fetch wrapper for same-origin `/api/*` calls.
 * Throws Error with `.status` and `.payload` when `response.ok` is false.
 */

const TOKEN_KEY = 'rosyledger.token';

/** In-memory copy so requests work immediately after setToken (before any re-read quirks). */
let sessionToken = '';

function readStoredToken() {
  try {
    return (localStorage.getItem(TOKEN_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function getToken() {
  if (sessionToken) return sessionToken;
  const stored = readStoredToken();
  if (stored) sessionToken = stored;
  return sessionToken;
}

export function setToken(token) {
  sessionToken = (token || '').trim();
  try {
    if (sessionToken) localStorage.setItem(TOKEN_KEY, sessionToken);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

function isPublicAuthPath(path) {
  return path === '/api/auth/login' || path === '/api/auth/register';
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  const token = getToken();
  if (body) headers['Content-Type'] = 'application/json';
  if (auth && token && !isPublicAuthPath(path)) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'follow'
  });
  const ct = res.headers.get('content-type') || '';
  const payload = ct.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && auth && !isPublicAuthPath(path)) {
      setToken('');
    }
    const msg = payload?.error || `Request failed (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}
