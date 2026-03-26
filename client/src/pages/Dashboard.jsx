import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Droplets,
  Gauge,
  PackageOpen,
  Percent,
  ShieldAlert,
  TrendingUp
} from 'lucide-react';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import AlertBanner from '../components/AlertBanner.jsx';
import StatCard from '../components/StatCard.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useCylinders } from '../hooks/useCylinders.js';
import { useRealtime } from '../hooks/useRealtime.js';
import { useStockOverview } from '../hooks/useStockOverview.js';
import { apiJson, formatDateTime, notifyDataRefresh, subscribeDataRefresh } from '../lib/api.js';
import { parseBooleanFlag } from '../lib/booleanFlag.js';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/60 bg-surface/90 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <div className="font-semibold">{label}</div>
      <div className="mt-1 text-muted">{Number(payload[0].value || 0).toFixed(2)} kg</div>
    </div>
  );
}

function panelShell(title, subtitle, body) {
  return (
    <div className="rounded-[1.75rem] border border-border/50 bg-surface/78 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-text">{title}</div>
          {subtitle ? <div className="mt-1 text-xs text-muted">{subtitle}</div> : null}
        </div>
      </div>
      <div className="mt-4">{body}</div>
    </div>
  );
}

function statusTone(item) {
  if (item.hasCriticalAlert || item.leakDetected) return 'border-danger/30 bg-danger/6';
  if (item.gasPct < 20 || item.hasWarningAlert) return 'border-warning/30 bg-warning/8';
  return 'border-border/40 bg-card/20';
}

