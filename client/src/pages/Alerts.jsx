import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BellRing, ChevronDown, Clock3, MapPin } from 'lucide-react';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import ReportDownloadButton from '../components/ReportDownloadButton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson, formatDateTime, getCachedData, subscribeDataRefresh } from '../lib/api.js';
import { downloadAlertsReportPdf } from '../lib/reportPrint.js';

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

function severityCard(sev) {
  if (sev === 'critical') return 'border-danger/30 bg-danger/5 shadow-danger/10';
  if (sev === 'warning') return 'border-warning/30 bg-warning/5 shadow-warning/10';
  return 'border-border/50 bg-surface/70 shadow-sm';
}

function AlertIsland({ alert, open, onToggle, onResolve }) {
  const cylinderName =
    alert.cylinder?.cylinder_num ||
    alert.cylinder?.cylinder_name ||
    alert.cylinder_num ||
    alert.cylinder_name ||
    alert.cylinder?.device_id ||
    'Mapped cylinder';
  const ward = alert.cylinder?.ward || alert.ward;
  const icon = alert.severity === 'critical' ? <AlertTriangle size={18} /> : <BellRing size={18} />;

  return (
    <motion.div layout className="w-full">
      <motion.button
        type="button"
        layout
        onClick={onToggle}
        className={`group w-full overflow-hidden rounded-2xl border p-4 text-left backdrop-blur transition hover:shadow-glow ${severityCard(
          alert.severity
        )}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 rounded-xl border border-border/40 bg-card/30 p-2 text-muted">{icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${severityPill(alert.severity)}`}>
                    {alert.severity}
                  </span>
                  <div className="truncate text-base font-semibold text-text">{cylinderName}</div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted">
                  <span className="inline-flex items-center gap-1">
                    <BellRing size={13} />
                    {alert.alert_type || 'Alert'}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={13} />
                    {formatDateTime(alert.created_at)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} />
                    {ward || 'Ward not assigned'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border/40 bg-card/20 px-3 py-2 text-sm text-muted">
              {alert.message || 'No additional message provided for this alert.'}
            </div>
          </div>

          <div className="flex shrink-0 items-start">
            <div className="rounded-full border border-border/40 bg-card/20 p-2 text-muted transition group-hover:text-text">
              <ChevronDown size={16} className={`transition duration-200 ${open ? 'rotate-180' : ''}`} />
            </div>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="open"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22 }}
              className="mt-4"
            >
              <div className="rounded-2xl border border-border/50 bg-card/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-border/40 bg-surface/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Time</div>
                    <div className="mt-1 text-sm font-medium text-text">{formatDateTime(alert.created_at)}</div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-surface/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Ward</div>
                    <div className="mt-1 text-sm font-medium text-text">{ward || '-'}</div>
                  </div>
                  <div className="rounded-xl border border-border/40 bg-surface/60 p-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted">Severity</div>
                    <div className="mt-1 text-sm font-medium capitalize text-text">{alert.severity || '-'}</div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-muted">Review the alert details and resolve it once the issue is handled.</div>
                  <button
                    type="button"
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
  const cacheKey = '/api/alerts?status=active&limit=200';
  const [alerts, setAlerts] = useState(() => getCachedData(cacheKey)?.alerts || []);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(() => !getCachedData(cacheKey));
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    async function load() {
      if (!getCachedData(cacheKey)) setLoading(true);
      try {
        const data = await apiJson('/api/alerts?status=active&limit=200', {
          token: accessToken,
          cacheKey
        });
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

  useEffect(() => {
    const unsubscribe = subscribeDataRefresh(({ tags }) => {
      if (tags.some((tag) => ['alerts', 'dashboard', 'cylinders'].includes(tag)) && accessToken) {
        apiJson('/api/alerts?status=active&limit=200', {
          token: accessToken,
          cacheKey
        })
          .then((data) => setAlerts(data.alerts || []))
          .catch(() => {});
      }
    });
    return unsubscribe;
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

    const most = Array.from(byWard.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
    return { total, critical, most };
  }, [alerts]);

  async function resolveAlert(id) {
    try {
      const res = await apiJson(`/api/alerts/${id}/resolve`, {
        token: accessToken,
        method: 'PATCH',
        queueOffline: true
      });
      toast.success('Alert resolved');
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      if (openId === id) setOpenId(null);
      if (res?.queued) toast.success('Stored offline. It will sync automatically when internet is back.');
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-text">Alerts Center</h2>
          <p className="mt-0.5 text-xs text-muted">Track active incidents, severity trends, and fast resolution context</p>
        </div>
        <ReportDownloadButton onGenerate={() => downloadAlertsReportPdf({ alerts, filtered, stats, tab })} />
      </div>

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
            type="button"
            onClick={() => setTab(t.key)}
            className={`rounded-xl border border-border/50 px-4 py-2 text-sm font-medium shadow-sm transition ${
              tab === t.key
                ? 'border-transparent bg-accent text-white shadow-accent/20'
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
                  className="rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur"
                >
                  <div className="flex items-start gap-3">
                    <Skeleton
                      circle
                      height={40}
                      width={40}
                      baseColor="rgba(100,116,139,0.15)"
                      highlightColor="rgba(0,180,216,0.1)"
                    />
                    <div className="flex-1">
                      <Skeleton height={16} width={240} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
                      <div className="mt-2">
                        <Skeleton
                          height={12}
                          width={340}
                          baseColor="rgba(100,116,139,0.15)"
                          highlightColor="rgba(0,180,216,0.1)"
                        />
                      </div>
                      <div className="mt-3">
                        <Skeleton
                          height={52}
                          borderRadius={16}
                          baseColor="rgba(100,116,139,0.15)"
                          highlightColor="rgba(0,180,216,0.1)"
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))
            : filtered.map((a) => (
                <motion.div key={a.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
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

