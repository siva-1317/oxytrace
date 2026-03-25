export function shapeCylinderRow(row) {
  if (!row) return row;

  const rawDeviceId = String(row.device_id || row.esp32_device_id || '').trim() || null;
  const deviceId = rawDeviceId && !rawDeviceId.toLowerCase().startsWith('unassigned:') ? rawDeviceId : null;
  const cylinderNum = String(row.cylinder_num || row.cylinder_name || '').trim() || null;
  const floor = String(row.floor || row.floor_name || '').trim() || null;

  return {
    ...row,
    raw_device_id: rawDeviceId,
    esp32_device_id: deviceId,
    device_id: deviceId,
    cylinder_num: cylinderNum,
    floor
  };
}
