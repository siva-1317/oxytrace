import React, { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { useCylinders } from '../hooks/useCylinders.js';
import { apiJson, formatDateTime, getCachedData, subscribeDataRefresh } from '../lib/api.js';
import DashboardPageLoader from '../components/DashboardPageLoader.jsx';
import ReportDownloadButton from '../components/ReportDownloadButton.jsx';
import { downloadRefillsReportPdf } from '../lib/reportPrint.js';

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-surface/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="font-semibold">{label}</div>
      <div className="mt-1 text-muted">{Number(payload[0].value || 0).toFixed(0)}</div>
    </div>
  );
}

function downloadCsv(filename, csvText) {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-surface/90 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="text-sm text-muted hover:text-text">
            Close
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export default function Refills() {
  const { accessToken } = useAuth();
  const { cylinders, refresh } = useCylinders();
  const cacheKey = '/api/refills';
  const [history, setHistory] = useState(() => getCachedData(cacheKey)?.refills || []);
  const [loading, setLoading] = useState(() => !getCachedData(cacheKey));
  const [open, setOpen] = useState(false);
  const [cylinderTypes, setCylinderTypes] = useState([]);
  const [form, setForm] = useState({ cylinder_id: '', type_id: '' });

  async function loadData() {
    if (!accessToken) return;
    if (!getCachedData(cacheKey)) setLoading(true);
    try {
      const [refillData, typeData] = await Promise.all([
        apiJson('/api/refills', { token: accessToken, cacheKey }),
        apiJson('/api/settings/cylinder-types', { token: accessToken })
      ]);
      setHistory(refillData.refills || []);
      setCylinderTypes(typeData.cylinderTypes || []);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    loadData().catch(() => {});
    const timer = setInterval(() => {
      if (!cancelled) loadData().catch(() => {});
    }, 25000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [accessToken]);

  useEffect(() => {
    const unsubscribe = subscribeDataRefresh(({ tags }) => {
      if (tags.some((tag) => ['refills', 'settings', 'cylinders', 'dashboard'].includes(tag))) {
        loadData().catch(() => {});
      }
    });
    return unsubscribe;
  }, [accessToken]);

  const upcoming = useMemo(() => {
    return cylinders
      .map((c) => ({
        id: c.id,
        name: c.cylinder_num || c.cylinder_name,
        ward: c.ward,
        pct: Number(c.gas_percent ?? c.latest_reading?.gas_level_pct ?? 0)
      }))
      .filter((c) => c.pct > 0)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 10);
  }, [cylinders]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = history.filter((r) => (r.refill_time || '').slice(0, 7) === monthKey);
    const byCyl = new Map();
    for (const r of thisMonth) {
      const key = r.cylinder?.cylinder_num || 'Unknown';
      byCyl.set(key, (byCyl.get(key) || 0) + 1);
    }
    const most = Array.from(byCyl.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    const totalKg = thisMonth.reduce(
      (sum, row) => sum + Math.max(0, Number(row.type?.full_weight || 0) - Number(row.type?.empty_weight || 0)),
      0
    );
    return { count: thisMonth.length, totalKg, most };
  }, [history]);

  const perCylinder = useMemo(() => {
    const map = new Map();
    for (const r of history) {
      const key = r.cylinder?.cylinder_num || 'Unknown';
      map.set(key, (map.get(key) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [history]);

  async function submit(e) {
    e.preventDefault();
    try {
      await apiJson('/api/refills', {
        token: accessToken,
        method: 'POST',
        queueOffline: true,
        body: {
          cylinder_id: form.cylinder_id,
          type_id: form.type_id
        }
      });
      toast.success('Refill logged');
      setOpen(false);
      setForm({ cylinder_id: '', type_id: '' });
      const data = await apiJson('/api/refills', { token: accessToken, cacheKey });
      setHistory(data.refills || []);
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function exportCsv() {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/refills/export`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const csv = await res.text();
      downloadCsv('oxytrace-refills.csv', csv);
    } catch (e) {
      toast.error(e.message);
    }
  }

  if (loading) {
    return <DashboardPageLoader variant="refills" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Refill Records</h2>
          <p className="mt-0.5 text-xs text-muted">Track and analyze logged refill events</p>
        </div>
        <div className="flex gap-2">
          <ReportDownloadButton onGenerate={() => downloadRefillsReportPdf({ history, upcoming, stats, perCylinder })} />
          <button onClick={exportCsv} className="rounded-xl border border-border/50 bg-surface px-4 py-2 text-sm font-medium shadow-sm transition hover:border-accent hover:text-accent">
            Export CSV
          </button>
          <button onClick={() => setOpen(true)} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90">
            Log New Refill
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-xs text-muted">Refills this month</div>
          <div className="mt-2 text-2xl font-semibold">{stats.count}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-xs text-muted">Total kg refilled</div>
          <div className="mt-2 text-2xl font-semibold">{stats.totalKg.toFixed(1)} kg</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur md:col-span-2">
          <div className="text-xs text-muted">Most refilled cylinder</div>
          <div className="mt-2 text-2xl font-semibold">{stats.most}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Upcoming refills (heuristic)</div>
          <div className="mt-3 overflow-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-2">Cylinder</th>
                  <th className="py-2">Ward</th>
                  <th className="py-2">Gas %</th>
                </tr>
              </thead>
              <tbody>
                {upcoming.map((c) => (
                  <tr key={c.id} className="border-t border-border/30">
                    <td className="py-2 font-medium">{c.name}</td>
                    <td className="py-2 text-muted">{c.ward}</td>
                    <td className={c.pct < 20 ? 'py-2 font-mono text-danger' : c.pct < 35 ? 'py-2 font-mono text-warning' : 'py-2 font-mono text-muted'}>
                      {c.pct.toFixed(1)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {upcoming.length ? null : <div className="mt-2 text-sm text-muted">No cylinders yet.</div>}
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Refills per cylinder</div>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perCylinder} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 10 }} hide />
                <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <Tooltip content={<TooltipBox />} />
                <Bar dataKey="count" fill="rgba(0,180,216,0.8)" radius={[8, 8, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-xs text-muted">Top 12 cylinders by refill count.</div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border/50 bg-surface/50 text-xs uppercase text-muted">
              <tr>
                <th className="px-5 py-4 font-semibold">Cylinder</th>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 font-semibold">Ward</th>
                <th className="px-5 py-4 font-semibold">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {history.map((r) => (
                <tr key={r.id} className="group transition hover:bg-accent/5">
                  <td className="px-5 py-4 font-medium text-text">{r.cylinder?.cylinder_num || '-'}</td>
                  <td className="px-5 py-4 text-muted">{r.type?.type_name || '-'}</td>
                  <td className="px-5 py-4 text-muted">{r.cylinder?.ward || '-'}</td>
                  <td className="px-5 py-4 text-muted">{formatDateTime(r.refill_time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.length ? null : <div className="px-5 py-6 text-sm text-muted">No refill history.</div>}
      </div>

      <Modal open={open} title="Log New Refill" onClose={() => setOpen(false)}>
        <form onSubmit={submit} className="space-y-3">
          <label className="text-xs text-muted">
            Cylinder
            <select
              value={form.cylinder_id}
              onChange={(e) => setForm((f) => ({ ...f, cylinder_id: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
              required
            >
              <option value="">Select...</option>
              {cylinders.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cylinder_num || c.cylinder_name} · {c.ward}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            Cylinder Type
            <select
              value={form.type_id}
              onChange={(e) => setForm((f) => ({ ...f, type_id: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
              required
            >
              <option value="">Select...</option>
              {cylinderTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.type_name} · Full {Number(type.full_weight).toFixed(1)} kg · Empty {Number(type.empty_weight).toFixed(1)} kg
                </option>
              ))}
            </select>
          </label>
          <button className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">Save</button>
        </form>
      </Modal>
    </div>
  );
}
