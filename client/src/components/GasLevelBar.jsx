import React, { useMemo } from 'react';

function getGradient(pct) {
  if (pct >= 60) return 'from-emerald-400 to-emerald-600';
  if (pct >= 30) return 'from-amber-400 to-amber-600';
  return 'from-rose-400 to-rose-600';
}

export default function GasLevelBar({ pct = 0 }) {
  const width = Math.max(0, Math.min(100, Number(pct) || 0));
  const gradient = useMemo(() => getGradient(width), [width]);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Gas level</span>
        <span className="font-mono text-text/90">{width.toFixed(1)}%</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-border/40">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradient} transition-all`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}
