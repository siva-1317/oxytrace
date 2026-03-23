import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiJson, getCachedData } from '../lib/api';

const STOCK_OVERVIEW_CACHE_KEY = '/api/stock/overview';

export function useStockOverview() {
  const { accessToken } = useAuth();
  const [data, setData] = useState(() => getCachedData(STOCK_OVERVIEW_CACHE_KEY));
  const [loading, setLoading] = useState(() => !getCachedData(STOCK_OVERVIEW_CACHE_KEY));
  const [error, setError] = useState(null);

  const fetchOverview = async () => {
    if (!accessToken) return;
    if (!getCachedData(STOCK_OVERVIEW_CACHE_KEY)) setLoading(true);
    setError(null);
    try {
      const result = await apiJson('/api/stock/overview', {
        token: accessToken,
        cacheKey: STOCK_OVERVIEW_CACHE_KEY
      });
      setData(result);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, [accessToken]);

  return { data, loading, error, refetch: fetchOverview };
}
