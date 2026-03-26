const API_URL = import.meta.env.VITE_API_URL;

const CACHE_PREFIX = 'oxytrace-cache:';
const QUEUE_KEY = 'oxytrace-offline-queue';
const memoryCache = new Map();
let syncInFlight = false;
const queueListeners = new Set();
const dataRefreshListeners = new Set();

function isOffline() {
  return typeof navigator !== 'undefined' && !navigator.onLine;
}

function buildCacheKey(path, cacheKey) {
  return cacheKey || path;
}

function storageKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

function readStorageJson(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota issues
  }
}

export function getCachedJson(cacheKey) {
  if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey);
  if (!isOffline()) return null;
  const stored = readStorageJson(storageKey(cacheKey));
  if (!stored) return null;
  memoryCache.set(cacheKey, stored);
  return stored;
}

export function getCachedData(cacheKey) {
  return getCachedJson(cacheKey)?.data ?? null;
}

export function setCachedData(cacheKey, data) {
  const payload = { data, updatedAt: Date.now() };
  memoryCache.set(cacheKey, payload);
  if (isOffline()) writeStorageJson(storageKey(cacheKey), payload);
  else {
    try {
      localStorage.removeItem(storageKey(cacheKey));
    } catch {
      // ignore storage issues
    }
  }
  return payload;
}

export function clearCachedData(cacheKey) {
  memoryCache.delete(cacheKey);
  try {
    localStorage.removeItem(storageKey(cacheKey));
  } catch {
    // ignore storage issues
  }
}

export function subscribeDataRefresh(listener) {
  dataRefreshListeners.add(listener);
  return () => dataRefreshListeners.delete(listener);
}

export function notifyDataRefresh(tags = []) {
  const payload = { tags, updatedAt: Date.now() };
  dataRefreshListeners.forEach((listener) => listener(payload));
}

function inferRefreshTags(path) {
  if (path.startsWith('/api/settings')) return ['settings', 'dashboard', 'cylinders', 'stock'];
  if (path.startsWith('/api/refills')) return ['refills', 'dashboard', 'cylinders', 'stock', 'alerts'];
  if (path.startsWith('/api/alerts')) return ['alerts', 'dashboard'];
  if (path.startsWith('/api/cylinders')) return ['cylinders', 'dashboard', 'stock'];
  if (path.startsWith('/api/stock')) return ['stock', 'dashboard'];
  if (path.startsWith('/api/readings')) return ['cylinders', 'dashboard'];
  return [];
}

function getQueue() {
  return readStorageJson(QUEUE_KEY) || [];
}

function setQueue(queue) {
  writeStorageJson(QUEUE_KEY, queue);
  queueListeners.forEach((listener) => listener(queue.length));
}

function enqueueOfflineMutation(entry) {
  const queue = getQueue();
  queue.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    ...entry
  });
  setQueue(queue);
}

async function requestJson(path, { token, method = 'GET', body, headers } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return res;
}

export async function flushOfflineQueue() {
  if (syncInFlight) return;
  if (isOffline()) return;
  const queue = getQueue();
  if (!queue.length) return;

  syncInFlight = true;
  const remaining = [];
  try {
    for (const item of queue) {
      try {
        await requestJson(item.path, {
          token: item.token,
          method: item.method,
          body: item.body,
          headers: item.headers
        });
      } catch (error) {
        if (isOffline()) {
          remaining.push(item);
          continue;
        }
        remaining.push(item);
      }
    }
  } finally {
    setQueue(remaining);
    syncInFlight = false;
  }
}

export function getOfflineQueueCount() {
  return getQueue().length;
}

export function subscribeOfflineQueue(listener) {
  queueListeners.add(listener);
  listener(getOfflineQueueCount());
  return () => queueListeners.delete(listener);
}

export function initializeOfflineSync() {
  if (typeof window === 'undefined') return () => {};
  const handleOnline = () => {
    flushOfflineQueue();
  };
  window.addEventListener('online', handleOnline);
  flushOfflineQueue();
  return () => window.removeEventListener('online', handleOnline);
}

export async function apiJson(path, options = {}) {
  const {
    token,
    method = 'GET',
    body,
    headers,
    cacheKey,
    useCache = method === 'GET',
    queueOffline = false
  } = options;
  const key = buildCacheKey(path, cacheKey);

  if (method === 'GET' && useCache) {
    const cached = getCachedData(key);
    if (cached && isOffline()) return cached;
  }

  try {
    const res = await requestJson(path, { token, method, body, headers });
    const data = await res.json();
    if (method === 'GET' && useCache) setCachedData(key, data);
    if (method !== 'GET') {
      notifyDataRefresh(inferRefreshTags(path));
    }
    return data;
  } catch (error) {
    if (method === 'GET' && useCache) {
      const cached = getCachedData(key);
      if (cached) return cached;
    }

    if (queueOffline && method !== 'GET' && isOffline()) {
      enqueueOfflineMutation({ path, token, method, body, headers });
      return { queued: true, offline: true };
    }

    throw error;
  }
}

export function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleString();
}
