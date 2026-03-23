import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';

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
    nodeMap,
    deviceToCylinder,
    cylinderToDevice,
    cylinderToWard,
    wardToFloor
  };
}

function buildLocationLabel(wardNode, floorNode) {
  if (wardNode?.label && floorNode?.label) return `${wardNode.label} / ${floorNode.label}`;
  return wardNode?.label || floorNode?.label || null;
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

async function fetchCatalog() {
  const [{ data: floors, error: floorErr }, { data: wards, error: wardErr }, { data: cylinders, error: cylErr }, { data: devices, error: devErr }] =
    await Promise.all([
      supabaseAdmin.from('floors').select('*').order('name', { ascending: true }),
      supabaseAdmin.from('wards').select('*').order('name', { ascending: true }),
      supabaseAdmin
        .from('cylinders')
        .select('id, cylinder_name, ward, location, floor_name, esp32_device_id, is_active, total_capacity_kg')
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('iot_devices')
        .select('id, device_id, assigned_ward, assigned_floor, cylinder_id, cylinder_label, status, battery_level, gas_type, cylinder_size')
        .order('created_at', { ascending: false })
    ]);

  if (floorErr) throw new Error(floorErr.message);
  if (wardErr) throw new Error(wardErr.message);
  if (cylErr) throw new Error(cylErr.message);
  if (devErr) throw new Error(devErr.message);

  const realDevices = devices || [];
  const realDeviceKeySet = new Set(realDevices.map((item) => String(item.device_id || '').trim()).filter(Boolean));
  const derivedDevices = (cylinders || [])
    .filter((item) => item.esp32_device_id)
    .filter((item) => !realDeviceKeySet.has(String(item.esp32_device_id).trim()))
    .map((item) => ({
      id: `virtual:${item.esp32_device_id}`,
      device_id: item.esp32_device_id,
      assigned_ward: item.ward || null,
      assigned_floor: item.floor_name || null,
      cylinder_id: item.id,
      cylinder_label: item.cylinder_name || null,
      status: item.is_active ? 'active' : 'inactive',
      battery_level: null,
      gas_type: null,
      cylinder_size: null,
      is_virtual: true
    }));

  return {
    floors: floors || [],
    wards: wards || [],
    cylinders: cylinders || [],
    devices: [...realDevices, ...derivedDevices]
  };
}

async function persistDerivedAssignments({ nodes, cylinderToDevice, cylinderToWard, wardToFloor }) {
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const cylinderUpdates = [];
  const deviceUpdates = [];
  const cylinderSourceIds = nodes
    .filter((item) => item.type === 'cylinder' && item.sourceId)
    .map((item) => item.sourceId);
  const existingCylinderMap = new Map();

  if (cylinderSourceIds.length) {
    const { data: existingCylinders, error } = await supabaseAdmin
      .from('cylinders')
      .select('id, esp32_device_id, ward, floor_name, location, mapped_device_id, mapped_device_label')
      .in('id', cylinderSourceIds);
    if (error) throw new Error(error.message);
    for (const row of existingCylinders || []) {
      existingCylinderMap.set(row.id, row);
    }
  }

  for (const node of nodes.filter((item) => item.type === 'cylinder' && item.sourceId)) {
    const wardNode = nodeMap.get(cylinderToWard.get(node.id));
    const floorNode = wardNode ? nodeMap.get(wardToFloor.get(wardNode.id)) : null;
    const deviceNode = nodeMap.get(Array.from(cylinderToDevice.entries()).find(([, cylinderNodeId]) => cylinderNodeId === node.id)?.[0]);
    const existing = existingCylinderMap.get(node.sourceId) || null;
    const nextDeviceKey = deviceNode?.meta?.deviceKey || deviceNode?.label || existing?.esp32_device_id || null;

    cylinderUpdates.push({
      id: node.sourceId,
      ward: wardNode?.label || null,
      floor_name: floorNode?.label || null,
      location: buildLocationLabel(wardNode, floorNode),
      mapped_device_id: deviceNode?.sourceId || existing?.mapped_device_id || null,
      mapped_device_label: deviceNode?.label || existing?.mapped_device_label || null,
      esp32_device_id: nextDeviceKey
    });
  }

  for (const node of nodes.filter((item) => item.type === 'device' && item.sourceId)) {
    const cylinderNode = nodeMap.get(cylinderToDevice.has(node.id) ? cylinderToDevice.get(node.id) : null);
    const wardNode = cylinderNode ? nodeMap.get(cylinderToWard.get(cylinderNode.id)) : null;
    const floorNode = wardNode ? nodeMap.get(wardToFloor.get(wardNode.id)) : null;

    deviceUpdates.push({
      id: node.sourceId,
      assigned_ward: wardNode?.label || null,
      assigned_floor: floorNode?.label || null,
      cylinder_id: cylinderNode?.sourceId || null,
      cylinder_label: cylinderNode?.label || null
    });
  }

  for (const patch of cylinderUpdates) {
    const { error } = await supabaseAdmin
      .from('cylinders')
      .update({
        ward: patch.ward,
        floor_name: patch.floor_name,
        location: patch.location,
        mapped_device_id: patch.mapped_device_id,
        mapped_device_label: patch.mapped_device_label,
        esp32_device_id: patch.esp32_device_id
      })
      .eq('id', patch.id);
    if (error) throw new Error(error.message);
  }

  for (const patch of deviceUpdates) {
    if (String(patch.id || '').startsWith('virtual:')) continue;
    const { error } = await supabaseAdmin
      .from('iot_devices')
      .update({
        assigned_ward: patch.assigned_ward,
        assigned_floor: patch.assigned_floor,
        cylinder_id: patch.cylinder_id,
        cylinder_label: patch.cylinder_label
      })
      .eq('id', patch.id);
    if (error) throw new Error(error.message);
  }
}

router.get('/workspace', async (_req, res, next) => {
  try {
    const [catalog, workspace] = await Promise.all([fetchCatalog(), fetchWorkspaceRow()]);
    res.json({
      workspace: {
        id: workspace?.id || null,
        workspace_key: WORKSPACE_KEY,
        nodes: workspace?.nodes || [],
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
    const rawNodes = Array.isArray(req.body?.nodes) ? req.body.nodes : [];
    const rawEdges = Array.isArray(req.body?.edges) ? req.body.edges : [];
    const nodes = rawNodes.map(normalizeNode);
    const edges = rawEdges.map(normalizeEdge);
    const validation = validateGraph(nodes, edges);

    if (validation.issues.length) {
      return res.status(400).json({ error: validation.issues[0], issues: validation.issues });
    }

    const payload = {
      workspace_key: WORKSPACE_KEY,
      nodes,
      edges,
      updated_by: req.user?.email || null,
      updated_at: new Date().toISOString()
    };

    const { data: saved, error } = await supabaseAdmin
      .from('workspace_mappings')
      .upsert(payload, { onConflict: 'workspace_key' })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await persistDerivedAssignments({
      nodes,
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

export default router;
