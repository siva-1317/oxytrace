import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { filterRowsByPlacedSourceId } from '../utils/workspaceScope.js';
import { normalizeTelemetryRow } from '../utils/telemetryNormalize.js';
import { buildTelemetryDeviceMap, canonicalizeDeviceKey, deviceKeysMatch } from '../utils/deviceMatch.js';
import { shapeCylinderRow } from '../utils/cylinderShape.js';
import { getPlacedSourceIdSet } from '../utils/workspaceScope.js';

const router = express.Router();
router.use(requireAuth);

function dayKey(iso) {
  return String(iso).slice(0, 10);
}

function toCsv(rows) {
  const esc = (v) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = ['cylinder_id', 'cylinder_num', 'ward', 'avg_gas_level_pct', 'avg_leakage_ppm', 'avg_daily_use_kg'];
  const lines = [header.join(',')];
  for (const r of rows) {
    lines.push(
      [r.cylinder_id, r.cylinder_num, r.ward, r.avg_gas_level_pct, r.avg_leakage_ppm, r.avg_daily_use_kg]
        .map(esc)
        .join(',')
    );
  }
  return lines.join('\n');
}

async function fetchCylindersWithLatest() {
  const { data: cylinders, error } = await supabaseAdmin
    .from('cylinders')
    .select('id, cylinder_num, ward, floor, device_id, is_active, created_at')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const cylList = (await filterRowsByPlacedSourceId('cylinder', cylinders || [])).map(shapeCylinderRow);
  const latestByCylinderId = new Map();
  const deviceCanonicals = Array.from(
    new Set(cylList.map((c) => canonicalizeDeviceKey(c.esp32_device_id)).filter(Boolean))
  );
  if (deviceCanonicals.length) {
    const { data: readings, error: rErr } = await supabaseAdmin
      .from('iot_telemetry')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5000);
    if (rErr) throw new Error(rErr.message);
    const byDevice = buildTelemetryDeviceMap((readings || []).map((row) => normalizeTelemetryRow(row)));
    for (const cyl of cylList) {
      const key = canonicalizeDeviceKey(cyl.esp32_device_id);
      if (key && byDevice.has(key)) latestByCylinderId.set(cyl.id, byDevice.get(key));
    }
  }

  return cylList.map((c) => ({ ...c, latest_reading: latestByCylinderId.get(c.id) || null }));
}

