import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiJson, formatDateTime, getCachedData } from '../../lib/api';
import { Package, Truck, RefreshCcw, Layers3 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { StockTableShell } from '../../components/DashboardPageLoader.jsx';
import { useThresholdSettings } from '../../hooks/useThresholdSettings.js';

function formatDayLabel(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(date);
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(date) {
  const next = new Date(date);
  next.setHours(23, 59, 59, 999);
  return next;
}

function subtractDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() - days);
  return next;
}

function buildPeriodRange(period) {
  const now = new Date();

  switch (period) {
    case 'today':
      return {
        from: startOfDay(now),
        to: endOfDay(now)
      };
    case '7d':
      return {
        from: startOfDay(subtractDays(now, 6)),
        to: endOfDay(now)
      };
    case '30d':
      return {
        from: startOfDay(subtractDays(now, 29)),
        to: endOfDay(now)
      };
    case '90d':
      return {
        from: startOfDay(subtractDays(now, 89)),
        to: endOfDay(now)
      };
    default:
      return {
        from: startOfDay(subtractDays(now, 6)),
        to: endOfDay(now)
      };
  }
}

function sumTransactions(rows, type) {
  return rows
    .filter((row) => row.transaction_type === type)
    .reduce((sum, row) => sum + Number(row.quantity || 0), 0);
}

