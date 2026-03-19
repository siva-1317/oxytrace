import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import { useRealtime } from './useRealtime.js';

const API_URL = import.meta.env.VITE_API_URL;

export async function apiFetch(path, { token, method = 'GET', body, extraHeaders } = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(extraHeaders || {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export function useCylinders() {
  const { accessToken } = useAuth();
  const [cylinders, setCylinders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/cylinders', { token: accessToken });
      setCylinders(data.cylinders || []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useRealtime(
    (reading) => {
      setCylinders((prev) =>
        prev.map((c) =>
          c.esp32_device_id === reading.esp32_device_id
            ? { ...c, latest_reading: reading, _livePulseAt: Date.now() }
            : c
        )
      );
    },
    (alert) => {
      toast(`New alert: ${alert.alert_type}`);
      setCylinders((prev) =>
        prev.map((c) =>
          c.esp32_device_id === alert.esp32_device_id ? { ...c, _hasAlert: true } : c
        )
      );
    }
  );

  const stats = useMemo(() => {
    const total = cylinders.length;
    const active = cylinders.filter((c) => c.is_active).length;
    const avgGas =
      cylinders.length === 0
        ? 0
        : cylinders.reduce((acc, c) => acc + (c.latest_reading?.gas_level_pct ?? 0), 0) /
          cylinders.length;
    const criticalAlerts = cylinders.filter((c) => c._hasAlert).length;
    return { total, active, avgGas, criticalAlerts };
  }, [cylinders]);

  return { cylinders, setCylinders, loading, error, refresh, stats };
}

