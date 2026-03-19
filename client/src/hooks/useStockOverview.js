import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiJson } from '../lib/api';

export function useStockOverview() {
  const { accessToken } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverview = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await apiJson('/api/stock/overview', { token: accessToken });
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
