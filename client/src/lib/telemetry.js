export function normalizeTelemetryRow(row) {
  if (!row) return null;

  const createdAt = row.created_at || null;
  const deviceId = row.device_id || row.esp32_device_id || null;
  const gasPct = row.gas_level_pct ?? null;
  const gasWeight = row.current_weight ?? row.gas_weight_kg ?? row.total_weight_kg ?? null;
  const leakDetected = row.leak_detect != null ? Boolean(row.leak_detect) : row.leakage_ppm != null ? Number(row.leakage_ppm) > 0 : null;
  const valveOpen = row.valve_position != null ? Boolean(row.valve_position) : row.valve_open != null ? Boolean(row.valve_open) : null;

  return {
    ...row,
    // Keep esp32_device_id as a compatibility alias for existing cylinder UI code.
    esp32_device_id: deviceId,
    device_id: deviceId,
    current_weight: gasWeight != null ? Number(gasWeight) : null,
    leak_detect: leakDetected,
    valve_position: valveOpen,
    gas_level_pct: gasPct != null ? Number(gasPct) : null,
    gas_weight_kg: gasWeight != null ? Number(gasWeight) : null,
    leakage_ppm: row.leakage_ppm != null ? Number(row.leakage_ppm) : leakDetected == null ? null : leakDetected ? 200 : 0,
    valve_open: valveOpen,
    created_at: createdAt
  };
}
