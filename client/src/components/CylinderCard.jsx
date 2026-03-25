import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Droplets, Flame, Gauge, Lock, LockOpen } from 'lucide-react';
import GasLevelBar from './GasLevelBar.jsx';
import { useNavigate } from 'react-router-dom';
import { formatDateTime } from '../lib/api.js';

function wardColor(ward) {
  const w = (ward || '').toLowerCase();
  if (w.includes('icu')) return 'bg-rose-500/15 text-rose-400 ring-1 ring-rose-500/20';
  if (w.includes('er') || w.includes('emergency'))
    return 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20';
  if (w.includes('ot') || w.includes('theatre'))
    return 'bg-cyan-500/15 text-cyan-400 ring-1 ring-cyan-500/20';
  return 'bg-accent/10 text-accent ring-1 ring-accent/15';
}

export default function CylinderCard({ cylinder, thresholds }) {
  const nav = useNavigate();
  const r = cylinder.latest_reading || {};
  const pct = Number(r.gas_level_pct ?? 0);
  const isValveOpen = r.valve_open == null ? null : Boolean(r.valve_open);
  const livePulse = cylinder._livePulseAt && Date.now() - cylinder._livePulseAt < 5000;
  const deviceId = cylinder.device_id || cylinder.esp32_device_id || null;
  const lastSeen = r.created_at || cylinder.timestamp || null;
  const weightKg = r.gas_weight_kg ?? r.current_weight ?? cylinder.weight ?? null;
  const leakagePpm = r.leakage_ppm ?? null;

  const borderPulse = useMemo(
    () => (cylinder._hasAlert ? 'ring-2 ring-danger/30' : ''),
    [cylinder._hasAlert]
  );
  const gasTone = pct <= Number(thresholds?.danger_gas_pct ?? 10) ? 'text-danger' : pct <= Number(thresholds?.low_gas_pct ?? 20) ? 'text-warning' : 'text-success';
  const leakTone = Number(leakagePpm ?? 0) >= Number(thresholds?.leak_danger_ppm ?? 200) ? 'text-danger' : Number(leakagePpm ?? 0) >= Number(thresholds?.leak_warn_ppm ?? 120) ? 'text-warning' : 'text-success';

  return (
    <motion.button
      onClick={() => nav(`/cylinders/${cylinder.id}`)}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className={`group relative w-full rounded-2xl border border-border/50 bg-surface/70 p-4 text-left shadow-sm backdrop-blur transition hover:shadow-glow ${borderPulse}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-base font-semibold">{cylinder.cylinder_num || cylinder.cylinder_name}</div>
            {livePulse ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs text-success ring-1 ring-success/20">
                <span className="h-2 w-2 animate-pulse rounded-full bg-success" /> Live
              </span>
            ) : null}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted">
            <span className={`rounded-full px-2 py-0.5 ${wardColor(cylinder.ward)}`}>{cylinder.ward}</span>
            <span>{cylinder.floor || cylinder.floor_name || cylinder.location}</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Device: <span className="font-mono text-text/80">{deviceId || 'Not mapped'}</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Updated: <span className="text-text/80">{lastSeen ? formatDateTime(lastSeen) : 'No live data'}</span>
          </div>
        </div>
        <div
          className={`rounded-full px-2 py-1 text-xs font-medium ${
            isValveOpen
              ? 'bg-success/10 text-success ring-1 ring-success/20'
              : isValveOpen === false
                ? 'bg-danger/10 text-danger ring-1 ring-danger/20'
                : 'bg-muted/10 text-muted ring-1 ring-border/40'
          }`}
        >
          {isValveOpen ? (
            <span className="inline-flex items-center gap-1">
              <LockOpen size={14} /> OPEN
            </span>
          ) : isValveOpen === false ? (
            <span className="inline-flex items-center gap-1">
              <Lock size={14} /> CLOSED
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Lock size={14} /> UNKNOWN
            </span>
          )}
        </div>
      </div>

      <div className="mt-4">
        <GasLevelBar pct={pct} />
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className={gasTone}>Gas threshold: {thresholds?.low_gas_pct ?? 20}% / {thresholds?.danger_gas_pct ?? 10}%</span>
          <span className={leakTone}>Leak threshold: {thresholds?.leak_warn_ppm ?? 120} / {thresholds?.leak_danger_ppm ?? 200} ppm</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-xl border border-border/50 bg-card/30 p-2">
          <div className="flex items-center gap-1 text-muted">
            <Gauge size={14} /> Weight
          </div>
          <div className="mt-1 font-mono text-sm text-text/90">{weightKg == null ? '--' : `${Number(weightKg).toFixed(1)} kg`}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/30 p-2">
          <div className="flex items-center gap-1 text-muted">
            <Flame size={14} /> Leakage
          </div>
          <div className="mt-1 font-mono text-sm text-text/90">{leakagePpm == null ? '--' : `${Number(leakagePpm).toFixed(0)} ppm`}</div>
        </div>
        <div className="rounded-xl border border-border/50 bg-card/30 p-2">
          <div className="flex items-center gap-1 text-muted">
            <Droplets size={14} /> Gas Level
          </div>
          <div className="mt-1 font-mono text-sm text-text/90">{r.gas_level_pct == null ? '--' : `${pct.toFixed(1)}%`}</div>
        </div>
      </div>
    </motion.button>
  );
}
