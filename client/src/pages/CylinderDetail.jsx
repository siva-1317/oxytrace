import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson, formatDateTime, getCachedData } from '../lib/api.js';
import { supabase } from '../lib/supabaseClient.js';
import { normalizeTelemetryRow } from '../lib/telemetry.js';
import { mergeCylinderLiveReading } from '../lib/cylinderLive.js';
import AIAnalysisPanel from '../components/AIAnalysisPanel.jsx';
import DashboardPageLoader from '../components/DashboardPageLoader.jsx';
import ReportDownloadButton from '../components/ReportDownloadButton.jsx';
import { downloadCylinderDetailReportPdf } from '../lib/reportPrint.js';
import { useThresholdSettings } from '../hooks/useThresholdSettings.js';

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

function TooltipBox({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-surface/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="font-semibold">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="mt-1 text-muted">
          {p.name || p.dataKey}: {Number(p.value || 0).toFixed(2)}
        </div>
      ))}
    </div>
  );
}

export default function CylinderDetail() {
  const { id } = useParams();
  const { accessToken } = useAuth();
  const thresholds = useThresholdSettings();
  const detailCacheKey = `/api/cylinders/${id}`;
  const [detail, setDetail] = useState(() => getCachedData(detailCacheKey)?.cylinder || null);
  const [readings, setReadings] = useState(() => getCachedData(`/api/readings/${id}?range=1d`)?.readings || []);
  const [range, setRange] = useState('1d');
  const [refills, setRefills] = useState([]);
  const [cylinderTypes, setCylinderTypes] = useState([]);
  const [openRefill, setOpenRefill] = useState(false);
  const [refillForm, setRefillForm] = useState({ type_id: '' });

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    async function load() {
      try {
        const [data, typeData] = await Promise.all([
          apiJson(`/api/cylinders/${id}`, { token: accessToken, cacheKey: detailCacheKey }),
          apiJson('/api/settings/cylinder-types', { token: accessToken })
        ]);
        if (cancelled) return;
        setDetail(data.cylinder);
        setRefills(data.refills || []);
        setCylinderTypes(typeData.cylinderTypes || []);
      } catch (e) {
        toast.error(e.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, id]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    async function load() {
      try {
        const data = await apiJson(`/api/readings/${id}?range=${range}`, {
          token: accessToken,
          cacheKey: `/api/readings/${id}?range=${range}`
        });
        if (!cancelled) setReadings(data.readings || []);
      } catch {
        // ignore
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, id, range]);

  const latest = detail?.latest_reading || {};
  const gasPct = Number(latest.gas_level_pct ?? 0);

  const gauge = useMemo(() => [{ name: 'Gas', value: gasPct, fill: 'rgba(0,180,216,0.9)' }], [gasPct]);

  const lineSeries = useMemo(
    () =>
      readings
        .slice()
        .reverse()
        .map((r) => ({
          t: new Date(r.created_at).toLocaleString([], { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
          weight: r.gas_weight_kg,
          ppm: r.leakage_ppm,
          pct: r.gas_level_pct
        })),
    [readings]
  );

  const dailyUsage = useMemo(() => {
    const byDay = new Map();
    for (let i = 1; i < lineSeries.length; i++) {
      const prev = lineSeries[i - 1];
      const cur = lineSeries[i];
      const day = cur.t.slice(0, 6);
      const used = Math.max(0, Number(prev.weight || 0) - Number(cur.weight || 0));
      byDay.set(day, (byDay.get(day) || 0) + used);
    }
    return Array.from(byDay.entries()).map(([day, kg]) => ({ day, kg }));
  }, [lineSeries]);

  useEffect(() => {
    if (!id || !detail) return;
    const channel = supabase
      .channel(`cylinder-${id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'iot_telemetry', filter: `device_id=eq.${detail.esp32_device_id}` },
        (payload) => {
          const newReading = normalizeTelemetryRow(payload.new);
          console.debug('[CylinderDetail] iot_telemetry insert', {
            raw: payload.new,
            normalized: newReading
          });
          setDetail((prev) => (prev ? mergeCylinderLiveReading(prev, newReading) : prev));
          // Prepend to the readings array for the graphs
          setReadings((prev) => [newReading, ...prev]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, detail?.id]);

  async function toggleValve() {
    try {
      const data = await apiJson(`/api/cylinders/${id}/valve`, {
        token: accessToken,
        method: 'PATCH',
        queueOffline: true
      });
      toast.success(data?.queued ? 'Valve update queued for sync' : `Valve now ${data.valve_open ? 'OPEN' : 'CLOSED'} (simulated)`);
      const refreshed = await apiJson(`/api/cylinders/${id}`, { token: accessToken, cacheKey: detailCacheKey });
      setDetail(refreshed.cylinder);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function submitRefill(e) {
    e.preventDefault();
    try {
      await apiJson('/api/refills', {
        token: accessToken,
        method: 'POST',
        queueOffline: true,
        body: {
          cylinder_id: id,
          type_id: refillForm.type_id
        }
      });
      toast.success('Refill logged');
      setOpenRefill(false);
      setRefillForm({ type_id: '' });
      const refreshed = await apiJson(`/api/cylinders/${id}`, { token: accessToken, cacheKey: detailCacheKey });
      setDetail(refreshed.cylinder);
      setRefills(refreshed.refills || []);
    } catch (e) {
      toast.error(e.message);
    }
  }

  if (!detail) {
    return <DashboardPageLoader variant="cylinder-detail" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 rounded-2xl border border-border/50 bg-surface/80 px-4 py-3 shadow-sm backdrop-blur">
        <div>
          <div className="text-lg font-semibold">{detail.cylinder_num || detail.cylinder_name}</div>
          <div className="text-xs text-muted">
            {detail.ward} ? {detail.floor || detail.floor_name || detail.location} ? {detail.device_id || detail.esp32_device_id}
          </div>
        </div>
        <ReportDownloadButton onGenerate={() => downloadCylinderDetailReportPdf({ detail, refills, lineSeries, dailyUsage, range })} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-1">
          <div className="rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center justify-end">
              <button
                onClick={toggleValve}
                className="rounded-xl border border-border/50 bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent shadow-sm"
              >
                Toggle valve
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4">
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart cx="50%" cy="60%" innerRadius="70%" outerRadius="95%" barSize={12} data={gauge} startAngle={180} endAngle={0}>
                    <RadialBar dataKey="value" cornerRadius={12} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="-mt-10 text-center">
                  <div className="font-mono text-3xl font-semibold">{gasPct.toFixed(1)}%</div>
                  <div className="text-xs text-muted">Gas level</div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl border border-border/50 bg-card/30 p-2">
                  <div className="text-xs text-muted">Weight</div>
                  <div className="mt-1 font-mono text-sm">{Number(latest.gas_weight_kg ?? 0).toFixed(1)} kg</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/30 p-2">
                  <div className="text-xs text-muted">Leakage</div>
                  <div className="mt-1 font-mono text-sm">{Number(latest.leakage_ppm ?? 0).toFixed(0)} ppm</div>
                </div>
                <div className="rounded-xl border border-border/50 bg-card/30 p-2">
                  <div className="text-xs text-muted">Valve</div>
                  <div className={latest.valve_open ? 'mt-1 text-sm text-success' : 'mt-1 text-sm text-danger'}>
                    {latest.valve_open ? 'OPEN' : 'CLOSED'}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-border/50 bg-card/30 p-3 text-sm text-muted">
                Prediction: ~{Math.max(0, Math.round((gasPct / 100) * 21))} days remaining (heuristic)
                <div className="mt-2 text-xs">Gas alert levels: warning {thresholds.low_gas_pct}% | critical {thresholds.danger_gas_pct}% | weight warning {thresholds.low_weight_kg} kg</div>
              </div>
            </div>
          </div>

          <AIAnalysisPanel cylinderId={id} />

        <div className="rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold">Refill history</div>
            <button
              onClick={() => setOpenRefill(true)}
              className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
            >
              Log refill
            </button>
          </div>
          <div className="mt-3 overflow-x-auto custom-scrollbar rounded-xl border border-border/50">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 font-semibold">Date</th>
                  <th className="px-4 py-3 font-semibold">Type</th>
                  <th className="px-4 py-3 font-semibold">Full</th>
                  <th className="px-4 py-3 font-semibold">Empty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {(refills || []).map((r) => (
                  <tr key={r.id} className="hover:bg-accent/5 transition group">
                    <td className="px-4 py-3 text-muted">{formatDateTime(r.refill_time)}</td>
                    <td className="px-4 py-3 font-mono">{r.type?.type_name || '-'}</td>
                    <td className="px-4 py-3 font-mono">{r.type?.full_weight == null ? '-' : `${Number(r.type.full_weight).toFixed(1)} kg`}</td>
                    <td className="px-4 py-3 text-muted">{r.type?.empty_weight == null ? '-' : `${Number(r.type.empty_weight).toFixed(1)} kg`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {refills?.length ? null : <div className="mt-2 text-sm text-muted">No refills logged.</div>}
          </div>
        </div>
      </div>

      <div className="space-y-6 xl:col-span-2">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold">Readings</div>
            <div className="flex gap-2">
              {['1h', '1d', '1w', '1m'].map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition shadow-sm border border-border/50 ${
                    range === r ? 'bg-accent text-white shadow-accent/20 border-transparent' : 'bg-surface text-text hover:border-accent hover:text-accent'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lineSeries} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                <CartesianGrid stroke="rgba(30,58,95,0.35)" />
                <XAxis dataKey="t" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 10 }} hide />
                <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                <Tooltip content={<TooltipBox />} />
                <Legend />
                <Line type="monotone" dataKey="weight" name="Weight (kg)" stroke="rgba(0,180,216,0.9)" dot={false} animationDuration={800} />
                <Line type="monotone" dataKey="pct" name="Gas %" stroke="rgba(0,230,118,0.75)" dot={false} animationDuration={800} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold">Daily usage (kg/day)</div>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyUsage} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                  <XAxis dataKey="day" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                  <Tooltip content={<TooltipBox />} />
                  <Bar dataKey="kg" name="kg/day" fill="rgba(0,119,182,0.75)" radius={[8, 8, 0, 0]} animationDuration={800} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold">Leakage ppm</div>
            <div className="mt-3 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineSeries} margin={{ left: -10, right: 10, top: 5, bottom: 0 }}>
                  <CartesianGrid stroke="rgba(30,58,95,0.35)" />
                  <XAxis dataKey="t" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 10 }} hide />
                  <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                  <Tooltip content={<TooltipBox />} />
                  <ReferenceLine y={thresholds.leak_warn_ppm} stroke="rgba(245,158,11,0.7)" strokeDasharray="4 4" />
                  <ReferenceLine y={thresholds.leak_danger_ppm} stroke="rgba(255,82,82,0.7)" strokeDasharray="4 4" />
                  <Line type="monotone" dataKey="ppm" name="Leakage (ppm)" stroke="rgba(255,160,0,0.85)" dot={false} animationDuration={800} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 text-xs text-muted">Leak thresholds: warning {thresholds.leak_warn_ppm} ppm | danger {thresholds.leak_danger_ppm} ppm</div>
          </div>
        </div>
      </div>

      </div>

      <Modal open={openRefill} title="Log refill" onClose={() => setOpenRefill(false)}>
        <form onSubmit={submitRefill} className="space-y-3">
          <label className="text-xs text-muted">
            Cylinder type
            <select
              value={refillForm.type_id}
              onChange={(e) => setRefillForm((f) => ({ ...f, type_id: e.target.value }))}
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
          <button className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">
            Save
          </button>
        </form>
      </Modal>
    </div>
  );
}


