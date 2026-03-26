import React, { useMemo, useState } from 'react';
import { AlertTriangle, BellRing, ChevronDown, Siren, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function severityTheme(severity) {
  if (severity === 'critical') {
    return {
      tone: 'Critical',
      icon: Siren,
      shell: 'border-danger/35 bg-danger/10 text-danger',
      badge: 'bg-danger text-white',
      dot: 'bg-danger'
    };
  }
  if (severity === 'warning') {
    return {
      tone: 'Warning',
      icon: AlertTriangle,
      shell: 'border-warning/35 bg-warning/10 text-warning',
      badge: 'bg-warning text-white',
      dot: 'bg-warning'
    };
  }
  return {
    tone: 'Info',
    icon: BellRing,
    shell: 'border-border/50 bg-card/30 text-muted',
    badge: 'bg-card/60 text-text',
    dot: 'bg-accent'
  };
}

export default function AlertBanner({ alerts = [] }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const [open, setOpen] = useState(true);

  const active = useMemo(
    () => alerts.filter((alert) => !alert.is_resolved && !dismissed.has(alert.id)),
    [alerts, dismissed]
  );

  const featured = active.slice(0, 3);
  const criticalCount = active.filter((alert) => alert.severity === 'critical').length;
  const warningCount = active.filter((alert) => alert.severity === 'warning').length;

  if (active.length === 0) return null;

  return (
    <motion.section
      layout
      className="relative overflow-hidden rounded-[2rem] border border-border/50 bg-surface/78 shadow-xl backdrop-blur"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,82,82,0.12),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(255,160,0,0.1),transparent_24%)]" />

      <div className="relative z-10 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-danger/25 bg-danger/12 text-danger shadow-lg shadow-danger/10">
                <BellRing size={20} />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold text-text">Active system alerts</h3>
                  <span className="rounded-full bg-danger px-2.5 py-1 text-xs font-semibold text-white">
                    {active.length}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  Live incidents affecting cylinders, wards, and monitoring devices.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="rounded-2xl border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                <span className="font-semibold">{criticalCount}</span> critical
              </div>
              <div className="rounded-2xl border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-warning">
                <span className="font-semibold">{warningCount}</span> warning
              </div>
              <div className="rounded-2xl border border-border/40 bg-background/50 px-3 py-2 text-sm text-muted">
                Showing top {featured.length} alerts
              </div>
            </div>
          </div>

          <button
            onClick={() => setOpen((value) => !value)}
            className="inline-flex items-center gap-2 self-start rounded-2xl border border-border/50 bg-background/60 px-4 py-2 text-sm font-medium text-text transition hover:border-accent hover:text-accent"
          >
            {open ? 'Collapse' : 'Expand'}
            <ChevronDown size={16} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="alerts-open"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28 }}
              className="mt-5"
            >
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
                {featured.map((alert, index) => {
                  const theme = severityTheme(alert.severity);
                  const Icon = theme.icon;
                  return (
                    <motion.article
                      key={alert.id}
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.25, delay: index * 0.04 }}
                      className={`rounded-[1.5rem] border p-4 shadow-lg backdrop-blur ${theme.shell}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex h-9 w-9 items-center justify-center rounded-2xl ${theme.badge}`}>
                              <Icon size={16} />
                            </span>
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold text-text">
                                {alert.cylinder?.cylinder_num || alert.cylinder?.cylinder_name || alert.alert_type}
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-xs">
                                <span className={`h-2 w-2 rounded-full ${theme.dot}`} />
                                <span className="uppercase tracking-[0.18em]">{theme.tone}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() =>
                            setDismissed((current) => {
                              const next = new Set(current);
                              next.add(alert.id);
                              return next;
                            })
                          }
                          className="rounded-xl border border-border/40 bg-background/40 p-2 text-muted transition hover:border-danger/30 hover:text-danger"
                          aria-label="Dismiss alert"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="mt-4 space-y-3">
                        <p className="whitespace-pre-wrap text-sm leading-6 text-text/85">{alert.message}</p>

                        <div className="flex flex-wrap gap-2 text-xs">
                          {alert.cylinder?.ward ? (
                            <span className="rounded-full border border-border/40 bg-background/40 px-2.5 py-1 text-muted">
                              {alert.cylinder.ward}
                            </span>
                          ) : null}
                          {alert.cylinder?.location ? (
                            <span className="rounded-full border border-border/40 bg-background/40 px-2.5 py-1 text-muted">
                              {alert.cylinder.location}
                            </span>
                          ) : null}
                          <span className="rounded-full border border-border/40 bg-background/40 px-2.5 py-1 text-muted">
                            {alert.alert_type}
                          </span>
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
              </div>

              {active.length > featured.length ? (
                <div className="mt-3 text-sm text-muted">
                  +{active.length - featured.length} more active alerts in the queue
                </div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
