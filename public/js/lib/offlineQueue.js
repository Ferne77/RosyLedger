import { api, getToken } from './api.js';
import { toast } from './dom.js';

const DB_NAME = 'rosyledger-offline';
const STORE = 'drafts';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'clientId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function queueDraft(record) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

export async function listDrafts() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeDraft(clientId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(clientId);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export async function flushDrafts() {
  if (!getToken()) return 0;
  const drafts = await listDrafts();
  if (!drafts.length || !navigator.onLine) return 0;
  try {
    await api('/api/expenses/sync', { method: 'POST', body: { items: drafts } });
    await Promise.all(drafts.map((d) => removeDraft(d.clientId)));
    toast(`Synced ${drafts.length} offline draft(s)`);
    return drafts.length;
  } catch (err) {
    toast(err.message);
    return 0;
  }
}

export function makeClientId() {
  return `offline-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function registerOfflineSync() {
  window.addEventListener('online', () => flushDrafts());
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}
