import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson, getCachedData } from '../lib/api.js';
import DashboardPageLoader from '../components/DashboardPageLoader.jsx';
import ReportDownloadButton from '../components/ReportDownloadButton.jsx';
import { downloadAnalyticsReportPdf } from '../lib/reportPrint.js';

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-surface/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mt-1 text-muted">
          {p.name || p.dataKey}: {typeof p.value === 'number' ? p.value.toFixed(2) : String(p.value)}
        </div>
      ))}
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

export default function Analytics() {
  const { accessToken } = useAuth();
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const cacheKey = `/api/analytics/consumption?from=${from}&to=${to}`;
  const [data, setData] = useState(() => getCachedData(cacheKey));
  const [aiReport, setAiReport] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const geminiOverrideKey = useMemo(() => localStorage.getItem('oxytrace-gemini-key') || '', []);
  const geminiOverrideModel = useMemo(() => localStorage.getItem('oxytrace-gemini-model') || '', []);
  const geminiOverrideTemp = useMemo(() => localStorage.getItem('oxytrace-gemini-temp') || '', []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    async function load() {
      try {
        const d = await apiJson(`/api/analytics/consumption?from=${from}&to=${to}`, {
          token: accessToken,
          cacheKey: `/api/analytics/consumption?from=${from}&to=${to}`
        });
        if (!cancelled) setData(d);
      } catch (e) {
        toast.error(e.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, from, to]);

  async function exportCsv() {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/analytics/export?from=${from}&to=${to}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!res.ok) throw new Error(`Export failed (${res.status})`);
      const csv = await res.text();
      downloadCsv(`oxytrace-analytics-${from}-to-${to}.csv`, csv);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function generateReport() {
    setAiLoading(true);
    try {
      const res = await apiJson('/api/ai/analytics-report', {
        token: accessToken,
        method: 'POST',
        headers: {
          ...(geminiOverrideKey ? { 'x-gemini-key': geminiOverrideKey } : {}),
          ...(geminiOverrideModel ? { 'x-gemini-model': geminiOverrideModel } : {}),
          ...(geminiOverrideTemp ? { 'x-gemini-temp': geminiOverrideTemp } : {})
        },
        body: { from, to, stats: data?.stats || {} }
      });
      setAiReport(res.markdown || '');
      toast.success('AI report ready');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  const statusColors = {
    OK: 'rgba(0,230,118,0.8)',
    Low: 'rgba(255,160,0,0.8)',
    Critical: 'rgba(255,82,82,0.85)',
    Inactive: 'rgba(100,116,139,0.7)'
  };

  if (!data) {
    return <DashboardPageLoader variant="analytics" />;
  }

  const heat = data?.heatmap || { days: [], hours: [], grid: [] };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
        <div className="text-sm font-semibold">Date range</div>
        <label className="text-xs text-muted">
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="ml-2 rounded-xl border border-border/50 bg-background px-3 py-2 text-sm shadow-sm focus:border-accent transition outline-none" />
        </label>
        <label className="text-xs text-muted">
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="ml-2 rounded-xl border border-border/50 bg-background px-3 py-2 text-sm shadow-sm focus:border-accent transition outline-none" />
        </label>
        <div className="flex-1" />
        <ReportDownloadButton onGenerate={() => downloadAnalyticsReportPdf({ from, to, data, aiReport })} />
        <button onClick={exportCsv} className="rounded-xl border border-border/50 bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent shadow-sm">
          Export CSV
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Hospital-wide consumption</div>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.totalSeries || []} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="rgba(0,180,216,0.5)" />
                    <stop offset="100%" stopColor="rgba(0,180,216,0.05)" />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(30,58,95,0.35)" />
                <XAxis dataKey="day" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <Tooltip content={<TooltipBox />} />
                <Area type="monotone" dataKey="kg" name="kg" stroke="rgba(0,180,216,0.9)" fill="url(#fillA)" animationDuration={800} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Consumption per ward</div>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.byWard || []} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                <CartesianGrid stroke="rgba(30,58,95,0.35)" />
                <XAxis dataKey="ward" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <Tooltip content={<TooltipBox />} />
                <Bar dataKey="kg" name="kg" fill="rgba(0,119,182,0.75)" radius={[8, 8, 0, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Gas level trends (multi-series)</div>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data?.levelsSeries || []} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                <CartesianGrid stroke="rgba(30,58,95,0.35)" />
                <XAxis dataKey="t" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 10 }} hide />
                <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <Tooltip content={<TooltipBox />} />
                <Legend />
                {(data?.levelKeys || []).slice(0, 6).map((k, idx) => (
                  <Line key={k} type="monotone" dataKey={k} name={k} dot={false} stroke={`hsla(${(idx * 55) % 360}, 80%, 60%, 0.9)`} animationDuration={800} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-xs text-muted">Shows up to 6 cylinders for readability.</div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Leakage vs gas level (scatter)</div>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                <CartesianGrid stroke="rgba(30,58,95,0.35)" />
                <XAxis dataKey="pct" name="Gas %" unit="%" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <YAxis dataKey="ppm" name="PPM" unit="ppm" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <Tooltip content={<TooltipBox />} />
                <Scatter data={data?.scatter || []} fill="rgba(255,160,0,0.85)" animationDuration={800} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Status distribution</div>
          <div className="mt-3 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Tooltip content={<TooltipBox />} />
                <Pie data={data?.statusDist || []} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3} animationDuration={800}>
                  {(data?.statusDist || []).map((entry) => (
                    <Cell key={entry.name} fill={statusColors[entry.name] || 'rgba(0,180,216,0.6)'} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Usage heatmap (day × hour)</div>
          <div className="mt-3 overflow-auto">
            <div className="min-w-[520px]">
              <div className="grid" style={{ gridTemplateColumns: `110px repeat(${heat.hours.length}, minmax(18px, 1fr))`, gap: 6 }}>
                <div />
                {heat.hours.map((h) => (
                  <div key={h} className="text-center text-[10px] text-muted">
                    {h}
                  </div>
                ))}
                {heat.days.map((d, rowIdx) => (
                  <React.Fragment key={d}>
                    <div className="text-xs text-muted">{d}</div>
                    {heat.hours.map((h, colIdx) => {
                      const v = heat.grid[rowIdx]?.[colIdx] ?? 0;
                      const alpha = Math.min(0.85, 0.08 + v / 12);
                      return (
                        <div
                          key={`${d}-${h}`}
                          title={`${d} ${h}: ${v.toFixed(2)} kg`}
                          className="h-5 rounded-md border border-border/40"
                          style={{ background: `rgba(0,180,216,${alpha})` }}
                        />
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">AI Analytics report</div>
          <button
            onClick={generateReport}
            disabled={aiLoading}
            className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-50"
          >
            {aiLoading ? 'Generating…' : 'Generate AI Report'}
          </button>
        </div>
        {aiReport ? (
          <div className="prose dark:prose-invert mt-4 max-w-none rounded-xl border border-border/40 bg-card/20 p-4">
            <ReactMarkdown>{aiReport}</ReactMarkdown>
          </div>
        ) : (
          <div className="mt-3 text-sm text-muted">Generates a structured markdown report: trends, anomalies, refill recommendations, and safety observations.</div>
        )}
      </div>

      <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
              <tr>
                <th className="px-5 py-4 font-semibold">Cylinder</th>
                <th className="px-5 py-4 font-semibold">Ward</th>
                <th className="px-5 py-4 font-semibold">Avg Gas %</th>
                <th className="px-5 py-4 font-semibold">Avg Leakage ppm</th>
                <th className="px-5 py-4 font-semibold">Avg Daily Use (kg)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {(data?.table || []).map((r) => (
                <tr key={r.cylinder_id} className="hover:bg-accent/5 transition group">
                  <td className="px-5 py-4 font-medium text-text">{r.cylinder_name}</td>
                  <td className="px-5 py-4 text-muted">{r.ward}</td>
                  <td className="px-5 py-4 font-mono">{Number(r.avg_gas_level_pct ?? 0).toFixed(1)}</td>
                  <td className="px-5 py-4 font-mono">{Number(r.avg_leakage_ppm ?? 0).toFixed(0)}</td>
                  <td className="px-5 py-4 font-mono font-medium">{Number(r.avg_daily_use_kg ?? 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.table?.length ? null : <div className="px-5 py-6 text-sm text-muted">No data for selected range.</div>}
      </div>
    </div>
  );
}


