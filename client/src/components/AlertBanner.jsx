import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

function severityStyle(sev) {
  if (sev === 'critical') return 'border-danger/40 bg-danger/10 text-danger';
  if (sev === 'warning') return 'border-warning/40 bg-warning/10 text-warning';
  return 'border-border/60 bg-card/30 text-muted';
}

export default function AlertBanner({ alerts = [] }) {
  const [dismissed, setDismissed] = useState(() => new Set());
  const [open, setOpen] = useState(false);

  const active = useMemo(
    () => alerts.filter((a) => !a.is_resolved && !dismissed.has(a.id)),
    [alerts, dismissed]
  );
  const top = active.slice(0, 5);

  if (active.length === 0) return null;

  return (
    <motion.div layout className="relative z-10 flex justify-center">
      <motion.button
        layout
        onClick={() => setOpen((v) => !v)}
        className="group relative w-full max-w-3xl overflow-hidden rounded-full border border-border/60 bg-surface/70 px-4 py-2 shadow-sm backdrop-blur transition hover:border-accent/35"
        aria-label="Toggle live alerts"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
            </span>
            <span className="text-sm font-medium text-text/90">Live alerts</span>
            <span className="rounded-full bg-card/30 px-2 py-0.5 text-xs text-muted ring-1 ring-border/40">
              {active.length}
            </span>
          </div>
          <div className="text-xs text-muted">{open ? 'Tap to collapse' : 'Tap to expand'}</div>
        </div>

        <AnimatePresence initial={false}>
          {open ? (
            <motion.div
              key="open"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-3"
            >
              <div className="flex flex-wrap gap-2">
                {top.map((a) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${severityStyle(
                      a.severity
                    )}`}
                  >
                    <span className="font-medium">{a.alert_type}</span>
                    <span className="text-text/70">{a.message}</span>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDismissed((s) => {
                          const next = new Set(s);
                          next.add(a.id);
                          return next;
                        });
                      }}
                      className="rounded-full p-1 transition hover:bg-card/40"
                      aria-label="Dismiss alert"
                    >
                      <X size={14} />
                    </button>
                  </motion.div>
                ))}
              </div>
              {active.length > 5 ? (
                <div className="mt-2 text-xs text-muted">+{active.length - 5} more active alerts</div>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
}
