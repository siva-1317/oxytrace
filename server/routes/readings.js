import express from 'express';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { requireAuth } from '../middleware/authMiddleware.js';
import { normalizeTelemetryRow } from '../utils/telemetryNormalize.js';
import { deviceKeysMatch } from '../utils/deviceMatch.js';
import { parseBooleanFlag } from '../utils/booleanFlag.js';
import { getAlertThresholds } from '../utils/stockInventory.js';
import { isMailConfigured, sendMail } from '../services/mailService.js';
import { generateLeakAlertExplanation } from '../services/geminiService.js';

const router = express.Router();

function getPagerRecipients() {
  return [
    process.env.ALERT_PAGER_TO,
    process.env.PAGER_EMAIL_TO,
    process.env.ALERT_EMAIL_TO
  ]
    .flatMap((value) => String(value || '').split(','))
    .map((value) => value.trim())
    .filter(Boolean);
}

function fallbackLeakExplanation(cylinderLabel) {
  return `${cylinderLabel} is reporting an active leak condition. Isolate the cylinder immediately, move it to a ventilated area, inspect the valve and regulator assembly, and replace the cylinder if the leak does not clear.`;
}

async function buildLeakAlertContent({ cylinder, incomingDeviceId, leakDetected, gasLevelPct, measuredPpm = null }) {
  const cylinderLabel = cylinder?.cylinder_num || `Device ${incomingDeviceId}`;
  const locationBits = [cylinder?.ward, cylinder?.floor].filter(Boolean);
  const location = locationBits.length ? locationBits.join(', ') : 'Location not assigned';
  const gasLevelText = Number.isFinite(gasLevelPct) ? `${gasLevelPct.toFixed(1)}%` : 'unknown';
  const summary = measuredPpm != null
    ? `Cylinder leak detected for ${cylinderLabel}. The sensor reported an active leak state with a telemetry value of ${measuredPpm}.`
    : `Cylinder leak detected for ${cylinderLabel}. The ESP32 leak sensor reported an active leak state.`;
  let aiExplanation = fallbackLeakExplanation(cylinderLabel);
  try {
    aiExplanation = await generateLeakAlertExplanation({
      cylinder: cylinderLabel,
      device_id: incomingDeviceId,
      ward: cylinder?.ward || null,
      floor: cylinder?.floor || null,
      gas_level_pct: gasLevelText,
      leak_detected: Boolean(leakDetected),
      measured_ppm: measuredPpm
    });
  } catch {
    // fall back to deterministic safety copy if AI is unavailable
  }
  const message = `${summary}\n\nAI assessment: ${aiExplanation}\n\nCurrent gas level: ${gasLevelText}. Location: ${location}.`;

  return {
    subject: `OxyTrace leak alert: ${cylinderLabel}`,
    message,
    text: [
      'OxyTrace detected a dangerous oxygen cylinder leak.',
      `Cylinder: ${cylinderLabel}`,
      `Device ID: ${incomingDeviceId}`,
      `Ward/Floor: ${location}`,
      `Leak status: ${leakDetected ? 'Detected' : 'Clear'}`,
      ...(measuredPpm != null ? [`Telemetry value: ${measuredPpm}`] : []),
      `Gas level: ${gasLevelText}`,
      '',
      aiExplanation
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033">
        <h2 style="margin:0 0 12px;color:#b91c1c">Dangerous cylinder leak detected</h2>
        <p style="margin:0 0 12px">${summary}</p>
        <table style="border-collapse:collapse;margin:0 0 12px">
          <tr><td style="padding:6px 12px 6px 0;font-weight:700">Cylinder</td><td style="padding:6px 0">${cylinderLabel}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;font-weight:700">Device ID</td><td style="padding:6px 0">${incomingDeviceId}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;font-weight:700">Location</td><td style="padding:6px 0">${location}</td></tr>
          <tr><td style="padding:6px 12px 6px 0;font-weight:700">Leak status</td><td style="padding:6px 0">${leakDetected ? 'Detected' : 'Clear'}</td></tr>
          ${measuredPpm != null ? `<tr><td style="padding:6px 12px 6px 0;font-weight:700">Telemetry value</td><td style="padding:6px 0">${measuredPpm}</td></tr>` : ''}
          <tr><td style="padding:6px 12px 6px 0;font-weight:700">Gas level</td><td style="padding:6px 0">${gasLevelText}</td></tr>
        </table>
        <p style="margin:0">${aiExplanation}</p>
      </div>
    `
  };
}

async function createOrRefreshAlert({
  alertType,
  severity,
  message,
  esp32_device_id: esp32DeviceId,
  cylinder_id: cylinderId
}) {
  let query = supabaseAdmin
    .from('alerts')
    .select('id')
    .eq('alert_type', alertType)
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(1);

  if (cylinderId) query = query.eq('cylinder_id', cylinderId);
  else query = query.eq('esp32_device_id', esp32DeviceId);

  const { data: existing, error: existingError } = await query;
  if (existingError) throw new Error(existingError.message);

  if (existing?.[0]?.id) {
    const { error: updateError } = await supabaseAdmin
      .from('alerts')
      .update({
        message,
        severity,
        esp32_device_id: esp32DeviceId,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing[0].id);
    if (updateError) throw new Error(updateError.message);
    return { id: existing[0].id, created: false };
  }

  const { data: created, error: insertError } = await supabaseAdmin
    .from('alerts')
    .insert({
      esp32_device_id: esp32DeviceId,
      cylinder_id: cylinderId,
      alert_type: alertType,
      message,
      severity
    })
    .select('id')
    .single();
  if (insertError) throw new Error(insertError.message);
  return { id: created?.id || null, created: true };
}

async function sendLeakPagerAlert({ cylinder, incomingDeviceId, leakDetected, gasLevelPct, measuredPpm = null }) {
  const recipients = getPagerRecipients();
  if (!recipients.length || !isMailConfigured()) return { attempted: false, sent: false };

  const content = await buildLeakAlertContent({ cylinder, incomingDeviceId, leakDetected, gasLevelPct, measuredPpm });
  await sendMail({
    to: recipients.join(', '),
    subject: content.subject,
    html: content.html,
    text: content.text
  });

  return { attempted: true, sent: true, recipients };
}

async function resolveCylinderForDevice(deviceId) {
  const normalized = String(deviceId || '').trim();
  if (!normalized) return null;

  const { data: cylinders, error } = await supabaseAdmin
    .from('cylinders')
    .select('id, cylinder_num, ward, floor, device_id')
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const cylinder = (cylinders || []).find((row) => deviceKeysMatch(row.device_id, normalized));
  if (!cylinder?.id) return null;

  return {
    cylinder_id: cylinder.id,
    device_id: normalized,
    cylinder_label: cylinder.cylinder_num || null,
    cylinder
  };
}

router.post('/ingest', async (req, res, next) => {
  try {
    const secret = req.headers['x-esp32-secret'];
    if (secret !== process.env.ESP32_SECRET) return res.status(401).json({ error: 'Forbidden' });

    const { esp32_device_id, device_id, gas_weight_kg, leakage_ppm, leak_detect, leak_detected, valve_open, gas_level_pct } = req.body || {};

    const incomingDeviceId = String(device_id || esp32_device_id || '').trim();
    if (!incomingDeviceId) return res.status(400).json({ error: 'Missing device_id' });

    const mapped = await resolveCylinderForDevice(incomingDeviceId);

    const insertPayload = {
      esp32_device_id: incomingDeviceId,
      cylinder_id: mapped?.cylinder_id || null,
      gas_weight_kg,
      leakage_ppm,
      valve_open,
      gas_level_pct
    };

    const { error } = await supabaseAdmin.from('sensor_readings').insert(insertPayload);
    if (error) throw new Error(error.message);

    const numericLeakValue =
      leakage_ppm != null && leakage_ppm !== '' && !Number.isNaN(Number(leakage_ppm))
        ? Number(leakage_ppm)
        : null;
    const leakDetectedState =
      parseBooleanFlag(leak_detect) ??
      parseBooleanFlag(leak_detected) ??
      (numericLeakValue != null ? numericLeakValue > 0 : false);
    const pct = Number(gas_level_pct ?? 100);
    const alertBase = {
      esp32_device_id: incomingDeviceId,
      cylinder_id: mapped?.cylinder_id || null
    };

    let pager = { attempted: false, sent: false };

    if (leakDetectedState) {
      const leakContent = await buildLeakAlertContent({
        cylinder: mapped?.cylinder || null,
        incomingDeviceId,
        leakDetected: leakDetectedState,
        gasLevelPct: pct,
        measuredPpm: numericLeakValue
      });
      await createOrRefreshAlert({
        ...alertBase,
        alertType: 'LEAK_DANGER',
        message: leakContent.message,
        severity: 'critical'
      });
      pager = await sendLeakPagerAlert({
        cylinder: mapped?.cylinder || null,
        incomingDeviceId,
        leakDetected: leakDetectedState,
        gasLevelPct: pct,
        measuredPpm: numericLeakValue
      });
    } else {
      const thresholds = await getAlertThresholds();
      const lowGasPct = Number(thresholds.low_gas_pct || 20);
      if (pct >= lowGasPct) {
        return res.json({ success: true, cylinder_id: mapped?.cylinder_id || null, pager });
      }
      await createOrRefreshAlert({
        ...alertBase,
        alertType: 'LOW_GAS',
        message: `Gas below ${lowGasPct}%: ${pct.toFixed(1)}%. Refill or replace this cylinder soon to avoid interruption.`,
        severity: 'warning'
      });
    }

    res.json({ success: true, cylinder_id: mapped?.cylinder_id || null, pager });
  } catch (e) {
    next(e);
  }
});

router.use(requireAuth);

function parseRange(range) {
  switch (range) {
    case '1h':
      return 1 * 60 * 60 * 1000;
    case '1d':
      return 24 * 60 * 60 * 1000;
    case '1w':
      return 7 * 24 * 60 * 60 * 1000;
    case '1m':
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 24 * 60 * 60 * 1000;
  }
}

router.get('/:cylinderId', async (req, res, next) => {
  try {
    const cylinderId = req.params.cylinderId;
    const range = req.query.range || '1d';
    const since = new Date(Date.now() - parseRange(range)).toISOString();

    const { data: cylinder, error: cylErr } = await supabaseAdmin
      .from('cylinders')
      .select('id, device_id, cylinder_num')
      .eq('id', cylinderId)
      .single();
    if (cylErr) throw new Error(cylErr.message);

    let { data, error } = await supabaseAdmin
      .from('iot_telemetry')
      .select('*')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    data = (data || []).filter((row) => deviceKeysMatch(row.device_id, cylinder.device_id));

    if (!data.length) {
      const fallback = await supabaseAdmin
        .from('iot_telemetry')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (fallback.error) throw new Error(fallback.error.message);
      data = (fallback.data || []).filter((row) => deviceKeysMatch(row.device_id, cylinder.device_id));
    }

    res.json({ readings: data.map((row) => normalizeTelemetryRow(row, cylinder)) });
  } catch (e) {
    next(e);
  }
});

export default router;
