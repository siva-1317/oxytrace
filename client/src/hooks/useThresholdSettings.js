import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson } from '../lib/api.js';

const DEFAULT_THRESHOLDS = {
  low_gas_pct: 20,
  danger_gas_pct: 10,
  leak_warn_ppm: 120,
  leak_danger_ppm: 200,
  low_weight_kg: 10,
  danger_weight_kg: 5
};

export function useThresholdSettings() {
  const { accessToken } = useAuth();
  const [thresholds, setThresholds] = useState(DEFAULT_THRESHOLDS);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await apiJson('/api/settings/thresholds', { token: accessToken });
        if (!cancelled && res?.thresholds) setThresholds((prev) => ({ ...prev, ...res.thresholds }));
      } catch {
        // keep defaults if settings are unavailable
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return thresholds;
}
