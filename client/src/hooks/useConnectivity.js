import { useEffect, useState } from 'react';
import { getOfflineQueueCount, subscribeOfflineQueue } from '../lib/api.js';

const API_URL = import.meta.env.VITE_API_URL;
const SPEED_TEST_BYTES = 256 * 1024;
const SPEED_REFRESH_MS = 5000;

function getConnectionMeta() {
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  return {
    online: navigator.onLine,
    effectiveType: connection?.effectiveType || '',
    downlink: connection?.downlink || 0
  };
}

export function useConnectivity() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [effectiveType, setEffectiveType] = useState(() => getConnectionMeta().effectiveType);
  const [downlink, setDownlink] = useState(() => getConnectionMeta().downlink);
  const [speedMbps, setSpeedMbps] = useState(0);
  const [queueCount, setQueueCount] = useState(() => getOfflineQueueCount());

  useEffect(() => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const updateMeta = () => {
      const next = getConnectionMeta();
      setOnline(next.online);
      setEffectiveType(next.effectiveType);
      setDownlink(next.downlink);
    };

    const unsubscribeQueue = subscribeOfflineQueue((count) => setQueueCount(count));

    window.addEventListener('online', updateMeta);
    window.addEventListener('offline', updateMeta);
    document.addEventListener('visibilitychange', updateMeta);
    connection?.addEventListener?.('change', updateMeta);

    return () => {
      unsubscribeQueue();
      window.removeEventListener('online', updateMeta);
      window.removeEventListener('offline', updateMeta);
      document.removeEventListener('visibilitychange', updateMeta);
      connection?.removeEventListener?.('change', updateMeta);
    };
  }, []);

  useEffect(() => {
    if (!online) {
      setSpeedMbps(0);
      return;
    }

    let cancelled = false;

    const measureSpeed = async () => {
      const startedAt = performance.now();
      try {
        const res = await fetch(`${API_URL}/speed-test?size=${SPEED_TEST_BYTES}&t=${Date.now()}`, {
          cache: 'no-store'
        });
        const blob = await res.blob();
        const durationSeconds = Math.max((performance.now() - startedAt) / 1000, 0.05);
        const bytes = Number(res.headers.get('content-length') || blob.size || SPEED_TEST_BYTES);
        const mbps = (bytes * 8) / durationSeconds / 1000000;
        if (!cancelled) setSpeedMbps(mbps);
      } catch {
        if (!cancelled) setSpeedMbps(0);
      }
    };

    measureSpeed();
    const interval = window.setInterval(measureSpeed, SPEED_REFRESH_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [online]);

  return { online, effectiveType, downlink, speedMbps, queueCount };
}
