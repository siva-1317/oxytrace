import React, { useMemo, useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { useCylinders } from '../hooks/useCylinders.js';
import { apiJson, formatDateTime, getCachedData } from '../lib/api.js';
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
  const { cylinders } = useCylinders();
  const cacheKey = '/api/refills';
  const [history, setHistory] = useState(() => getCachedData(cacheKey)?.refills || []);
  const [loading, setLoading] = useState(() => !getCachedData(cacheKey));
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ cylinder_id: '', new_weight_kg: '', refilled_by: '', notes: '' });

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    async function load() {
      if (!getCachedData(cacheKey)) setLoading(true);
      try {
        const data = await apiJson('/api/refills', { token: accessToken, cacheKey });
        if (!cancelled) setHistory(data.refills || []);
      } catch (e) {
        toast.error(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const upcoming = useMemo(() => {
    const list = cylinders
      .map((c) => ({
        id: c.id,
        name: c.cylinder_name,
        ward: c.ward,
        pct: Number(c.latest_reading?.gas_level_pct ?? 0)
      }))
      .filter((c) => c.pct > 0)
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 10);
    return list;
  }, [cylinders]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const thisMonth = history.filter((r) => (r.refill_date || '').slice(0, 7) === monthKey);
    const totalKg = thisMonth.reduce((a, r) => a + Math.max(0, Number(r.new_weight_kg || 0) - Number(r.previous_weight_kg || 0)), 0);
    const byCyl = new Map();
    for (const r of thisMonth) {
      const k = r.cylinder?.cylinder_name || r.cylinder_name || 'Unknown';
      byCyl.set(k, (byCyl.get(k) || 0) + 1);
    }
    const most = Array.from(byCyl.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return { count: thisMonth.length, totalKg, most };
  }, [history]);

  const perCylinder = useMemo(() => {
    const map = new Map();
    for (const r of history) {
      const k = r.cylinder?.cylinder_name || r.cylinder_name || 'Unknown';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12);
  }, [history]);

  async function submit(e) {
    e.preventDefault();
    try {
      const cyl = cylinders.find((c) => c.id === form.cylinder_id);
      const prevWeight = Number(cyl?.latest_reading?.gas_weight_kg ?? 0);
      await apiJson('/api/refills', {
        token: accessToken,
        method: 'POST',
        queueOffline: true,
        body: {
          cylinder_id: form.cylinder_id,
          previous_weight_kg: prevWeight,
          new_weight_kg: Number(form.new_weight_kg),
          refilled_by: form.refilled_by,
          notes: form.notes
        }
      });
      toast.success('Refill logged');
      setOpen(false);
      setForm({ cylinder_id: '', new_weight_kg: '', refilled_by: '', notes: '' });
      const data = await apiJson('/api/refills', { token: accessToken, cacheKey });
      setHistory(data.refills || []);
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
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-surface/80 p-4 rounded-2xl border border-border/50 shadow-sm backdrop-blur">
        <div>
          <h2 className="text-lg font-semibold text-text">Refill Records</h2>
          <p className="text-xs text-muted mt-0.5">Track and analyze logged batch refills</p>
        </div>
        <div className="flex gap-2">
          <ReportDownloadButton onGenerate={() => downloadRefillsReportPdf({ history, upcoming, stats, perCylinder })} />
          <button onClick={exportCsv} className="rounded-xl border border-border/50 bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent shadow-sm">
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
          <div className="mt-2 text-2xl font-semibold">{stats.totalKg.toFixed(1)}</div>
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

      <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
              <tr>
                <th className="px-5 py-4 font-semibold">Cylinder</th>
                <th className="px-5 py-4 font-semibold">Ward</th>
                <th className="px-5 py-4 font-semibold">Date</th>
                <th className="px-5 py-4 font-semibold">Prev kg</th>
                <th className="px-5 py-4 font-semibold">New kg</th>
                <th className="px-5 py-4 font-semibold">By</th>
                <th className="px-5 py-4 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {history.map((r) => (
                <tr key={r.id} className="hover:bg-accent/5 transition group">
                  <td className="px-5 py-4 font-medium text-text">{r.cylinder?.cylinder_name || r.cylinder_name}</td>
                  <td className="px-5 py-4 text-muted">{r.cylinder?.ward || r.ward}</td>
                  <td className="px-5 py-4 text-muted">{formatDateTime(r.refill_date)}</td>
                  <td className="px-5 py-4 font-mono">{Number(r.previous_weight_kg ?? 0).toFixed(1)}</td>
                  <td className="px-5 py-4 font-mono font-medium">{Number(r.new_weight_kg ?? 0).toFixed(1)}</td>
                  <td className="px-5 py-4 text-muted">{r.refilled_by}</td>
                  <td className="px-5 py-4 text-muted">{r.notes}</td>
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
              <option value="">Select…</option>
              {cylinders.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.cylinder_name} · {c.ward}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-muted">
            New weight (kg)
            <input
              type="number"
              step="0.1"
              value={form.new_weight_kg}
              onChange={(e) => setForm((f) => ({ ...f, new_weight_kg: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="text-xs text-muted">
            Refilled by
            <input
              value={form.refilled_by}
              onChange={(e) => setForm((f) => ({ ...f, refilled_by: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
              required
            />
          </label>
          <label className="text-xs text-muted">
            Notes
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
              rows={3}
            />
          </label>
          <button className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">Save</button>
        </form>
      </Modal>
    </div>
  );
}

