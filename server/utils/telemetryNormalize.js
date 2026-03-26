import { parseBooleanFlag } from './booleanFlag.js';

export function normalizeTelemetryRow(row, cylinder = null) {
  const createdAt = row?.created_at || null;
  const deviceId = row?.device_id || row?.esp32_device_id || null;
  const totalWeight = row?.current_weight != null ? Number(row.current_weight) : row?.gas_weight_kg != null ? Number(row.gas_weight_kg) : null;
  const emptyWeight = cylinder?.empty_cylinder_weight_kg != null ? Number(cylinder.empty_cylinder_weight_kg) : null;
  const capacity = cylinder?.total_capacity_kg != null ? Number(cylinder.total_capacity_kg) : null;
  const derivedGasWeight = totalWeight != null && emptyWeight != null ? Math.max(0, totalWeight - emptyWeight) : null;
  const gasWeight = derivedGasWeight ?? totalWeight;
  let gasPct = row?.gas_level_pct ?? null;

  if (gasPct == null && gasWeight != null && capacity != null && capacity > 0) {
    gasPct = Math.max(0, Math.min(100, (gasWeight / capacity) * 100));
  }

  const leakDetected =
    parseBooleanFlag(row?.leak_detect) ??
    (row?.leakage_ppm != null ? Number(row.leakage_ppm) > 0 : null);
  const valveOpen =
    parseBooleanFlag(row?.valve_position) ??
    parseBooleanFlag(row?.valve_open);

  return {
    ...row,
    // Expose both keys so existing cylinder consumers can match against the mapped device.
    esp32_device_id: deviceId,
    device_id: deviceId,
    current_weight: totalWeight != null ? Number(totalWeight) : null,
    leak_detect: leakDetected,
    valve_position: valveOpen,
    gas_weight_kg: gasWeight != null ? Number(gasWeight) : null,
    total_weight_kg: totalWeight != null ? Number(totalWeight) : null,
    leakage_ppm: row?.leakage_ppm != null ? Number(row.leakage_ppm) : null,
    valve_open: valveOpen,
    gas_level_pct: gasPct != null ? Number(gasPct) : null,
    created_at: createdAt
  };
}
