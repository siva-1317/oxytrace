import { useCallback, useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiJson, getCachedData, subscribeDataRefresh } from '../lib/api';

const STOCK_OVERVIEW_CACHE_KEY = '/api/stock/overview';

export function useStockOverview() {
  const { accessToken } = useAuth();
  const [data, setData] = useState(() => getCachedData(STOCK_OVERVIEW_CACHE_KEY));
  const [loading, setLoading] = useState(() => !getCachedData(STOCK_OVERVIEW_CACHE_KEY));
  const [error, setError] = useState(null);

  const fetchOverview = useCallback(async () => {
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
  }, [accessToken]);

  useEffect(() => {
    fetchOverview();
    const timer = setInterval(fetchOverview, 30000);
    return () => clearInterval(timer);
  }, [fetchOverview]);

  useEffect(() => {
    const unsubscribe = subscribeDataRefresh(({ tags }) => {
      if (tags.some((tag) => ['stock', 'dashboard'].includes(tag))) {
        fetchOverview();
      }
    });
    return unsubscribe;
  }, [fetchOverview]);

  return { data, loading, error, refetch: fetchOverview };
}
