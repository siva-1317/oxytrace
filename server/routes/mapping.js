import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { shapeCylinderRow } from '../utils/cylinderShape.js';

const router = express.Router();
router.use(requireAuth);

const WORKSPACE_KEY = 'main-workspace';

const allowedConnections = {
  device: ['cylinder'],
  cylinder: ['ward'],
  ward: ['floor'],
  floor: []
};

function normalizeType(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeNode(node) {
  return {
    id: String(node?.id || '').trim(),
    type: normalizeType(node?.type),
    sourceId: node?.sourceId != null ? String(node.sourceId).trim() : null,
    label: String(node?.label || '').trim(),
    meta: node?.meta && typeof node.meta === 'object' ? node.meta : {},
    position: {
      x: Number(node?.position?.x || 0),
      y: Number(node?.position?.y || 0)
    }
  };
}

function normalizeEdge(edge) {
  return {
    id: String(edge?.id || '').trim(),
    source: String(edge?.source || '').trim(),
    target: String(edge?.target || '').trim()
  };
}

function makeWorkspaceNodeId(type, sourceId) {
  return `${type}:${sourceId}`;
}

function validateGraph(nodes, edges) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const issues = [];
  const deviceToCylinder = new Map();
  const cylinderToDevice = new Map();
  const cylinderToWard = new Map();
  const wardToFloor = new Map();

  for (const node of nodes) {
    if (!node.id) issues.push('Every node must have an id.');
    if (!['floor', 'ward', 'cylinder', 'device'].includes(node.type)) {
      issues.push(`Invalid node type for ${node.id || 'unknown node'}.`);
    }
  }

  for (const edge of edges) {
    if (!edge.id || !edge.source || !edge.target) {
      issues.push('Every connection must include id, source, and target.');
      continue;
    }

    const sourceNode = nodeMap.get(edge.source);
    const targetNode = nodeMap.get(edge.target);
    if (!sourceNode || !targetNode) {
      issues.push(`Connection ${edge.id} references a missing node.`);
      continue;
    }

    if (!allowedConnections[sourceNode.type]?.includes(targetNode.type)) {
      issues.push(`Connection ${sourceNode.type} -> ${targetNode.type} is not allowed.`);
      continue;
    }

    if (sourceNode.type === 'device') {
      if (deviceToCylinder.has(sourceNode.id)) issues.push(`Device ${sourceNode.label} can connect to only one cylinder.`);
      if (cylinderToDevice.has(targetNode.id)) issues.push(`Cylinder ${targetNode.label} can have only one device.`);
      deviceToCylinder.set(sourceNode.id, targetNode.id);
      cylinderToDevice.set(targetNode.id, sourceNode.id);
    }

    if (sourceNode.type === 'cylinder') {
      if (cylinderToWard.has(sourceNode.id)) issues.push(`Cylinder ${sourceNode.label} can belong to only one ward.`);
      cylinderToWard.set(sourceNode.id, targetNode.id);
    }

    if (sourceNode.type === 'ward') {
      if (wardToFloor.has(sourceNode.id)) issues.push(`Ward ${sourceNode.label} can belong to only one floor.`);
      wardToFloor.set(sourceNode.id, targetNode.id);
    }
  }

  return {
    issues,
    cylinderToDevice,
    cylinderToWard,
    wardToFloor
  };
}

function resolveMappedDeviceId(deviceNode) {
  const candidates = [
    deviceNode?.meta?.deviceKey,
    deviceNode?.label,
    deviceNode?.sourceId
  ];

  for (const candidate of candidates) {
    const value = String(candidate || '').trim();
    if (value) return value;
  }

  return null;
}

