import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson, formatDateTime } from '../lib/api.js';

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
  { key: 'info', label: 'Info' }
];

function severityPill(sev) {
  if (sev === 'critical') return 'bg-danger/12 text-danger ring-1 ring-danger/25';
  if (sev === 'warning') return 'bg-warning/12 text-warning ring-1 ring-warning/25';
  return 'bg-card/30 text-muted ring-1 ring-border/40';
}

function severityIsland(sev) {
  if (sev === 'critical') return 'border-danger/35 bg-danger/6';
  if (sev === 'warning') return 'border-warning/35 bg-warning/6';
  return 'border-border/60 bg-surface/70';
}

function AlertIsland({ alert, open, onToggle, onResolve }) {
  const cylinderName = alert.cylinder?.cylinder_name || alert.cylinder_name || alert.esp32_device_id;
  const ward = alert.cylinder?.ward || alert.ward;

  return (
    <motion.div layout className="w-full">
      <motion.button
        layout
        onClick={onToggle}
        className={`group w-full overflow-hidden rounded-full border px-4 py-3 text-left shadow-sm backdrop-blur transition hover:shadow-glow ${severityIsland(
          alert.severity
        )}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${severityPill(alert.severity)}`}>
                {alert.severity}
              </span>
              <div className="truncate text-sm font-semibold">{cylinderName}</div>
              {ward ? <div className="hidden truncate text-xs text-muted sm:block">· {ward}</div> : null}
            </div>
            <div className="mt-1 truncate text-xs text-muted">
              <span className="font-medium text-text/80">{alert.alert_type}</span>
              {alert.message ? <span className="text-muted"> — {alert.message}</span> : null}
            </div>
          </div>
          <div className="shrink-0 text-xs text-muted">{open ? 'Details' : formatDateTime(alert.created_at)}</div>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="open"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="mt-3"
            >
              <div className="rounded-2xl border border-border/50 bg-card/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-[11px] text-muted">Time</div>
                    <div className="mt-1 text-sm">{formatDateTime(alert.created_at)}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Ward</div>
                    <div className="mt-1 text-sm">{ward || '—'}</div>
                  </div>
                  <div>
                    <div className="text-[11px] text-muted">Severity</div>
                    <div className="mt-1 text-sm">{alert.severity || '—'}</div>
                  </div>
                </div>

                {alert.message ? (
                  <div className="mt-3 text-sm text-muted">{alert.message}</div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted">Tap again to collapse</div>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onResolve();
                    }}
                    className="rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
                  >
                    Resolve
                  </button>
                </div>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
}

export default function Alerts() {
  const { accessToken } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await apiJson('/api/alerts?status=active&limit=200', { token: accessToken });
        if (!cancelled) setAlerts(data.alerts || []);
      } catch (e) {
        toast.error(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const t = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accessToken]);

  const filtered = useMemo(() => {
    if (tab === 'all') return alerts;
    return alerts.filter((a) => (a.severity || '').toLowerCase() === tab);
  }, [alerts, tab]);

  const stats = useMemo(() => {
    const total = alerts.length;
    const critical = alerts.filter((a) => a.severity === 'critical').length;
    const byWard = new Map();
    for (const a of alerts) {
      const w = a.cylinder?.ward || a.ward || 'Unknown';
      byWard.set(w, (byWard.get(w) || 0) + 1);
    }
    const most = Array.from(byWard.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
    return { total, critical, most };
  }, [alerts]);

  async function resolveAlert(id) {
    try {
      await apiJson(`/api/alerts/${id}/resolve`, { token: accessToken, method: 'PATCH' });
      toast.success('Alert resolved');
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      if (openId === id) setOpenId(null);
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-xs text-muted">Active alerts</div>
          <div className="mt-2 text-2xl font-semibold">{loading ? <Skeleton width={40} /> : stats.total}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-xs text-muted">Critical</div>
          <div className="mt-2 text-2xl font-semibold text-danger">{loading ? <Skeleton width={40} /> : stats.critical}</div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur md:col-span-2">
          <div className="text-xs text-muted">Most affected ward</div>
          <div className="mt-2 text-2xl font-semibold">{loading ? <Skeleton width={120} /> : stats.most}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition shadow-sm border border-border/50 ${
              tab === t.key
                ? 'bg-accent text-white shadow-accent/20 border-transparent'
                : 'bg-surface text-text hover:border-accent hover:text-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <motion.div
                  key={`sk-${i}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-full border border-border/50 bg-surface/80 px-4 py-3 shadow-sm backdrop-blur"
                >
                  <Skeleton height={14} width={260} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                  <div className="mt-2">
                    <Skeleton height={12} width={420} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                  </div>
                </motion.div>
              ))
            : filtered.map((a) => (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  <AlertIsland
                    alert={a}
                    open={openId === a.id}
                    onToggle={() => setOpenId((cur) => (cur === a.id ? null : a.id))}
                    onResolve={() => resolveAlert(a.id)}
                  />
                </motion.div>
              ))}
        </AnimatePresence>

        {!loading && filtered.length === 0 ? (
          <div className="rounded-2xl border border-border/50 bg-surface/70 p-6 text-sm text-muted shadow-sm backdrop-blur">
            No alerts.
          </div>
        ) : null}
      </div>
    </div>
  );
}
