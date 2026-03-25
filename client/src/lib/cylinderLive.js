function clampPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.max(0, Math.min(100, Number(value)));
}

export function buildLiveReading(reading, cylinder) {
  if (!reading) return null;

  const currentWeight =
    reading.current_weight != null
      ? Number(reading.current_weight)
      : reading.weight != null
        ? Number(reading.weight)
        : reading.gas_weight_kg != null
          ? Number(reading.gas_weight_kg)
          : null;

  const emptyWeight =
    cylinder?.empty_weight != null
      ? Number(cylinder.empty_weight)
      : cylinder?.latest_reading?.empty_weight != null
        ? Number(cylinder.latest_reading.empty_weight)
        : null;
  const fullWeight =
    cylinder?.full_weight != null
      ? Number(cylinder.full_weight)
      : cylinder?.latest_reading?.full_weight != null
        ? Number(cylinder.latest_reading.full_weight)
        : null;
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
    ...reading,
    current_weight: currentWeight,
    gas_weight_kg: gasWeight,
    gas_level_pct: gasPercent,
    valve_position:
      reading.valve_position != null
        ? Boolean(reading.valve_position)
        : reading.valve_open != null
          ? Boolean(reading.valve_open)
          : null,
    valve_open:
      reading.valve_position != null
        ? Boolean(reading.valve_position)
        : reading.valve_open != null
          ? Boolean(reading.valve_open)
          : null,
    leak_detect:
      reading.leak_detect != null
        ? Boolean(reading.leak_detect)
        : reading.leakage_ppm != null
          ? Number(reading.leakage_ppm) > 0
          : null,
    leakage_ppm:
      reading.leakage_ppm != null
        ? Number(reading.leakage_ppm)
        : reading.leak_detect == null
          ? null
          : reading.leak_detect
            ? 200
            : 0,
    created_at: reading.created_at || reading.timestamp || null
  };
}

export function mergeCylinderLiveReading(cylinder, reading) {
  const liveReading = buildLiveReading(reading, cylinder);
  return {
    ...cylinder,
    current_weight: liveReading?.current_weight ?? null,
    gas_weight: liveReading?.gas_weight_kg ?? null,
    gas_percent: liveReading?.gas_level_pct ?? null,
    valve_pos: liveReading?.valve_position ?? null,
    leak_detect: liveReading?.leak_detect ?? null,
    timestamp: liveReading?.created_at ?? null,
    latest_reading: liveReading
  };
}
