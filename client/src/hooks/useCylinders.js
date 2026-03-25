import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson, getCachedData, setCachedData } from '../lib/api.js';
import { normalizeTelemetryRow } from '../lib/telemetry.js';
import { mergeCylinderLiveReading } from '../lib/cylinderLive.js';
import { useRealtime } from './useRealtime.js';

const CYLINDERS_CACHE_KEY = '/api/cylinders';

export function useCylinders() {
  const { accessToken } = useAuth();
  const cached = getCachedData(CYLINDERS_CACHE_KEY);
  const [cylinders, setCylinders] = useState(() => cached?.cylinders || []);
  const [loading, setLoading] = useState(() => !cached);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    if (!getCachedData(CYLINDERS_CACHE_KEY)) setLoading(true);
    setError(null);
    try {
      const data = await apiJson('/api/cylinders', {
        token: accessToken,
        cacheKey: CYLINDERS_CACHE_KEY
      });
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
      setCylinders((prev) => {
        const normalizedReading = normalizeTelemetryRow(reading);
        const readingDeviceId = normalizedReading?.device_id || normalizedReading?.esp32_device_id || null;
        const matchedCylinder = prev.find(
          (c) => c.id === reading.cylinder_id || c.device_id === readingDeviceId
        );
        console.debug('[useCylinders] incoming telemetry for card update', {
          reading: normalizedReading,
          readingDeviceId,
          matchedCylinderId: matchedCylinder?.id || null,
          matchedCylinderName: matchedCylinder?.cylinder_name || null
        });

        const next = prev.map((c) =>
          c.id === reading.cylinder_id || c.device_id === readingDeviceId
            ? {
                ...mergeCylinderLiveReading(c, normalizedReading),
                _livePulseAt: Date.now()
              }
            : c
        );
        setCachedData(CYLINDERS_CACHE_KEY, { cylinders: next });
        return next;
      });
    },
    (alert) => {
      toast(`New alert: ${alert.alert_type}`);
      setCylinders((prev) => {
        const next = prev.map((c) =>
          c.id === alert.cylinder_id || c.esp32_device_id === alert.esp32_device_id ? { ...c, _hasAlert: true } : c
        );
        setCachedData(CYLINDERS_CACHE_KEY, { cylinders: next });
        return next;
      });
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
