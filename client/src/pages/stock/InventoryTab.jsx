import React, { useEffect, useMemo, useState } from 'react';
import { Package, RefreshCcw, Layers3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../context/AuthContext';
import { apiJson, getCachedData, subscribeDataRefresh } from '../../lib/api';
import { StockTableShell } from '../../components/DashboardPageLoader.jsx';

function StatCard({ icon: Icon, label, value, helper, tone = 'accent' }) {
  const toneMap = {
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
    muted: 'bg-surface text-text'
  };

  return (
    <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
          <div className="mt-2 text-3xl font-bold tracking-tight text-text">{value}</div>
          {helper ? <div className="mt-1 text-xs text-muted">{helper}</div> : null}
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${toneMap[tone] || toneMap.accent}`}>
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

export default function InventoryTab() {
  const { accessToken } = useAuth();
  const inventoryCacheKey = '/api/stock/inventory';
  const [inventory, setInventory] = useState(() => getCachedData(inventoryCacheKey)?.inventory || []);
  const [loading, setLoading] = useState(() => !getCachedData(inventoryCacheKey));

  const fetchInventory = async () => {
    if (!getCachedData(inventoryCacheKey)) setLoading(true);
    try {
      const res = await apiJson('/api/stock/inventory', { token: accessToken, cacheKey: inventoryCacheKey });
      setInventory(res.inventory || []);
    } catch (error) {
      toast.error(error.message || 'Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchInventory();
  }, [accessToken]);

  useEffect(() => {
    const unsubscribe = subscribeDataRefresh(({ tags }) => {
      if (tags.some((tag) => ['stock', 'cylinders', 'refills', 'dashboard'].includes(tag))) {
        fetchInventory();
      }
    });
    return unsubscribe;
  }, [accessToken]);

  const oxygenInventory = useMemo(
    () => inventory.filter((row) => (row.gas_type || 'oxygen') === 'oxygen'),
    [inventory]
  );

  const summary = useMemo(() => {
    return oxygenInventory.reduce(
      (acc, row) => {
        const full = Number(row.quantity_full || 0);
        const empty = Number(row.quantity_empty || 0);
        const inUse = Number(row.quantity_in_use || 0);
        const damaged = Number(row.quantity_damaged || 0);
        acc.full += full;
        acc.empty += empty;
        acc.total += full + empty + inUse + damaged;
        return acc;
      },
      { full: 0, empty: 0, total: 0 }
    );
  }, [oxygenInventory]);

  const typeRows = useMemo(() => {
    return oxygenInventory
      .map((row) => {
        const full = Number(row.quantity_full || 0);
        const empty = Number(row.quantity_empty || 0);
        const inUse = Number(row.quantity_in_use || 0);
        const damaged = Number(row.quantity_damaged || 0);
        return {
          id: row.id,
          cylinder_size: row.cylinder_size,
          full,
          empty,
          total: full + empty + inUse + damaged
        };
      })
      .sort((a, b) => a.cylinder_size.localeCompare(b.cylinder_size));
  }, [oxygenInventory]);

  if (loading && !inventory.length) {
    return <StockTableShell rows={5} columns={4} header={false} topbar={false} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur">
        <h2 className="text-lg font-semibold text-text">Oxygen Inventory</h2>
        <p className="mt-1 text-xs text-muted">
          Simple stock view with full cylinders, empty cylinders, total cylinders, and type-wise counts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard icon={Package} label="Full Cylinders" value={summary.full} tone="success" />
        <StatCard icon={RefreshCcw} label="Empty Cylinders" value={summary.empty} tone="muted" />
        <StatCard icon={Layers3} label="Overall Cylinders" value={summary.total} helper={`${typeRows.length} types`} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur">
        <div className="border-b border-border/40 px-5 py-4">
          <h3 className="text-sm font-semibold text-text">Stock by Type</h3>
          <p className="mt-1 text-xs text-muted">Only type, full count, empty count, and total count are shown here.</p>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
              <tr>
                <th className="px-5 py-4 font-semibold">Cylinder Type</th>
                <th className="px-5 py-4 text-center font-semibold">Full</th>
                <th className="px-5 py-4 text-center font-semibold">Empty</th>
                <th className="px-5 py-4 text-center font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {typeRows.length ? (
                typeRows.map((row) => (
                  <tr key={row.id} className="transition hover:bg-accent/5">
                    <td className="px-5 py-4 font-semibold text-text">{row.cylinder_size}</td>
                    <td className="px-5 py-4 text-center text-base font-bold text-success">{row.full}</td>
                    <td className="px-5 py-4 text-center text-base font-bold text-text">{row.empty}</td>
                    <td className="px-5 py-4 text-center text-base font-bold text-accent">{row.total}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="4" className="px-5 py-8 text-center text-muted">
                    No oxygen inventory records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