function normalizeDeviceColumnValue(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

async function fetchWorkspaceRow() {
  const { data, error } = await supabaseAdmin
    .from('workspace_mappings')
    .select('*')
    .eq('workspace_key', WORKSPACE_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

async function persistWorkspaceRow(nodes, edges, updatedBy = null) {
  const { data, error } = await supabaseAdmin
    .from('workspace_mappings')
    .upsert(
      {
        workspace_key: WORKSPACE_KEY,
        nodes,
        edges,
        updated_by: updatedBy,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'workspace_key' }
    )
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

async function fetchCatalog() {
  const [
    { data: floors, error: floorErr },
    { data: wards, error: wardErr },
    { data: cylinders, error: cylErr },
    workspace
  ] = await Promise.all([
    supabaseAdmin.from('floors').select('*').order('name', { ascending: true }),
    supabaseAdmin.from('wards').select('*').order('name', { ascending: true }),
    supabaseAdmin
      .from('cylinders')
      .select('id, cylinder_num, ward, floor, device_id, is_active')
      .order('created_at', { ascending: false }),
    fetchWorkspaceRow()
  ]);

  if (floorErr) throw new Error(floorErr.message);
  if (wardErr) throw new Error(wardErr.message);
  if (cylErr) throw new Error(cylErr.message);

  const workspaceDevices = Array.isArray(workspace?.nodes)
    ? workspace.nodes
        .map(normalizeNode)
        .filter((node) => node.type === 'device')
        .map((node) => ({
          id: node.sourceId,
          device_id: node.label || node.meta?.deviceKey || node.sourceId
        }))
    : [];
  const cylinderDevices = Array.from(
    new Map(
      (cylinders || [])
        .map((row) => String(row?.device_id || '').trim())
        .filter(Boolean)
        .map((deviceId) => [deviceId, { id: deviceId, device_id: deviceId }])
    ).values()
  );
  const deviceLibrary = Array.from(
    new Map([...workspaceDevices, ...cylinderDevices].map((item) => [String(item.device_id || '').trim(), item])).values()
  ).filter((item) => String(item.device_id || '').trim());

  return {
    floors: floors || [],
    wards: wards || [],
    cylinders: (cylinders || []).map(shapeCylinderRow),
    devices: deviceLibrary
  };
}

async function persistDerivedAssignments({ nodes, previousNodes = [], cylinderToDevice, cylinderToWard, wardToFloor }) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const cylinderUpdates = [];

  const currentCylinderSourceIds = nodes
    .filter((item) => item.type === 'cylinder' && item.sourceId)
    .map((item) => item.sourceId);
  const previousCylinderSourceIds = previousNodes
    .filter((item) => item?.type === 'cylinder' && item?.sourceId)
    .map((item) => String(item.sourceId).trim())
    .filter(Boolean);
  const cylinderSourceIds = Array.from(new Set([...currentCylinderSourceIds, ...previousCylinderSourceIds]));
  const existingCylinderMap = new Map();

  if (cylinderSourceIds.length) {
    const { data, error } = await supabaseAdmin
      .from('cylinders')
      .select('id, device_id, cylinder_num, ward, floor')
      .in('id', cylinderSourceIds);
    if (error) throw new Error(error.message);
    for (const row of data || []) existingCylinderMap.set(row.id, row);
  }

  for (const node of nodes.filter((item) => item.type === 'cylinder' && item.sourceId)) {
    const wardNode = nodeMap.get(cylinderToWard.get(node.id));
    const floorNode = wardNode ? nodeMap.get(wardToFloor.get(wardNode.id)) : null;
    const deviceNodeId = cylinderToDevice.get(node.id) || null;
    const deviceNode = deviceNodeId ? nodeMap.get(deviceNodeId) : null;
    const existing = existingCylinderMap.get(node.sourceId) || null;
    const cylinderLabel = node.label || existing?.cylinder_num || null;
    const nextDeviceKey = resolveMappedDeviceId(deviceNode);

    cylinderUpdates.push({
      id: node.sourceId,
      cylinder_num: cylinderLabel,
      ward: wardNode?.label || 'Unassigned',
      floor: floorNode?.label || null,
      device_id: normalizeDeviceColumnValue(nextDeviceKey)
    });
  }

  for (const cylinderId of previousCylinderSourceIds) {
    if (currentCylinderSourceIds.includes(cylinderId)) continue;
    const existing = existingCylinderMap.get(cylinderId);
    if (!existing) continue;
    cylinderUpdates.push({
      id: cylinderId,
      cylinder_num: existing.cylinder_num,
      ward: 'Unassigned',
      floor: null,
      device_id: null
    });
  }

  for (const patch of cylinderUpdates) {
    const previous = existingCylinderMap.get(patch.id) || null;
    const previousDeviceKey = String(previous?.device_id || '').trim() || null;
    const nextDeviceKey = String(patch.device_id || '').trim() || null;

    const { error } = await supabaseAdmin
      .from('cylinders')
      .update({
        device_id: patch.device_id,
        cylinder_num: patch.cylinder_num,
        ward: patch.ward,
        floor: patch.floor
      })
      .eq('id', patch.id);
    if (error) throw new Error(error.message);

    if (nextDeviceKey) {
      const deviceKeys = Array.from(new Set([nextDeviceKey, previousDeviceKey].filter(Boolean)));

      const { error: readingsError } = await supabaseAdmin
        .from('sensor_readings')
        .update({ cylinder_id: patch.id })
        .in('esp32_device_id', deviceKeys)
        .is('cylinder_id', null);
      if (readingsError) throw new Error(readingsError.message);

      const { error: alertsError } = await supabaseAdmin
        .from('alerts')
        .update({ cylinder_id: patch.id })
        .in('esp32_device_id', deviceKeys)
        .is('cylinder_id', null);
      if (alertsError) throw new Error(alertsError.message);
    }
  }
}

async function syncWorkspaceRemoval({ type, sourceId, updatedBy = null }) {
  const previousWorkspace = await fetchWorkspaceRow();
  if (!previousWorkspace) return;

  const nodeId = makeWorkspaceNodeId(type, sourceId);
  const previousNodes = (previousWorkspace.nodes || []).map(normalizeNode);
  const nextNodes = previousNodes.filter((node) => node.id !== nodeId);
  const nextEdges = (previousWorkspace.edges || [])
    .map(normalizeEdge)
    .filter((edge) => edge.source !== nodeId && edge.target !== nodeId);
  const validation = validateGraph(nextNodes, nextEdges);

  await persistWorkspaceRow(nextNodes, nextEdges, updatedBy);
  await persistDerivedAssignments({
    nodes: nextNodes,
    previousNodes,
    cylinderToDevice: validation.cylinderToDevice,
    cylinderToWard: validation.cylinderToWard,
    wardToFloor: validation.wardToFloor
  });
}

router.get('/workspace', async (_req, res, next) => {
  try {
    const [catalog, workspace] = await Promise.all([fetchCatalog(), fetchWorkspaceRow()]);
    const workspaceNodes = Array.isArray(workspace?.nodes)
      ? workspace.nodes.map(normalizeNode).filter((node) => !(node.type === 'device' && node.meta?.libraryOnly))
      : [];
    res.json({
      workspace: {
        id: workspace?.id || null,
        workspace_key: WORKSPACE_KEY,
        nodes: workspaceNodes,
        edges: workspace?.edges || [],
        updated_at: workspace?.updated_at || null
      },
      catalog
    });
  } catch (e) {
    next(e);
  }
});

router.put('/workspace', async (req, res, next) => {
  try {
    const previousWorkspace = await fetchWorkspaceRow();
    const nodes = Array.isArray(req.body?.nodes) ? req.body.nodes.map(normalizeNode) : [];
    const edges = Array.isArray(req.body?.edges) ? req.body.edges.map(normalizeEdge) : [];
    const validation = validateGraph(nodes, edges);

    if (validation.issues.length) {
      return res.status(400).json({ error: validation.issues[0], issues: validation.issues });
    }

    const saved = await persistWorkspaceRow(nodes, edges, req.user?.email || null);
    await persistDerivedAssignments({
      nodes,
      previousNodes: Array.isArray(previousWorkspace?.nodes) ? previousWorkspace.nodes.map(normalizeNode) : [],
      cylinderToDevice: validation.cylinderToDevice,
      cylinderToWard: validation.cylinderToWard,
      wardToFloor: validation.wardToFloor
    });

    res.json({
      ok: true,
      workspace: {
        id: saved.id,
        workspace_key: saved.workspace_key,
        nodes: saved.nodes || [],
        edges: saved.edges || [],
        updated_at: saved.updated_at
      }
    });
  } catch (e) {
    next(e);
  }
});

router.post('/floors', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing floor name' });

    const { data, error } = await supabaseAdmin
      .from('floors')
      .insert({ name, code: String(req.body?.code || '').trim() || null })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    res.status(201).json({ floor: data });
  } catch (e) {
    next(e);
  }
});

router.post('/wards', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Missing ward name' });

    const { data, error } = await supabaseAdmin
      .from('wards')
      .insert({
        name,
        code: String(req.body?.code || '').trim() || null,
        floor_id: req.body?.floor_id ? String(req.body.floor_id).trim() : null
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    res.status(201).json({ ward: data });
  } catch (e) {
    next(e);
  }
});

router.post('/cylinders', async (req, res, next) => {
  try {
    const cylinderNumber = String(req.body?.cylinder_number || '').trim();
    if (!cylinderNumber) return res.status(400).json({ error: 'Missing cylinder number' });

    const { data, error } = await supabaseAdmin
      .from('cylinders')
      .insert({
        cylinder_num: cylinderNumber,
        ward: 'Unassigned',
        floor: null,
        device_id: null,
        is_active: true
      })
      .select('id, cylinder_num, ward, floor, device_id, is_active')
      .single();
    if (error) throw new Error(error.message);

    res.status(201).json({ cylinder: shapeCylinderRow(data) });
  } catch (e) {
    next(e);
  }
});

router.delete('/floors/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('floors').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    await syncWorkspaceRemoval({ type: 'floor', sourceId: req.params.id, updatedBy: req.user?.email || null });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/wards/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('wards').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    await syncWorkspaceRemoval({ type: 'ward', sourceId: req.params.id, updatedBy: req.user?.email || null });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/cylinders/:id', async (req, res, next) => {
  try {
    const { error } = await supabaseAdmin.from('cylinders').delete().eq('id', req.params.id);
    if (error) throw new Error(error.message);
    await syncWorkspaceRemoval({ type: 'cylinder', sourceId: req.params.id, updatedBy: req.user?.email || null });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
