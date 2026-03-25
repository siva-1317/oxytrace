export function canonicalizeDeviceKey(value) {
  const normalized = String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return normalized.startsWith('ESP32') ? normalized.slice(5) : normalized;
}

export function deviceKeysMatch(left, right) {
  const leftKey = canonicalizeDeviceKey(left);
  const rightKey = canonicalizeDeviceKey(right);
  return Boolean(leftKey) && Boolean(rightKey) && leftKey === rightKey;
}

export function buildTelemetryDeviceMap(rows, getValue = (row) => row?.device_id || row?.esp32_device_id) {
  const byCanonical = new Map();
  for (const row of rows || []) {
    const deviceId = String(getValue(row) || '').trim();
    const canonical = canonicalizeDeviceKey(deviceId);
    if (!canonical || byCanonical.has(canonical)) continue;
    byCanonical.set(canonical, row);
  }
  return byCanonical;
}
