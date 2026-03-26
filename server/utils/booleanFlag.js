export function parseBooleanFlag(value) {
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;

  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['true', '1', 'yes', 'on', 'detected'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off', 'clear'].includes(normalized)) return false;
  return null;
}
