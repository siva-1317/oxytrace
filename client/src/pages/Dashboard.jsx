import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Droplets, Percent } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { useCylinders } from '../hooks/useCylinders.js';
import AlertBanner from '../components/AlertBanner.jsx';
import CylinderCard from '../components/CylinderCard.jsx';
import StatCard from '../components/StatCard.jsx';
import { apiJson } from '../lib/api.js';
import toast from 'react-hot-toast';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-surface/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="font-semibold">{label}</div>
      <div className="mt-1 text-muted">{Number(payload[0].value || 0).toFixed(2)} kg</div>
    </div>
  );
}

export default function Dashboard() {
  const { accessToken } = useAuth();
  const { cylinders, loading } = useCylinders();
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const geminiOverrideKey = useMemo(() => localStorage.getItem('oxytrace-gemini-key') || '', []);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    async function load() {
      try {
        const [a, s] = await Promise.all([
          apiJson('/api/alerts?status=active&limit=25', { token: accessToken }),
          apiJson('/api/analytics/summary', { token: accessToken })
        ]);
        if (cancelled) return;
        setAlerts(a.alerts || []);
        setSummary(s);
      } catch {
        // ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function refreshAI() {
    setAiLoading(true);
    try {
      const res = await apiJson('/api/ai/summary', {
        token: accessToken,
        method: 'POST',
        headers: geminiOverrideKey ? { 'x-gemini-key': geminiOverrideKey } : undefined,
        body: { now: Date.now() }
      });
      setAiText(res.text || '');
      toast.success('AI summary updated');
    } catch (e) {
      toast.error(e.message);
    } finally {
      setAiLoading(false);
    }
  }

  const statTotal = summary?.kpis?.totalCylinders ?? cylinders.length;
  const statActive = summary?.kpis?.activeCylinders ?? cylinders.filter((c) => c.is_active).length;
  const statCritical = summary?.kpis?.criticalAlerts ?? (alerts || []).filter((a) => a.severity === 'critical').length;
  const statAvg = summary?.kpis?.avgGasLevelPct ?? (cylinders.length ? cylinders.reduce((a, c) => a + (c.latest_reading?.gas_level_pct ?? 0), 0) / cylinders.length : 0);

  const usageSeries = summary?.usageLast7Days || [];

  return (
    <div className="relative">
      <div className="mesh-bg" />
      <div className="relative z-10 space-y-6">
        <AlertBanner alerts={alerts} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Droplets} label="Total Cylinders" value={statTotal} colorClass="border-accent" />
          <StatCard icon={Activity} label="Active Cylinders" value={statActive} colorClass="border-success" />
          <StatCard icon={AlertTriangle} label="Critical Alerts" value={statCritical} colorClass="border-danger" />
          <StatCard icon={Percent} label="Average Gas Level" value={statAvg} suffix="%" colorClass="border-warning" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Cylinders</div>
              <div className="text-xs text-muted">Live updates via Supabase Realtime</div>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {loading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
                      <Skeleton height={18} width={140} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                      <div className="mt-3">
                        <Skeleton height={10} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <Skeleton height={46} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                        <Skeleton height={46} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                        <Skeleton height={46} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                      </div>
                    </div>
                  ))
                : cylinders.map((c) => <CylinderCard key={c.id} cylinder={c} />)}
            </div>
          </div>

          <div className="space-y-6">
            <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Hospital O₂ consumption</div>
                <div className="text-xs text-muted">Last 7 days</div>
              </div>
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usageSeries} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="oxyFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(0,180,216,0.50)" />
                        <stop offset="100%" stopColor="rgba(0,180,216,0.05)" />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="day" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                    <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Area type="monotone" dataKey="kg" stroke="rgba(0,180,216,0.9)" fill="url(#oxyFill)" animationDuration={800} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">OxyTrace AI</div>
                <button
                  onClick={refreshAI}
                  className="rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:border-accent hover:text-accent"
                  disabled={aiLoading}
                >
                  {aiLoading ? 'Refreshing…' : 'Refresh'}
                </button>
              </div>
              <div className="mt-3 text-sm text-muted">
                {aiText ? aiText : 'Generate a concise system status summary and recommendations.'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