export default function Dashboard() {
  const { accessToken } = useAuth();
  const { cylinders, loading: cylindersLoading } = useCylinders();
  const { data: stockData, loading: stockLoading, refetch: refetchStock } = useStockOverview();
  const [alerts, setAlerts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [recentRefills, setRecentRefills] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const geminiOverrideKey = useMemo(() => localStorage.getItem('oxytrace-gemini-key') || '', []);
  const geminiOverrideModel = useMemo(() => localStorage.getItem('oxytrace-gemini-model') || '', []);
  const geminiOverrideTemp = useMemo(() => localStorage.getItem('oxytrace-gemini-temp') || '', []);

  const refreshDashboard = useCallback(async () => {
    if (!accessToken) return;
    try {
      const [alertRes, summaryRes, refillRes] = await Promise.all([
        apiJson('/api/alerts?status=active&limit=12', { token: accessToken }),
        apiJson('/api/analytics/summary', { token: accessToken }),
        apiJson('/api/refills', { token: accessToken })
      ]);
      setAlerts(alertRes.alerts || []);
      setSummary(summaryRes);
      setRecentRefills((refillRes.refills || []).slice(0, 6));
    } catch {
      // ignore dashboard fetch failures to preserve stale data
    } finally {
      setDashboardLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refreshDashboard();
    const timer = setInterval(refreshDashboard, 20000);
    return () => clearInterval(timer);
  }, [refreshDashboard]);

  useEffect(() => {
    const unsubscribe = subscribeDataRefresh(({ tags }) => {
      if (tags.some((tag) => ['dashboard', 'alerts', 'refills', 'cylinders', 'stock', 'settings'].includes(tag))) {
        refreshDashboard();
        refetchStock();
      }
    });
    return unsubscribe;
  }, [refreshDashboard, refetchStock]);

  useRealtime(
    () => {
      refreshDashboard();
    },
    (alert) => {
      refreshDashboard();
      notifyDataRefresh(['alerts', 'dashboard']);
      if (alert.alert_type === 'LEAK_DANGER') {
        toast.error(alert.message || 'Cylinder leak detected');
      }
    }
  );

  async function refreshAI() {
    setAiLoading(true);
    try {
      const res = await apiJson('/api/ai/summary', {
        token: accessToken,
        method: 'POST',
        headers: {
          ...(geminiOverrideKey ? { 'x-gemini-key': geminiOverrideKey } : {}),
          ...(geminiOverrideModel ? { 'x-gemini-model': geminiOverrideModel } : {}),
          ...(geminiOverrideTemp ? { 'x-gemini-temp': geminiOverrideTemp } : {})
        },
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

  const alertsByCylinder = useMemo(() => {
    const map = new Map();
    for (const alert of alerts) {
      const key = String(alert.cylinder_id || alert.esp32_device_id || '');
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(alert);
    }
    return map;
  }, [alerts]);

  const riskWatchlist = useMemo(() => {
    return cylinders
      .map((cylinder) => {
        const latest = cylinder.latest_reading || {};
        const cylinderAlerts =
          alertsByCylinder.get(String(cylinder.id || '')) ||
          alertsByCylinder.get(String(cylinder.device_id || cylinder.esp32_device_id || '')) ||
          [];
        const gasPct = Number(cylinder.gas_percent ?? latest.gas_level_pct ?? 0);
        const leakDetected = parseBooleanFlag(cylinder.leak_detect ?? latest.leak_detect) ?? false;
        const riskScore =
          cylinderAlerts.some((alert) => alert.severity === 'critical') * 100 +
          Math.max(0, 100 - gasPct) +
          (leakDetected ? 80 : 0);
        return {
          id: cylinder.id,
          name: cylinder.cylinder_num || cylinder.cylinder_name || 'Cylinder',
          ward: cylinder.ward || 'Unassigned',
          floor: cylinder.floor || cylinder.floor_name || '-',
          gasPct,
          leakDetected,
          hasCriticalAlert: cylinderAlerts.some((alert) => alert.severity === 'critical'),
          hasWarningAlert: cylinderAlerts.some((alert) => alert.severity === 'warning'),
          lastSeen: latest.created_at || cylinder.timestamp || null,
          riskScore
        };
      })
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 6);
  }, [alertsByCylinder, cylinders]);

  const wardPulse = useMemo(() => {
    const wardMap = new Map();
    for (const cylinder of cylinders) {
      const ward = cylinder.ward || 'Unassigned';
      if (!wardMap.has(ward)) {
        wardMap.set(ward, { ward, cylinders: 0, avgGas: 0, critical: 0, warnings: 0 });
      }
      const row = wardMap.get(ward);
      row.cylinders += 1;
      row.avgGas += Number(cylinder.gas_percent ?? cylinder.latest_reading?.gas_level_pct ?? 0);
      const cylinderAlerts =
        alertsByCylinder.get(String(cylinder.id || '')) ||
        alertsByCylinder.get(String(cylinder.device_id || cylinder.esp32_device_id || '')) ||
        [];
      row.critical += cylinderAlerts.filter((alert) => alert.severity === 'critical').length;
      row.warnings += cylinderAlerts.filter((alert) => alert.severity === 'warning').length;
    }
    return Array.from(wardMap.values())
      .map((row) => ({
        ...row,
        avgGas: row.cylinders ? row.avgGas / row.cylinders : 0
      }))
      .sort((a, b) => b.critical - a.critical || a.avgGas - b.avgGas)
      .slice(0, 6);
  }, [alertsByCylinder, cylinders]);

  const lowGasCount = useMemo(
    () => cylinders.filter((cylinder) => Number(cylinder.gas_percent ?? cylinder.latest_reading?.gas_level_pct ?? 0) < 20).length,
    [cylinders]
  );

  const usageSeries = summary?.usageLast7Days || [];
  const stockInventory = stockData?.inventory || [];
  const upcomingDeliveries = stockData?.upcoming_deliveries || [];
  const activeAlerts = alerts.filter((alert) => !alert.is_resolved);

  const statTotal = summary?.kpis?.totalCylinders ?? cylinders.length;
  const statCritical = activeAlerts.filter((alert) => alert.severity === 'critical').length;
  const statAvgGas =
    summary?.kpis?.avgGasLevelPct ??
    (cylinders.length ? cylinders.reduce((sum, cylinder) => sum + Number(cylinder.gas_percent ?? cylinder.latest_reading?.gas_level_pct ?? 0), 0) / cylinders.length : 0);
  const statFullStock = Number(stockData?.kpis?.cylinders_full || 0);

  const isLoading = dashboardLoading || cylindersLoading;

  return (
    <div className="relative">
      <div className="mesh-bg" />
      <div className="relative z-10 space-y-6">
        <AlertBanner alerts={alerts} />

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatCard icon={Droplets} label="Mapped Cylinders" value={statTotal} colorClass="border-accent" />
          <StatCard icon={ShieldAlert} label="Critical Incidents" value={statCritical} colorClass="border-danger" />
          <StatCard icon={Gauge} label="Low Gas Cylinders" value={lowGasCount} colorClass="border-warning" />
          <StatCard icon={PackageOpen} label="Full Stock Ready" value={statFullStock} colorClass="border-success" />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.3fr_0.9fr]">
          {panelShell(
            'Safety Watchlist',
            'Highest-risk cylinders across leak, gas, and active alert signals.',
            isLoading ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="rounded-2xl border border-border/40 bg-card/20 p-4">
                    <Skeleton height={18} width={140} />
                    <div className="mt-3">
                      <Skeleton height={12} count={3} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {riskWatchlist.map((item) => (
                  <div key={item.id} className={`rounded-2xl border p-4 ${statusTone(item)}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text">{item.name}</div>
                        <div className="mt-1 text-xs text-muted">
                          {item.ward} · {item.floor}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.hasCriticalAlert ? 'bg-danger text-white' : item.hasWarningAlert ? 'bg-warning text-white' : 'bg-card/40 text-text'}`}>
                        {item.hasCriticalAlert ? 'Critical' : item.hasWarningAlert ? 'Watch' : 'Stable'}
                      </span>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-xl border border-border/40 bg-background/40 p-2">
                        <div className="text-muted">Gas</div>
                        <div className="mt-1 font-mono text-text">{item.gasPct.toFixed(1)}%</div>
                      </div>
                      <div className="rounded-xl border border-border/40 bg-background/40 p-2">
                        <div className="text-muted">Leak</div>
                        <div className={`mt-1 font-mono ${item.leakDetected ? 'text-danger' : 'text-success'}`}>{item.leakDetected ? 'Detected' : 'Clear'}</div>
                      </div>
                      <div className="rounded-xl border border-border/40 bg-background/40 p-2">
                        <div className="text-muted">Seen</div>
                        <div className="mt-1 text-text">{item.lastSeen ? formatDateTime(item.lastSeen) : 'No data'}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {!riskWatchlist.length ? (
                  <div className="rounded-2xl border border-border/40 bg-card/20 p-4 text-sm text-muted">
                    No mapped cylinders are currently streaming telemetry.
                  </div>
                ) : null}
              </div>
            )
          )}

          {panelShell(
            'Ward Pulse',
            'Which wards need attention first.',
            isLoading ? (
              <Skeleton count={6} height={42} />
            ) : (
              <div className="space-y-3">
                {wardPulse.map((ward) => (
                  <div key={ward.ward} className="rounded-2xl border border-border/40 bg-card/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-text">{ward.ward}</div>
                        <div className="mt-1 text-xs text-muted">{ward.cylinders} cylinders monitored</div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-text">{ward.avgGas.toFixed(1)}%</div>
                        <div className="mt-1 text-xs text-muted">average gas</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-danger/10 px-2.5 py-1 text-danger">{ward.critical} critical</span>
                      <span className="rounded-full bg-warning/10 px-2.5 py-1 text-warning">{ward.warnings} warning</span>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
          <div className="self-start xl:col-span-2">
            <div className="space-y-6">
              {panelShell(
                'Hospital O2 Consumption',
                'Seven-day usage trend from live telemetry.',
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={usageSeries} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="oxyFillDashboard" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="rgba(0,180,216,0.50)" />
                          <stop offset="100%" stopColor="rgba(0,180,216,0.05)" />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="day" tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                      <YAxis tick={{ fill: 'rgba(100,116,139,0.9)', fontSize: 11 }} />
                      <Tooltip content={<ChartTooltip />} />
                      <Area type="monotone" dataKey="kg" stroke="rgba(0,180,216,0.9)" fill="url(#oxyFillDashboard)" animationDuration={800} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {panelShell(
                'OxyTrace AI',
                'A concise system summary generated from current alerts and mapped cylinders.',
                <div>
                  <div className="text-sm text-muted">
                    {aiText ? aiText : 'Generate a status brief with risks, operational priorities, and recommended next actions.'}
                  </div>
                  <button
                    onClick={refreshAI}
                    disabled={aiLoading}
                    className="mt-4 rounded-xl border border-border/50 bg-surface px-3 py-2 text-xs font-semibold text-text shadow-sm transition hover:border-accent hover:text-accent disabled:opacity-60"
                  >
                    {aiLoading ? 'Refreshing...' : 'Refresh AI Summary'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="self-start space-y-6">
            {panelShell(
              'Inventory Pressure',
              'Stock posture and expected deliveries from procurement.',
              stockLoading ? (
                <Skeleton count={6} height={26} />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-border/40 bg-card/20 p-3">
                      <div className="text-xs text-muted">Pending orders</div>
                      <div className="mt-2 text-xl font-semibold text-text">{Number(stockData?.kpis?.pending_orders || 0)}</div>
                    </div>
                    <div className="rounded-2xl border border-border/40 bg-card/20 p-3">
                      <div className="text-xs text-muted">Low stock alerts</div>
                      <div className="mt-2 text-xl font-semibold text-text">{Number(stockData?.kpis?.low_stock_alerts || 0)}</div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {stockInventory.slice(0, 4).map((row) => (
                      <div key={row.id} className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2">
                        <div>
                          <div className="text-sm font-medium text-text">{row.cylinder_size}</div>
                          <div className="mt-1 text-xs text-muted">{row.gas_type || 'oxygen'}</div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="font-semibold text-text">{Number(row.quantity_full || 0)} full</div>
                          <div className="mt-1 text-muted">{Number(row.quantity_in_use || 0)} in use</div>
                        </div>
                      </div>
                    ))}
                    {!stockInventory.length ? <div className="text-sm text-muted">No stock inventory found.</div> : null}
                  </div>
                  {upcomingDeliveries[0] ? (
                    <div className="rounded-2xl border border-accent/20 bg-accent/6 p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Next expected delivery</div>
                      <div className="mt-2 text-sm font-semibold text-text">{upcomingDeliveries[0].order_number}</div>
                      <div className="mt-1 text-xs text-muted">
                        {upcomingDeliveries[0].supplier?.supplier_name || 'Supplier'} · {formatDateTime(upcomingDeliveries[0].expected_delivery_date)}
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {panelShell(
            'Recent Refill Activity',
            'Latest refill events flowing in from cylinder operations.',
            dashboardLoading ? (
              <Skeleton count={5} height={42} />
            ) : (
              <div className="space-y-3">
                {recentRefills.map((refill) => (
                  <div key={refill.id} className="flex items-center justify-between rounded-2xl border border-border/40 bg-card/20 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-text">
                        {refill.cylinder?.cylinder_num || refill.cylinder?.cylinder_name || 'Cylinder'}
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {refill.cylinder?.ward || 'Unassigned'} · {refill.type?.type_name || 'Type not set'}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted">{formatDateTime(refill.refill_time)}</div>
                  </div>
                ))}
                {!recentRefills.length ? <div className="text-sm text-muted">No refill activity logged yet.</div> : null}
              </div>
            )
          )}

          {panelShell(
            'Alert Queue',
            'Newest unresolved incidents across the active workspace.',
            dashboardLoading ? (
              <Skeleton count={5} height={42} />
            ) : (
              <div className="space-y-3">
                {activeAlerts.slice(0, 6).map((alert) => (
                  <div key={alert.id} className="rounded-2xl border border-border/40 bg-card/20 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          {alert.severity === 'critical' ? (
                            <AlertTriangle size={16} className="text-danger" />
                          ) : (
                            <BellRing size={16} className="text-warning" />
                          )}
                          <span className="text-sm font-semibold text-text">
                            {alert.cylinder?.cylinder_num || alert.cylinder?.cylinder_name || alert.alert_type}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-muted">{alert.message}</div>
                      </div>
                      <div className="text-right text-xs text-muted">{formatDateTime(alert.created_at)}</div>
                    </div>
                  </div>
                ))}
                {!activeAlerts.length ? <div className="text-sm text-muted">No active alerts in the queue.</div> : null}
              </div>
            )
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-[1.5rem] border border-border/50 bg-surface/78 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Activity size={16} className="text-accent" />
              Live telemetry coverage
            </div>
            <div className="mt-3 text-3xl font-semibold text-text">
              {cylinders.filter((cylinder) => cylinder.latest_reading?.created_at).length}
            </div>
            <div className="mt-1 text-xs text-muted">cylinders with recent telemetry payloads</div>
          </div>
          <div className="rounded-[1.5rem] border border-border/50 bg-surface/78 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <TrendingUp size={16} className="text-success" />
              Average gas level
            </div>
            <div className="mt-3 text-3xl font-semibold text-text">{statAvgGas.toFixed(1)}%</div>
            <div className="mt-1 text-xs text-muted">across currently mapped cylinders</div>
          </div>
          <div className="rounded-[1.5rem] border border-border/50 bg-surface/78 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center gap-2 text-sm font-semibold text-text">
              <Percent size={16} className="text-warning" />
              Active alert load
            </div>
            <div className="mt-3 text-3xl font-semibold text-text">{activeAlerts.length}</div>
            <div className="mt-1 text-xs text-muted">unresolved incidents requiring follow-up</div>
          </div>
        </div>
      </div>
    </div>
  );
}


