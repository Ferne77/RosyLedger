import { getToken } from './api.js';
import { refreshVisibleViews } from './viewRefresh.js';

const INTERNET_PROBE_URL = 'https://www.gstatic.com/generate_204';
const STREAM_STALE_MS = 45000;
const PROBE_TIMEOUT_MS = 5000;
const MONITOR_INTERVAL_MS = 12000;

let _source = null;
let _reconnectTimer = null;
let _monitorTimer = null;
let _reconnectAttempt = 0;
let _wired = false;
let _lastStreamAt = 0;
let _internetOk = false;
let _serverOk = false;
let _evaluating = false;

const LIVE_COPY = {
  connecting: {
    label: 'Connecting',
    title: 'Connecting to realtime updates…'
  },
  live: {
    label: 'Live',
    title: 'Online and connected — dashboard updates automatically'
  },
  offline: {
    label: 'Offline',
    title: 'No usable network — showing last loaded data'
  },
  reconnecting: {
    label: 'Reconnecting',
    title: 'Network or live stream interrupted — retrying'
  }
};

function setLiveState(state) {
  const pill = document.getElementById('live-pill');
  if (!pill) return;

  if (state === 'hidden') {
    pill.hidden = true;
    pill.removeAttribute('data-state');
    pill.removeAttribute('title');
    return;
  }

  const copy = LIVE_COPY[state] || LIVE_COPY.offline;
  pill.hidden = false;
  pill.dataset.state = state;
  pill.textContent = copy.label;
  pill.title = copy.title;
}

function closeSource() {
  if (_source) {
    _source.close();
    _source = null;
  }
}

function clearReconnectTimer() {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = null;
}

function scheduleReconnect() {
  clearReconnectTimer();
  if (!getToken()) return;

  const delay = Math.min(30000, 1000 * 2 ** Math.min(_reconnectAttempt, 5));
  _reconnectTimer = setTimeout(() => {
    _reconnectTimer = null;
    connectStream();
  }, delay);
}

function streamIsFresh() {
  return _lastStreamAt > 0 && Date.now() - _lastStreamAt < STREAM_STALE_MS;
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function checkInternetReachable() {
  if (!navigator.onLine) return false;
  try {
    await fetchWithTimeout(INTERNET_PROBE_URL, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store'
    });
    return true;
  } catch {
    return false;
  }
}

async function checkServerReachable() {
  try {
    const res = await fetchWithTimeout('/api/health', { cache: 'no-store' });
    return res.ok;
  } catch {
    return false;
  }
}

async function refreshNetworkFlags() {
  _internetOk = await checkInternetReachable();
  _serverOk = _internetOk ? await checkServerReachable() : false;
  return _internetOk && _serverOk;
}

function resolveLiveState() {
  if (!getToken()) return 'hidden';
  if (!navigator.onLine || !_internetOk) return 'offline';
  if (!_serverOk) return 'reconnecting';
  if (!_source || _source.readyState !== EventSource.OPEN) {
    return _reconnectAttempt > 0 ? 'reconnecting' : 'connecting';
  }
  if (!streamIsFresh()) return 'reconnecting';
  return 'live';
}

async function evaluateConnectionState() {
  if (!getToken()) {
    setLiveState('hidden');
    return;
  }
  if (_evaluating) return;
  _evaluating = true;

  try {
    await refreshNetworkFlags();
    const state = resolveLiveState();
    setLiveState(state);

    if (state === 'offline') {
      clearReconnectTimer();
      closeSource();
      return;
    }

    if (!_internetOk || !_serverOk) {
      closeSource();
      scheduleReconnect();
      return;
    }

    if (!_source || _source.readyState === EventSource.CLOSED) {
      if (!_reconnectTimer) connectStream();
      return;
    }

    if (_source.readyState === EventSource.OPEN && !streamIsFresh()) {
      closeSource();
      _reconnectAttempt += 1;
      setLiveState('reconnecting');
      scheduleReconnect();
    }
  } finally {
    _evaluating = false;
  }
}

async function handleStreamEvent(event) {
  if (!event.data) return;
  try {
    const payload = JSON.parse(event.data);
    if (payload.type === 'ping') {
      _lastStreamAt = Date.now();
      setLiveState(resolveLiveState());
      return;
    }
    if (payload.type !== 'refresh') return;

    _lastStreamAt = Date.now();
    await refreshVisibleViews({ scope: payload.scope || 'all' });
    setLiveState(resolveLiveState());
  } catch (_err) {
    /* ignore malformed events */
  }
}

function connectStream() {
  clearReconnectTimer();
  closeSource();

  const token = getToken();
  if (!token) {
    setLiveState('hidden');
    return;
  }

  if (!navigator.onLine || !_internetOk || !_serverOk) {
    setLiveState(!navigator.onLine || !_internetOk ? 'offline' : 'reconnecting');
    scheduleReconnect();
    return;
  }

  setLiveState(_reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

  _source = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`);

  _source.onopen = () => {
    _reconnectAttempt = 0;
    _lastStreamAt = Date.now();
    setLiveState(resolveLiveState());
  };

  _source.onmessage = handleStreamEvent;

  _source.onerror = () => {
    closeSource();
    _reconnectAttempt += 1;
    setLiveState(resolveLiveState());
    scheduleReconnect();
  };
}

function startMonitor() {
  clearInterval(_monitorTimer);
  _monitorTimer = setInterval(() => {
    evaluateConnectionState();
  }, MONITOR_INTERVAL_MS);
}

function wireNetworkListeners() {
  if (_wired) return;
  _wired = true;

  window.addEventListener('online', () => {
    _reconnectAttempt = 0;
    evaluateConnectionState().then(() => connectStream());
  });

  window.addEventListener('offline', () => {
    _internetOk = false;
    _serverOk = false;
    clearReconnectTimer();
    closeSource();
    setLiveState('offline');
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) evaluateConnectionState();
  });
}

export async function startRealtime() {
  wireNetworkListeners();
  _reconnectAttempt = 0;
  await evaluateConnectionState();
  if (_internetOk && _serverOk) connectStream();
  else scheduleReconnect();
  startMonitor();
}

export function stopRealtime() {
  clearReconnectTimer();
  clearInterval(_monitorTimer);
  _monitorTimer = null;
  _reconnectAttempt = 0;
  _lastStreamAt = 0;
  _internetOk = false;
  _serverOk = false;
  closeSource();
  setLiveState('hidden');
}