function buildDays(from, to) {
  const out = [];
  const d0 = new Date(from);
  const d1 = new Date(to);
  for (let d = new Date(d0); d <= d1; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function computeUsage(readingsRows, cylinderMap) {
  const byCyl = new Map();
  for (const r of readingsRows) {
    if (!r.cylinder_id) continue;
    if (!byCyl.has(r.cylinder_id)) byCyl.set(r.cylinder_id, []);
    byCyl.get(r.cylinder_id).push(r);
  }

  const dayTotals = new Map();
  const wardTotals = new Map();

  for (const [cylId, list] of byCyl.entries()) {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const perDay = new Map();

    for (const r of list) {
      const dk = dayKey(r.created_at);
      if (!perDay.has(dk)) perDay.set(dk, { first: r, last: r });
      else perDay.get(dk).last = r;
    }

    for (const [dk, v] of perDay.entries()) {
      const first = Number(v.first.gas_weight_kg ?? 0);
      const last = Number(v.last.gas_weight_kg ?? 0);
      const used = Math.max(0, first - last);
      dayTotals.set(dk, (dayTotals.get(dk) || 0) + used);
      const ward = cylinderMap.get(cylId)?.ward || 'Unknown';
      wardTotals.set(ward, (wardTotals.get(ward) || 0) + used);
    }
  }

  return { dayTotals, wardTotals, byCyl };
}

async function computeAnalyticsRange(from, to) {
  const cylinders = await fetchCylindersWithLatest();
  const cylMap = new Map(cylinders.map((c) => [c.id, c]));

  const fromIso = new Date(from + 'T00:00:00.000Z').toISOString();
  const toIso = new Date(to + 'T23:59:59.999Z').toISOString();

  const { data: telemetry, error: rErr } = await supabaseAdmin
    .from('iot_telemetry')
    .select('*')
    .gte('created_at', fromIso)
    .lte('created_at', toIso)
    .order('created_at', { ascending: false })
    .limit(5000);
  if (rErr) throw new Error(rErr.message);

  const readings = (telemetry || []).map((row) => {
    const reading = normalizeTelemetryRow(row);
    const cylinder = cylinders.find((c) => deviceKeysMatch(c.esp32_device_id, reading.device_id || reading.esp32_device_id));
    return cylinder ? { ...reading, cylinder_id: cylinder.id } : null;
  }).filter(Boolean);

  const days = buildDays(from, to);
  const { dayTotals, wardTotals, byCyl } = computeUsage(readings || [], cylMap);

  const totalSeries = days.map((k) => ({ day: k, kg: Number(dayTotals.get(k) || 0) }));
  const byWard = Array.from(wardTotals.entries())
    .map(([ward, kg]) => ({ ward, kg: Number(kg) }))
    .sort((a, b) => b.kg - a.kg);

  const top = cylinders
    .slice()
    .sort((a, b) => (b.latest_reading?.gas_level_pct ?? 0) - (a.latest_reading?.gas_level_pct ?? 0))
    .slice(0, 6);
  const levelKeys = top.map((c) => c.cylinder_num || c.cylinder_name);

  const byDayCyl = new Map();
  for (const r of readings || []) {
    const c = cylMap.get(r.cylinder_id);
    if (!c) continue;
    if (!levelKeys.includes(c.cylinder_num || c.cylinder_name)) continue;
    const dk = dayKey(r.created_at);
    const key = `${dk}::${c.cylinder_num || c.cylinder_name}`;
    const cur = byDayCyl.get(key) || { sum: 0, n: 0 };
    cur.sum += Number(r.gas_level_pct ?? 0);
    cur.n += 1;
    byDayCyl.set(key, cur);
  }

  const levelsSeries = days.map((dk) => {
    const row = { t: dk };
    for (const name of levelKeys) {
      const v = byDayCyl.get(`${dk}::${name}`);
      row[name] = v ? v.sum / v.n : null;
    }
    return row;
  });

  const scatter = (readings || [])
    .filter((r) => r.gas_level_pct != null && r.leakage_ppm != null)
    .slice(0, 500)
    .map((r) => ({ pct: Number(r.gas_level_pct), ppm: Number(r.leakage_ppm) }));

  const statusDist = (() => {
    let ok = 0,
      low = 0,
      crit = 0,
      inactive = 0;
    for (const c of cylinders) {
      if (!c.is_active) {
        inactive++;
        continue;
      }
      const pct = Number(c.latest_reading?.gas_level_pct ?? 0);
      if (pct < 20) crit++;
      else if (pct < 30) low++;
      else ok++;
    }
    return [
      { name: 'OK', value: ok },
      { name: 'Low', value: low },
      { name: 'Critical', value: crit },
      { name: 'Inactive', value: inactive }
    ];
  })();

  const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const hours = Array.from({ length: 24 }).map((_, i) => String(i).padStart(2, '0'));
  const grid = Array.from({ length: 7 }).map(() => Array.from({ length: 24 }).map(() => 0));

  for (const list of byCyl.values()) {
    list.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (let i = 1; i < list.length; i++) {
      const prev = list[i - 1];
      const cur = list[i];
      const used = Math.max(0, Number(prev.gas_weight_kg ?? 0) - Number(cur.gas_weight_kg ?? 0));
      const dt = new Date(cur.created_at);
      const dow = (dt.getUTCDay() + 6) % 7;
      const hr = dt.getUTCHours();
      grid[dow][hr] += used;
    }
  }

  const table = cylinders.map((c) => {
    const rel = byCyl.get(c.id) || [];
    const avgGas = rel.length
      ? rel.reduce((a, r) => a + Number(r.gas_level_pct ?? 0), 0) / rel.length
      : Number(c.latest_reading?.gas_level_pct ?? 0);
    const avgPpm = rel.length
      ? rel.reduce((a, r) => a + Number(r.leakage_ppm ?? 0), 0) / rel.length
      : Number(c.latest_reading?.leakage_ppm ?? 0);

    let perCylUsed = 0;
    if (rel.length) {
      rel.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      perCylUsed = Math.max(0, Number(rel[0].gas_weight_kg ?? 0) - Number(rel[rel.length - 1].gas_weight_kg ?? 0));
    }

    return {
      cylinder_id: c.id,
      cylinder_num: c.cylinder_num || c.cylinder_name,
      ward: c.ward,
      avg_gas_level_pct: avgGas,
      avg_leakage_ppm: avgPpm,
      avg_daily_use_kg: perCylUsed / Math.max(1, days.length)
    };
  });

  return {
    stats: { from, to, totalKg: totalSeries.reduce((a, r) => a + r.kg, 0), wardCount: byWard.length },
    totalSeries,
    byWard,
    levelsSeries,
    levelKeys,
    scatter,
    statusDist,
    heatmap: { days: daysOfWeek, hours, grid },
    table
  };
}

router.get('/summary', async (_req, res, next) => {
  try {
    const cylinders = await fetchCylindersWithLatest();
    const placedCylinderIds = await getPlacedSourceIdSet('cylinder');

    const totalCylinders = cylinders.length;
    const activeCylinders = cylinders.filter((c) => c.is_active).length;
    const avgGasLevelPct =
      cylinders.length === 0
        ? 0
        : cylinders.reduce((acc, c) => acc + (c.latest_reading?.gas_level_pct ?? 0), 0) /
          cylinders.length;

    const { data: criticalAlertRows, error: alertErr } = await supabaseAdmin
      .from('alerts')
      .select('id, cylinder_id, esp32_device_id')
      .eq('is_resolved', false)
      .eq('severity', 'critical');
    if (alertErr) throw new Error(alertErr.message);
    const criticalAlerts = (criticalAlertRows || []).filter(
      (alert) => !alert.cylinder_id || placedCylinderIds.has(String(alert.cylinder_id))
    ).length;

    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: telemetry, error: rErr } = await supabaseAdmin
      .from('iot_telemetry')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(5000);
    if (rErr) throw new Error(rErr.message);

    const readings = (telemetry || []).map((row) => {
      const deviceKey = String(row?.device_id || '').trim();
      const cylinder = cylinders.find((c) => deviceKeysMatch(c.esp32_device_id, deviceKey));
      return cylinder ? { ...normalizeTelemetryRow(row, cylinder), cylinder_id: cylinder.id } : null;
    }).filter(Boolean);

    const cylMap = new Map(cylinders.map((c) => [c.id, c]));
    const { dayTotals } = computeUsage(readings || [], cylMap);

    const usageLast7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const k = d.toISOString().slice(0, 10);
      return { day: k.slice(5), kg: Number(dayTotals.get(k) || 0) };
    });

    res.json({
      kpis: { totalCylinders, activeCylinders, criticalAlerts: criticalAlerts || 0, avgGasLevelPct },
      usageLast7Days
    });
  } catch (e) {
    next(e);
  }
});

router.get('/consumption', async (req, res, next) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });
    const payload = await computeAnalyticsRange(from, to);
    res.json(payload);
  } catch (e) {
    next(e);
  }
});

router.get('/export', async (req, res, next) => {
  try {
    const from = req.query.from;
    const to = req.query.to;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });
    const payload = await computeAnalyticsRange(from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(toCsv(payload.table || []));
  } catch (e) {
    next(e);
  }
});

export default router;
