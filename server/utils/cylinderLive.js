import { parseBooleanFlag } from './booleanFlag.js';

function clampPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

export function buildLiveReading(telemetryRow, cylinderType = null) {
  if (!telemetryRow) return null;

  const currentWeight =
    telemetryRow.current_weight != null
      ? Number(telemetryRow.current_weight)
      : telemetryRow.weight != null
        ? Number(telemetryRow.weight)
        : telemetryRow.gas_weight_kg != null
          ? Number(telemetryRow.gas_weight_kg)
          : null;

  const fullWeight =
    cylinderType?.full_weight != null ? Number(cylinderType.full_weight) : null;
  const emptyWeight =
    cylinderType?.empty_weight != null ? Number(cylinderType.empty_weight) : null;
  const totalGas =
    fullWeight != null && emptyWeight != null ? Number(fullWeight - emptyWeight) : null;
  const gasWeight =
    currentWeight != null && emptyWeight != null
      ? Math.max(0, currentWeight - emptyWeight)
      : null;
  const gasPercent =
    gasWeight != null && totalGas != null && totalGas > 0
      ? clampPercent((gasWeight / totalGas) * 100)
      : null;

  return {
    ...telemetryRow,
    device_id: telemetryRow.device_id || null,
    esp32_device_id: telemetryRow.device_id || telemetryRow.esp32_device_id || null,
    current_weight: currentWeight,
    gas_weight_kg: gasWeight,
    gas_level_pct: gasPercent,
    valve_position:
      parseBooleanFlag(telemetryRow.valve_position) ??
      parseBooleanFlag(telemetryRow.valve_open),
    valve_open:
      parseBooleanFlag(telemetryRow.valve_position) ??
      parseBooleanFlag(telemetryRow.valve_open),
    leak_detect:
      parseBooleanFlag(telemetryRow.leak_detect) ??
      (telemetryRow.leakage_ppm != null ? Number(telemetryRow.leakage_ppm) > 0 : null),
    leakage_ppm:
      telemetryRow.leakage_ppm != null
        ? Number(telemetryRow.leakage_ppm)
        : null,
    created_at: telemetryRow.created_at || telemetryRow.timestamp || null
  };
}

export function buildLiveCylinder(cylinder, telemetryRow = null, cylinderType = null) {
  const liveReading = buildLiveReading(telemetryRow, cylinderType);

  return {
    ...cylinder,
    type_id: cylinder?.type_id || null,
    type_name: cylinderType?.type_name || null,
    full_weight: cylinderType?.full_weight != null ? Number(cylinderType.full_weight) : null,
    empty_weight: cylinderType?.empty_weight != null ? Number(cylinderType.empty_weight) : null,
    current_weight: liveReading?.current_weight ?? null,
    gas_weight: liveReading?.gas_weight_kg ?? null,
    gas_percent: liveReading?.gas_level_pct ?? null,
    valve_pos: liveReading?.valve_position ?? null,
    leak_detect: liveReading?.leak_detect ?? null,
    timestamp: liveReading?.created_at ?? null,
    latest_reading: liveReading
  };
}