function StatCard({ icon: Icon, label, value, tone = 'accent', helper }) {
  const toneMap = {
    accent: 'bg-accent/10 text-accent',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
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

function StatusPill({ full, reorder }) {
  if (Number(full || 0) === 0) {
    return <span className="rounded-full bg-danger/15 px-2.5 py-1 text-[10px] font-bold uppercase text-danger">Out</span>;
  }
  if (Number(full || 0) < Number(reorder || 0)) {
    return <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[10px] font-bold uppercase text-warning">Low</span>;
  }
  return <span className="rounded-full bg-success/15 px-2.5 py-1 text-[10px] font-bold uppercase text-success">Good</span>;
}

export default function InventoryTab() {
  const { accessToken } = useAuth();
  const thresholds = useThresholdSettings();
  const inventoryCacheKey = '/api/stock/inventory';

  const [inventory, setInventory] = useState(() => getCachedData(inventoryCacheKey)?.inventory || []);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(() => !getCachedData(inventoryCacheKey));
  const [txLoading, setTxLoading] = useState(false);
  const [cylinderFilter, setCylinderFilter] = useState('all');
  const [period, setPeriod] = useState('7d');

  const range = useMemo(() => buildPeriodRange(period), [period]);

  const fetchInventory = async () => {
    if (!getCachedData(inventoryCacheKey)) setLoading(true);
    try {
      const res = await apiJson('/api/stock/inventory', { token: accessToken, cacheKey: inventoryCacheKey });
      setInventory(res.inventory || []);
    } catch {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({
        limit: '2000',
        from: range.from.toISOString(),
        to: range.to.toISOString()
      });
      const res = await apiJson(`/api/stock/transactions?${params.toString()}`, { token: accessToken });
      setTransactions(res.transactions || []);
    } catch {
      toast.error('Failed to load inventory activity');
    } finally {
      setTxLoading(false);
    }
  };

  useEffect(() => {
    if (!accessToken) return;
    fetchInventory();
  }, [accessToken]);

  useEffect(() => {
    if (!accessToken) return;
    fetchTransactions();
  }, [accessToken, range.from, range.to]);

  const oxygenInventory = useMemo(() => {
    return inventory.filter((row) => (row.gas_type || 'oxygen') === 'oxygen');
  }, [inventory]);

  const oxygenTransactions = useMemo(() => {
    return transactions.filter((row) => (row.gas_type || 'oxygen') === 'oxygen');
  }, [transactions]);

  const cylinderTypes = useMemo(() => {
    return Array.from(new Set(oxygenInventory.map((row) => row.cylinder_size))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [oxygenInventory]);

  const filteredInventory = useMemo(() => {
    return oxygenInventory.filter((row) => cylinderFilter === 'all' || row.cylinder_size === cylinderFilter);
  }, [oxygenInventory, cylinderFilter]);

  const filteredTransactions = useMemo(() => {
    return oxygenTransactions.filter(
      (row) => cylinderFilter === 'all' || row.cylinder_size === cylinderFilter
    );
  }, [oxygenTransactions, cylinderFilter]);

  const todayRange = useMemo(() => {
    const now = new Date();
    return {
      from: startOfDay(now),
      to: endOfDay(now)
    };
  }, []);

  const todayTransactions = useMemo(() => {
    return oxygenTransactions.filter((row) => {
      const createdAt = new Date(row.created_at);
      return createdAt >= todayRange.from && createdAt <= todayRange.to;
    });
  }, [oxygenTransactions, todayRange.from, todayRange.to]);

  const inventorySummary = useMemo(() => {
    return filteredInventory.reduce(
      (acc, row) => {
        acc.total +=
          Number(row.quantity_full || 0) +
          Number(row.quantity_in_use || 0) +
          Number(row.quantity_empty || 0) +
          Number(row.quantity_damaged || 0);
        acc.full += Number(row.quantity_full || 0);
        acc.empty += Number(row.quantity_empty || 0);
        acc.inUse += Number(row.quantity_in_use || 0);
        return acc;
      },
      { total: 0, full: 0, empty: 0, inUse: 0 }
    );
  }, [filteredInventory]);

  const periodSummary = useMemo(() => {
    return {
      delivered: sumTransactions(filteredTransactions, 'received'),
      used: sumTransactions(filteredTransactions, 'issued'),
      empty: sumTransactions(filteredTransactions, 'returned')
    };
  }, [filteredTransactions]);

  const todaySummary = useMemo(() => {
    const rows = todayTransactions.filter(
      (row) => cylinderFilter === 'all' || row.cylinder_size === cylinderFilter
    );

    return {
      delivered: sumTransactions(rows, 'received'),
      used: sumTransactions(rows, 'issued'),
      empty: sumTransactions(rows, 'returned')
    };
  }, [todayTransactions, cylinderFilter]);

  const chartData = useMemo(() => {
    const buckets = new Map();
    let current = new Date(range.from);

    while (current <= range.to) {
      const key = current.toISOString().slice(0, 10);
      buckets.set(key, {
        day: formatDayLabel(key),
        delivered: 0,
        used: 0,
        empty: 0
      });
      current = addOneDay(current);
    }

    for (const row of filteredTransactions) {
      const key = new Date(row.created_at).toISOString().slice(0, 10);
      if (!buckets.has(key)) continue;
      const bucket = buckets.get(key);
      if (row.transaction_type === 'received') bucket.delivered += Number(row.quantity || 0);
      if (row.transaction_type === 'issued') bucket.used += Number(row.quantity || 0);
      if (row.transaction_type === 'returned') bucket.empty += Number(row.quantity || 0);
    }

    return Array.from(buckets.values());
  }, [filteredTransactions, range.from, range.to]);

  if (loading && !inventory.length) {
    return <StockTableShell rows={6} columns={7} header={true} topbar={false} />;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/50 bg-surface/70 px-4 py-3 text-xs text-muted shadow-sm backdrop-blur">
        Cylinder alert settings: gas {thresholds.low_gas_pct}% / {thresholds.danger_gas_pct}% | leakage {thresholds.leak_warn_ppm} / {thresholds.leak_danger_ppm} ppm | weight {thresholds.low_weight_kg} / {thresholds.danger_weight_kg} kg
      </div>
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Oxygen Inventory</h2>
          <p className="text-xs text-muted">
            Read-only view of cylinder count, full and empty stock, supplier details, and delivery or usage activity.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <select
            value={cylinderFilter}
            onChange={(e) => setCylinderFilter(e.target.value)}
            className="rounded-xl border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none transition focus:border-accent"
          >
            <option value="all">All cylinder types</option>
            {cylinderTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <div className="flex rounded-xl border border-border/50 bg-background p-1">
            {[
              { value: 'today', label: 'Today' },
              { value: '7d', label: '7 Days' },
              { value: '30d', label: '30 Days' },
              { value: '90d', label: '90 Days' }
            ].map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setPeriod(item.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  period === item.value ? 'bg-accent text-white' : 'text-muted hover:text-text'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Layers3}
          label="Cylinder Count"
          value={inventorySummary.total}
          helper={cylinderFilter === 'all' ? 'Across all oxygen cylinder types' : cylinderFilter}
        />
        <StatCard icon={Package} label="Full Cylinders" value={inventorySummary.full} tone="success" />
        <StatCard icon={RefreshCcw} label="Empty Cylinders" value={inventorySummary.empty} tone="muted" />
        <StatCard icon={Truck} label="In Use" value={inventorySummary.inUse} tone="warning" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.6fr_1fr]">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-text">Delivery and Usage Trend</h3>
              <p className="text-xs text-muted">
                Delivered, used, and empty-returned cylinders for the selected time period.
              </p>
            </div>
            <div className="text-xs text-muted">
              {txLoading ? 'Refreshing activity...' : `${formatDayLabel(range.from)} to ${formatDayLabel(range.to)}`}
            </div>
          </div>

          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{
                    backgroundColor: 'rgba(15,23,42,0.95)',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderRadius: 12,
                    fontSize: 12
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="delivered" name="Delivered" fill="#10b981" radius={[6, 6, 0, 0]} />
                <Bar dataKey="used" name="Used" fill="#00b4d8" radius={[6, 6, 0, 0]} />
                <Bar dataKey="empty" name="Empty" fill="#94a3b8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <h3 className="text-sm font-semibold text-text">Today</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-xs text-muted">Delivered Today</div>
                <div className="mt-1 text-2xl font-bold text-success">{todaySummary.delivered}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-xs text-muted">Used Today</div>
                <div className="mt-1 text-2xl font-bold text-accent">{todaySummary.used}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-xs text-muted">Empty Returned Today</div>
                <div className="mt-1 text-2xl font-bold text-text">{todaySummary.empty}</div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <h3 className="text-sm font-semibold text-text">Selected Period</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-xs text-muted">Delivered</div>
                <div className="mt-1 text-2xl font-bold text-success">{periodSummary.delivered}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-xs text-muted">Used</div>
                <div className="mt-1 text-2xl font-bold text-accent">{periodSummary.used}</div>
              </div>
              <div className="rounded-xl border border-border/40 bg-background/50 p-3">
                <div className="text-xs text-muted">Empty Returned</div>
                <div className="mt-1 text-2xl font-bold text-text">{periodSummary.empty}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
        <div className="border-b border-border/40 px-5 py-4">
          <h3 className="text-sm font-semibold text-text">Cylinder and Supplier Details</h3>
          <p className="mt-1 text-xs text-muted">
            List of oxygen cylinders with supplier name, latest supplied date, and stock counts.
          </p>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
              <tr>
                <th className="px-5 py-4 font-semibold">Cylinder Type</th>
                <th className="px-5 py-4 font-semibold">Supplier</th>
                <th className="px-5 py-4 font-semibold">Supplied Date</th>
                <th className="px-5 py-4 text-center font-semibold">Full</th>
                <th className="px-5 py-4 text-center font-semibold">Empty</th>
                <th className="px-5 py-4 text-center font-semibold">In Use</th>
                <th className="px-5 py-4 text-center font-semibold">Total</th>
                <th className="px-5 py-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {filteredInventory.length ? (
                filteredInventory.map((row) => {
                  const total =
                    Number(row.quantity_full || 0) +
                    Number(row.quantity_empty || 0) +
                    Number(row.quantity_in_use || 0) +
                    Number(row.quantity_damaged || 0);

                  return (
                    <tr key={row.id} className="transition hover:bg-accent/5">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-text">{row.cylinder_size}</div>
                        <div className="mt-0.5 text-[10px] text-muted">
                          Updated {formatDateTime(row.last_updated).split(',')[0]}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="font-medium text-text">{row.supplier_name || 'Unassigned supplier'}</div>
                      </td>
                      <td className="px-5 py-4 text-muted">
                        {row.latest_order_date ? formatDateTime(row.latest_order_date).split(',')[0] : 'No supply date'}
                      </td>
                      <td className="px-5 py-4 text-center text-base font-bold text-success">{row.quantity_full}</td>
                      <td className="px-5 py-4 text-center text-base font-bold text-text">{row.quantity_empty}</td>
                      <td className="px-5 py-4 text-center text-base font-bold text-accent">{row.quantity_in_use}</td>
                      <td className="px-5 py-4 text-center text-base font-bold text-text">{total}</td>
                      <td className="px-5 py-4">
                        <StatusPill full={row.quantity_full} reorder={row.reorder_level} />
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="px-5 py-8 text-center text-muted">
                    No oxygen inventory records found for this filter.
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

function addOneDay(date) {
  const next = new Date(date);
  next.setDate(next.getDate() + 1);
  return next;
}
