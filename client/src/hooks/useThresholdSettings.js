import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson, subscribeDataRefresh } from '../lib/api.js';

const DEFAULT_THRESHOLDS = {
  low_gas_pct: 20,
  danger_gas_pct: 10,
  leak_warn_ppm: 120,
  leak_danger_ppm: 200,
  low_weight_kg: 10,
  danger_weight_kg: 5,
  low_in_use_cylinders: 2
};

export function useThresholdSettings() {
  const { accessToken } = useAuth();
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  const refresh = useCallback(async () => {
    if (!accessToken) return;
    try {
      const res = await apiJson('/api/settings/thresholds', { token: accessToken });
      if (res?.thresholds) setThresholds((prev) => ({ ...prev, ...res.thresholds }));
    } catch {
      // keep defaults if settings are unavailable
    }
  }, [accessToken]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const unsubscribe = subscribeDataRefresh(({ tags }) => {
      if (tags.some((tag) => ['settings', 'thresholds', 'cylinders', 'dashboard'].includes(tag))) {
        refresh();
      }
    });
    return unsubscribe;
  }, [refresh]);

  return thresholds;
}
