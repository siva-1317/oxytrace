import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  Cpu,
  Droplets,
  Map as MapIcon,
  Plus,
  Save,
  Trash2,
  ZoomIn,
  ZoomOut,
  Move,
  Lock,
  Layers,
  GitBranch
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext.jsx';
import { apiJson } from '../lib/api.js';

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2200;
const NODE_WIDTH = 210;
const NODE_HEIGHT = 92;
const TEMP_PREFIX = 'tmp:';

const typeTheme = {
  floor: {
    icon: Building2,
    accent: '#f59e0b',
    chip: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
    card: 'border-amber-500/25 bg-amber-500/8',
    glow: 'shadow-amber-500/20',
    dot: '#f59e0b',
    label: 'Floor'
  },
  ward: {
    icon: MapIcon,
    accent: '#10b981',
    chip: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
    card: 'border-emerald-500/25 bg-emerald-500/8',
    glow: 'shadow-emerald-500/20',
    dot: '#10b981',
    label: 'Ward'
  },
  cylinder: {
    icon: Droplets,
    accent: '#3b82f6',
    chip: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
    card: 'border-blue-500/25 bg-blue-500/8',
    glow: 'shadow-blue-500/20',
    dot: '#3b82f6',
    label: 'Cylinder'
  },
  device: {
    icon: Cpu,
    accent: '#ef4444',
    chip: 'bg-red-500/15 text-red-400 border-red-500/25',
    card: 'border-red-500/25 bg-red-500/8',
    glow: 'shadow-red-500/20',
    dot: '#ef4444',
    label: 'Device'
  }
};

const allowedTargets = {
  device: ['cylinder'],
  cylinder: ['ward'],
  ward: ['floor'],
  floor: []
};

function buildCatalogItem(type, item) {
  if (type === 'floor') {
    return { type, sourceId: item.id, title: item.name, displayId: item.code || item.id, meta: { code: item.code || null } };
  }
  if (type === 'ward') {
    return { type, sourceId: item.id, title: item.name, displayId: item.code || item.id, meta: { code: item.code || null, floorId: item.floor_id || null } };
  }
  if (type === 'cylinder') {
    return {
      type,
      sourceId: item.id,
      title: item.cylinder_num || item.cylinder_name || 'Cylinder',
      displayId: item.cylinder_num || item.cylinder_name || item.id,
      meta: {
        ward: item.ward || null,
        floor_name: item.floor || item.floor_name || null,
        deviceKey: item.device_id || item.esp32_device_id || null
      }
    };
  }
  return {
    type,
    sourceId: item.id,
    title: item.device_id || 'Device',
    displayId: item.device_id || item.id,
    meta: {
      deviceKey: item.telemetry_device_id || item.device_id || null,
      status: item.status || 'active',
      assigned_ward: item.assigned_ward || null
    }
  };
}

function makeNodeId(type, sourceId) { return `${type}:${sourceId}`; }

function makeTempId(type) {
  return `${TEMP_PREFIX}${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function buildWorkspaceNode(type, source, position) {
  return { id: makeNodeId(type, source.sourceId), type, sourceId: source.sourceId, label: source.title, meta: { displayId: source.displayId, ...source.meta }, position };
}

function screenToWorld(point, viewport, rect) {
  return {
    x: Math.max(40, Math.min(WORLD_WIDTH - NODE_WIDTH - 40, (point.x - rect.left - viewport.x) / viewport.zoom)),
    y: Math.max(40, Math.min(WORLD_HEIGHT - NODE_HEIGHT - 40, (point.y - rect.top - viewport.y) / viewport.zoom))
  };
}

function getNodeCenter(node) {
  return { x: node.position.x + NODE_WIDTH / 2, y: node.position.y + NODE_HEIGHT / 2 };
}

function getAnchorPoint(node, side) {
  const anchors = {
    left: { x: node.position.x, y: node.position.y + NODE_HEIGHT / 2 },
    right: { x: node.position.x + NODE_WIDTH, y: node.position.y + NODE_HEIGHT / 2 },
    top: { x: node.position.x + NODE_WIDTH / 2, y: node.position.y },
    bottom: { x: node.position.x + NODE_WIDTH / 2, y: node.position.y + NODE_HEIGHT }
  };
  return anchors[side] || anchors.right;
}

function getEdgeAnchors(sourceNode, targetNode) {
  const sourceCenter = getNodeCenter(sourceNode);
  const targetCenter = getNodeCenter(targetNode);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { start: getAnchorPoint(sourceNode, dx >= 0 ? 'right' : 'left'), end: getAnchorPoint(targetNode, dx >= 0 ? 'left' : 'right') };
  }
  return { start: getAnchorPoint(sourceNode, dy >= 0 ? 'bottom' : 'top'), end: getAnchorPoint(targetNode, dy >= 0 ? 'top' : 'bottom') };
}

function makeEdge(sourceId, targetId) {
  return { id: `${sourceId}->${targetId}`, source: sourceId, target: targetId };
}

function validateConnection(sourceNode, targetNode, edges) {
  if (!sourceNode || !targetNode) return 'Both nodes are required.';
  if (sourceNode.id === targetNode.id) return 'Cannot connect a node to itself.';
  if (!allowedTargets[sourceNode.type]?.includes(targetNode.type)) return `${sourceNode.type} → ${targetNode.type} is not allowed.`;
  if (edges.some((e) => e.source === sourceNode.id && e.target === targetNode.id)) return 'This connection already exists.';
  if (sourceNode.type === 'device') {
    if (edges.some((e) => e.source === sourceNode.id)) return 'A device can connect to only one cylinder.';
    if (edges.some((e) => e.target === targetNode.id && e.source !== sourceNode.id)) return 'A cylinder can have only one device.';
  }
  if (sourceNode.type === 'cylinder' && edges.some((e) => e.source === sourceNode.id)) return 'A cylinder can belong to only one ward.';
  if (sourceNode.type === 'ward' && edges.some((e) => e.source === sourceNode.id)) return 'A ward can belong to only one floor.';
  return null;
}

function getBezierPath(start, end) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const controlOffset = Math.max(60, Math.min(160, dx / 2 + dy / 4));
  const isHorizontal = dx >= dy;
  const c1 = isHorizontal
    ? { x: start.x + (end.x >= start.x ? controlOffset : -controlOffset), y: start.y }
    : { x: start.x, y: start.y + (end.y >= start.y ? controlOffset : -controlOffset) };
  const c2 = isHorizontal
    ? { x: end.x - (end.x >= start.x ? controlOffset : -controlOffset), y: end.y }
    : { x: end.x, y: end.y - (end.y >= start.y ? controlOffset : -controlOffset) };
  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

export default function Mapping() {
  const { accessToken } = useAuth();
  const boardRef = useRef(null);
  const actionRef = useRef(null);
  const viewportRef = useRef({ x: 140, y: 100, zoom: 0.8 });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [movableNodeId, setMovableNodeId] = useState(null);
  const [activeConnection, setActiveConnection] = useState(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState(null);
  const [viewport, setViewport] = useState({ x: 140, y: 100, zoom: 0.8 });
  const [catalog, setCatalog] = useState({ floors: [], wards: [], cylinders: [], devices: [] });
  const [newFloor, setNewFloor] = useState({ name: '', code: '' });
  const [newWard, setNewWard] = useState({ name: '', code: '' });
  const [newCylinderNumber, setNewCylinderNumber] = useState('');
  const [newDeviceId, setNewDeviceId] = useState('');
  const [mappingView, setMappingView] = useState('map');
  const [tableDrafts, setTableDrafts] = useState({});
  const [tableSavingId, setTableSavingId] = useState(null);
  const [newConnection, setNewConnection] = useState({ cylinder_id: '', device_id: '', ward: '', floor: '' });

  function buildManualDeviceNode(deviceId) {
    const normalized = String(deviceId || '').trim();
    return {
      id: makeNodeId('device', normalized),
      type: 'device',
      sourceId: normalized,
      label: normalized,
      meta: {
        displayId: normalized,
        deviceKey: normalized,
        status: 'manual',
        libraryOnly: true
      },
      position: {
        x: 120,
        y: 120
      }
    };
  }

  function buildLibraryDeviceNode(deviceId) {
    const normalized = String(deviceId || '').trim();
    return {
      id: makeNodeId('device', normalized),
      type: 'device',
      sourceId: normalized,
      label: normalized,
      meta: {
        displayId: normalized,
        deviceKey: normalized,
        status: 'manual',
        libraryOnly: true
      },
      position: { x: 120, y: 120 }
    };
  }

  function remapNodeSourceId(list, type, fromSourceId, toSourceId, nextLabel, nextDisplayId) {
    const oldNodeId = makeNodeId(type, fromSourceId);
    const nextNodeId = makeNodeId(type, toSourceId);

    return list.map((node) => {
      if (node.id !== oldNodeId) return node;
      return {
        ...node,
        id: nextNodeId,
        sourceId: toSourceId,
        label: nextLabel,
        meta: {
          ...(node.meta || {}),
          displayId: nextDisplayId
        }
      };
    });
  }

  function remapEdges(list, type, fromSourceId, toSourceId) {
    const oldNodeId = makeNodeId(type, fromSourceId);
    const nextNodeId = makeNodeId(type, toSourceId);
    return list.map((edge) => ({
      ...edge,
      id: `${edge.source === oldNodeId ? nextNodeId : edge.source}->${edge.target === oldNodeId ? nextNodeId : edge.target}`,
      source: edge.source === oldNodeId ? nextNodeId : edge.source,
      target: edge.target === oldNodeId ? nextNodeId : edge.target
    }));
  }

  async function persistWorkspace(nextNodes, nextEdges, options = {}) {
    const { showToast = false } = options;
    if (!accessToken) return false;

    setSaving(true);
    try {
      await apiJson('/api/mapping/workspace', {
        token: accessToken,
        method: 'PUT',
        body: { nodes: nextNodes, edges: nextEdges }
      });
      setDirty(false);
      if (showToast) toast.success('Mapping saved');
      await loadWorkspace();
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function loadWorkspace() {
    if (!accessToken) return;
    setLoading(true);
    try {
      const res = await apiJson('/api/mapping/workspace', { token: accessToken });
      setNodes(res.workspace?.nodes || []);
      setEdges(res.workspace?.edges || []);
      setCatalog(res.catalog || { floors: [], wards: [], cylinders: [], devices: [] });
      setDirty(false);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadWorkspace(); }, [accessToken]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  function zoomWorkspaceAt(clientX, clientY, deltaY) {
    const board = boardRef.current;
    if (!board) return;

    const rect = board.getBoundingClientRect();
    const currentViewport = viewportRef.current;
    const zoomDelta = deltaY < 0 ? 1.08 : 0.92;
    const nextZoom = Math.max(0.35, Math.min(2, currentViewport.zoom * zoomDelta));
    const pointerWorldX = (clientX - rect.left - currentViewport.x) / currentViewport.zoom;
    const pointerWorldY = (clientY - rect.top - currentViewport.y) / currentViewport.zoom;

    setViewport({
      zoom: nextZoom,
      x: clientX - rect.left - pointerWorldX * nextZoom,
      y: clientY - rect.top - pointerWorldY * nextZoom
    });
  }

  useEffect(() => {
    function handleGlobalWheel(event) {
      const board = boardRef.current;
      if (!board) return;
      if (!board.contains(event.target)) return;

      event.preventDefault();
      zoomWorkspaceAt(event.clientX, event.clientY, event.deltaY);
    }

    window.addEventListener('wheel', handleGlobalWheel, { passive: false });
    return () => {
      window.removeEventListener('wheel', handleGlobalWheel);
    };
  }, []);

  useEffect(() => {
  function handlePointerMove(event) {
  const action = actionRef.current;

  if (!action) {
    setActiveConnection(null);
    return;
  }

  if (action.type === 'pan') {
    setViewport((prev) => ({
      ...prev,
      x: action.startViewport.x + (event.clientX - action.startPoint.x),
      y: action.startViewport.y + (event.clientY - action.startPoint.y)
    }));
  }

  if (action.type === 'drag-node') {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;

    const world = screenToWorld(
      { x: event.clientX, y: event.clientY },
      viewport,
      rect
    );

    setNodes((prev) =>
      prev.map((node) =>
        node.id === action.nodeId
          ? {
              ...node,
              position: {
                x: Math.max(
                  20,
                  Math.min(
                    WORLD_WIDTH - NODE_WIDTH - 20,
                    world.x - action.offset.x
                  )
                ),
                y: Math.max(
                  20,
                  Math.min(
                    WORLD_HEIGHT - NODE_HEIGHT - 20,
                    world.y - action.offset.y
                  )
                )
              }
            }
          : node
      )
    );

    setDirty(true);
  }

  if (action.type === 'prepare-drag-node') {
    const movedX = event.clientX - action.startPoint.x;
    const movedY = event.clientY - action.startPoint.y;

    if (
      Math.hypot(movedX, movedY) < 12 ||
      Date.now() - action.startedAt < 70
    )
      return;

    actionRef.current = {
      type: 'drag-node',
      nodeId: action.nodeId,
      offset: action.offset
    };
  }

  if (action.type === 'connect-edge') {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;

    const world = screenToWorld(
      { x: event.clientX, y: event.clientY },
      viewport,
      rect
    );

    setActiveConnection({
      sourceId: action.sourceId,
      point: world
    });
  }
}

function handlePointerUp(event) {
  const action = actionRef.current;

  if (action?.type === 'connect-edge') {
    const targetElement = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-node-id]');
    const targetNodeId = targetElement?.getAttribute('data-node-id');
    const targetNode = targetNodeId ? nodeMap.get(targetNodeId) : null;

    if (targetNode) {
      finishConnection(targetNode);
      return;
    }
  }

  setActiveConnection(null);
  actionRef.current = null;
}

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => { window.removeEventListener('pointermove', handlePointerMove); window.removeEventListener('pointerup', handlePointerUp); };
  }, [viewport, nodeMap, edges, nodes, activeConnection]);

  const catalogSections = useMemo(() => [
    { key: 'floors', label: 'Floors', items: catalog.floors.map((i) => buildCatalogItem('floor', i)).filter((i) => !nodes.some((n) => n.id === makeNodeId(i.type, i.sourceId))) },
    { key: 'wards', label: 'Wards', items: catalog.wards.map((i) => buildCatalogItem('ward', i)).filter((i) => !nodes.some((n) => n.id === makeNodeId(i.type, i.sourceId))) },
    { key: 'cylinders', label: 'Cylinders', items: catalog.cylinders.map((i) => buildCatalogItem('cylinder', i)).filter((i) => !nodes.some((n) => n.id === makeNodeId(i.type, i.sourceId))) },
    { key: 'devices', label: 'Devices', items: catalog.devices.map((i) => buildCatalogItem('device', i)).filter((i) => !nodes.some((n) => n.id === makeNodeId(i.type, i.sourceId))) }
  ], [catalog, nodes]);

  const workspaceConnectionMap = useMemo(() => {
    const byCylinderId = new Map();

    for (const cylinderNode of nodes.filter((node) => node.type === 'cylinder')) {
      const incomingDeviceEdge = edges.find((edge) => edge.target === cylinderNode.id && nodeMap.get(edge.source)?.type === 'device');
      const wardEdge = edges.find((edge) => edge.source === cylinderNode.id && nodeMap.get(edge.target)?.type === 'ward');
      const wardNode = wardEdge ? nodeMap.get(wardEdge.target) : null;
      const floorEdge = wardNode ? edges.find((edge) => edge.source === wardNode.id && nodeMap.get(edge.target)?.type === 'floor') : null;
      const floorNode = floorEdge ? nodeMap.get(floorEdge.target) : null;
      const deviceNode = incomingDeviceEdge ? nodeMap.get(incomingDeviceEdge.source) : null;

      byCylinderId.set(String(cylinderNode.sourceId || ''), {
        cylinder_num: cylinderNode.label || cylinderNode.meta?.displayId || '',
        device_id: deviceNode?.sourceId || deviceNode?.label || '',
        ward: wardNode?.label || '',
        floor: floorNode?.label || ''
      });
    }

    return byCylinderId;
  }, [nodes, edges, nodeMap]);

  const viewportBox = useMemo(() => {
    const mapWidth = 200;
    const mapHeight = 128;
    return {
      width: (boardRef.current?.clientWidth || 0) / viewport.zoom / WORLD_WIDTH * mapWidth,
      height: (boardRef.current?.clientHeight || 0) / viewport.zoom / WORLD_HEIGHT * mapHeight,
      left: (-viewport.x / viewport.zoom / WORLD_WIDTH) * mapWidth,
      top: (-viewport.y / viewport.zoom / WORLD_HEIGHT) * mapHeight
    };
  }, [viewport, nodes.length]);

  function addNodeToBoard(item, position) {
    const nodeId = makeNodeId(item.type, item.sourceId);
    if (nodes.some((n) => n.id === nodeId)) {
      toast.error('Already in workspace.');
      setSelectedNodeId(nodeId);
      return;
    }
    setNodes((prev) => [...prev, buildWorkspaceNode(item.type, item, position)]);
    setDirty(true);
  }

  function handlePaletteDragStart(event, item) { event.dataTransfer.setData('application/json', JSON.stringify(item)); }

  function handleBoardDrop(event) {
    event.preventDefault();
    const raw = event.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const item = JSON.parse(raw);
      const rect = boardRef.current?.getBoundingClientRect();
      if (!rect) return;
      addNodeToBoard(item, screenToWorld({ x: event.clientX, y: event.clientY }, viewport, rect));
    } catch { toast.error('Could not add item.'); }
  }

function handleBoardPointerDown(event) {
  // stop connection preview
  setActiveConnection(null);
  actionRef.current = null;

  if (event.target !== event.currentTarget) return;

  setSelectedNodeId(null);
  setMovableNodeId(null);

  actionRef.current = {
    type: 'pan',
    startPoint: {
      x: event.clientX,
      y: event.clientY
    },
    startViewport: viewport
  };
}

  function handleWheel(event) {
    event.preventDefault();
  }

function startNodeDrag(event, node) {
  // stop connection if active
  setActiveConnection(null);
  actionRef.current = null;

  if (movableNodeId !== node.id) return;

  event.stopPropagation();

  const rect = boardRef.current?.getBoundingClientRect();
  if (!rect) return;

  const world = screenToWorld(
    { x: event.clientX, y: event.clientY },
    viewport,
    rect
  );

  actionRef.current = {
    type: 'prepare-drag-node',
    nodeId: node.id,
    startPoint: {
      x: event.clientX,
      y: event.clientY
    },
    startedAt: Date.now(),
    offset: {
      x: world.x - node.position.x,
      y: world.y - node.position.y
    }
  };

  setSelectedNodeId(node.id);
}

function startConnectionDrag(event, node) {
  event.stopPropagation();

  // reset previous action
  setActiveConnection(null);
  actionRef.current = null;

  actionRef.current = {
    type: 'connect-edge',
    sourceId: node.id
  };

  setSelectedNodeId(node.id);

  setActiveConnection({
    sourceId: node.id,
    point: {
      x: node.position.x + NODE_WIDTH,
      y: node.position.y + NODE_HEIGHT / 2
    }
  });
}

  function removeNode(nodeId) {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId((prev) => prev === nodeId ? null : prev);
    setMovableNodeId((prev) => prev === nodeId ? null : prev);
    setActiveConnection((prev) => prev?.sourceId === nodeId ? null : prev);
    setDirty(true);
  }

  function removeEdge(edgeId) {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    setDirty(true);
  }

  async function finishConnection(targetNode) {
    const sourceId = actionRef.current?.type === 'connect-edge' ? actionRef.current.sourceId : activeConnection?.sourceId;
    if (!sourceId) return;
    const sourceNode = nodeMap.get(sourceId);
    const message = validateConnection(sourceNode, targetNode, edges);
    if (message) { toast.error(message); setActiveConnection(null); actionRef.current = null; return; }
    const nextEdges = [...edges, makeEdge(sourceNode.id, targetNode.id)];
    setEdges(nextEdges);
    setActiveConnection(null);
    actionRef.current = null;
    setDirty(true);
  }

  async function saveWorkspace() {
    let nextCatalog = {
      floors: [...catalog.floors],
      wards: [...catalog.wards],
      cylinders: [...catalog.cylinders],
      devices: [...catalog.devices]
    };
    let nextNodes = [...nodes];
    let nextEdges = [...edges];

    try {
      for (const floor of nextCatalog.floors.filter((item) => item._pending)) {
        const res = await apiJson('/api/mapping/floors', {
          token: accessToken,
          method: 'POST',
          body: { name: floor.name, code: floor.code || '' }
        });
        nextCatalog.floors = nextCatalog.floors.map((item) => item.id === floor.id ? res.floor : item);
        nextNodes = remapNodeSourceId(nextNodes, 'floor', floor.id, res.floor.id, res.floor.name, res.floor.code || res.floor.id);
        nextEdges = remapEdges(nextEdges, 'floor', floor.id, res.floor.id);
      }

      for (const ward of nextCatalog.wards.filter((item) => item._pending)) {
        const res = await apiJson('/api/mapping/wards', {
          token: accessToken,
          method: 'POST',
          body: { name: ward.name, code: ward.code || '' }
        });
        nextCatalog.wards = nextCatalog.wards.map((item) => item.id === ward.id ? res.ward : item);
        nextNodes = remapNodeSourceId(nextNodes, 'ward', ward.id, res.ward.id, res.ward.name, res.ward.code || res.ward.id);
        nextEdges = remapEdges(nextEdges, 'ward', ward.id, res.ward.id);
      }

      for (const cylinder of nextCatalog.cylinders.filter((item) => item._pending)) {
        const res = await apiJson('/api/mapping/cylinders', {
          token: accessToken,
          method: 'POST',
          body: { cylinder_number: cylinder.cylinder_num }
        });
        nextCatalog.cylinders = nextCatalog.cylinders.map((item) => item.id === cylinder.id ? res.cylinder : item);
        nextNodes = remapNodeSourceId(nextNodes, 'cylinder', cylinder.id, res.cylinder.id, res.cylinder.cylinder_num, res.cylinder.cylinder_num || res.cylinder.id);
        nextEdges = remapEdges(nextEdges, 'cylinder', cylinder.id, res.cylinder.id);
      }

      const libraryDeviceNodes = nextCatalog.devices
        .filter((device) => !nextNodes.some((node) => node.id === makeNodeId('device', device.id || device.device_id)))
        .map((device) => buildLibraryDeviceNode(device.device_id || device.id));

      setCatalog(nextCatalog);
      setNodes(nextNodes);
      setEdges(nextEdges);

      await persistWorkspace([...nextNodes, ...libraryDeviceNodes], nextEdges, { showToast: true });
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function createFloor(event) {
    event.preventDefault();
    const name = String(newFloor.name || '').trim();
    if (!name) return toast.error('Enter a floor name');
    if (catalog.floors.some((item) => String(item.name || '').trim().toLowerCase() === name.toLowerCase())) {
      return toast.error('Floor already exists');
    }
    setCatalog((prev) => ({
      ...prev,
      floors: [...prev.floors, { id: makeTempId('floor'), name, code: String(newFloor.code || '').trim() || null, _pending: true }]
    }));
    setNewFloor({ name: '', code: '' });
    setDirty(true);
    toast.success('Floor added to library');
  }

  async function createWard(event) {
    event.preventDefault();
    const name = String(newWard.name || '').trim();
    if (!name) return toast.error('Enter a ward name');
    if (catalog.wards.some((item) => String(item.name || '').trim().toLowerCase() === name.toLowerCase())) {
      return toast.error('Ward already exists');
    }
    setCatalog((prev) => ({
      ...prev,
      wards: [...prev.wards, { id: makeTempId('ward'), name, code: String(newWard.code || '').trim() || null, _pending: true }]
    }));
    setNewWard({ name: '', code: '' });
    setDirty(true);
    toast.success('Ward added to library');
  }

  async function createCylinder(event) {
    event.preventDefault();
    const cylinderNum = String(newCylinderNumber || '').trim();
    if (!cylinderNum) return toast.error('Enter a cylinder number');
    if (catalog.cylinders.some((item) => String(item.cylinder_num || '').trim().toLowerCase() === cylinderNum.toLowerCase())) {
      return toast.error('Cylinder already exists');
    }
    setCatalog((prev) => ({
      ...prev,
      cylinders: [
        { id: makeTempId('cylinder'), cylinder_num: cylinderNum, ward: 'Unassigned', floor: null, device_id: null, is_active: true, _pending: true },
        ...prev.cylinders
      ]
    }));
    setNewCylinderNumber('');
    setDirty(true);
    toast.success('Cylinder added to library');
  }

  async function createDevice(event) {
    event.preventDefault();
    try {
      const normalized = String(newDeviceId || '').trim();
      if (!normalized) {
        toast.error('Enter a device id');
        return;
      }
      const nodeId = makeNodeId('device', normalized);
      if (nodes.some((node) => node.id === nodeId) || catalog.devices.some((device) => makeNodeId('device', device.id || device.device_id) === nodeId)) {
        toast.error('Device already exists');
        return;
      }
      setCatalog((prev) => ({
        ...prev,
        devices: [{ id: normalized, device_id: normalized }, ...prev.devices]
      }));
      setDirty(true);
      setNewDeviceId('');
      toast.success('Device added');
    } catch (error) {
      toast.error(error.message);
    }
  }


  async function deleteCatalogItem(item) {
    const sectionKey = `${item.type}s`;
    const nodeId = makeNodeId(item.type, item.sourceId);

    if (item.type === 'device' || String(item.sourceId || '').startsWith(TEMP_PREFIX)) {
      setCatalog((prev) => ({
        ...prev,
        [sectionKey]: Array.isArray(prev[sectionKey])
          ? prev[sectionKey].filter((entry) => String(entry.id) !== String(item.sourceId))
          : prev[sectionKey]
      }));
      setNodes((prev) => prev.filter((node) => node.id !== nodeId));
      setEdges((prev) => prev.filter((edge) => edge.source !== nodeId && edge.target !== nodeId));
      setSelectedNodeId((prev) => (prev === nodeId ? null : prev));
      setMovableNodeId((prev) => (prev === nodeId ? null : prev));
      setActiveConnection((prev) => (prev?.sourceId === nodeId ? null : prev));
      setDirty(true);
      toast.success(`${item.type} removed from library`);
      return;
    }

    const endpoint = item.type === 'cylinder'
      ? `/api/mapping/cylinders/${item.sourceId}`
      : item.type === 'floor'
      ? `/api/mapping/floors/${item.sourceId}`
      : item.type === 'ward'
      ? `/api/mapping/wards/${item.sourceId}`
      : null;

    if (!endpoint) return;

    try {
      await apiJson(endpoint, { token: accessToken, method: 'DELETE' });
      toast.success(`${item.type} deleted`);
      await loadWorkspace();
    } catch (error) {
      toast.error(error.message);
    }
  }

  function updateTableDraft(id, patch) {
    setTableDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }

  function getTableRow(cylinder) {
    const draft = tableDrafts[cylinder.id] || {};
    const workspaceRow = workspaceConnectionMap.get(String(cylinder.id || '')) || {};
    return {
      cylinder_num: draft.cylinder_num ?? workspaceRow.cylinder_num ?? cylinder.cylinder_num ?? '',
      device_id: draft.device_id ?? workspaceRow.device_id ?? cylinder.device_id ?? '',
      ward: draft.ward ?? workspaceRow.ward ?? cylinder.ward ?? '',
      floor: draft.floor ?? workspaceRow.floor ?? cylinder.floor ?? ''
    };
  }

  function isTableRowDirty(cylinder) {
    if (!tableDrafts[cylinder.id]) return false;
    const row = getTableRow(cylinder);
    const workspaceRow = workspaceConnectionMap.get(String(cylinder.id || '')) || {};
    return (
      String(row.cylinder_num) !== String(workspaceRow.cylinder_num ?? cylinder.cylinder_num ?? '') ||
      String(row.device_id) !== String(workspaceRow.device_id ?? cylinder.device_id ?? '') ||
      String(row.ward) !== String(workspaceRow.ward ?? cylinder.ward ?? '') ||
      String(row.floor) !== String(workspaceRow.floor ?? cylinder.floor ?? '')
    );
  }

  function nextTablePosition(type, index = 0) {
    const columnX = {
      device: 140,
      cylinder: 470,
      ward: 800,
      floor: 1130
    };
    return {
      x: columnX[type] || 140,
      y: 120 + (index % 6) * 140
    };
  }

  function ensureWorkspaceNode(nextNodes, type, item) {
    const nodeId = makeNodeId(type, item.id);
    const existing = nextNodes.find((node) => node.id === nodeId);
    const catalogItem = buildCatalogItem(type, item);

    if (existing) {
      return nextNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              label: catalogItem.title,
              meta: {
                displayId: catalogItem.displayId,
                ...catalogItem.meta
              }
            }
          : node
      );
    }

    return [...nextNodes, buildWorkspaceNode(type, catalogItem, nextTablePosition(type, nextNodes.length))];
  }

  function upsertTableCatalog(nextCatalog, type, value, currentId = null) {
    const normalized = String(value || '').trim();
    if (!normalized) return { nextCatalog, item: null };

    if (type === 'device') {
      const existing = nextCatalog.devices.find(
        (device) => String(device.device_id || device.id || '').trim().toLowerCase() === normalized.toLowerCase()
      );
      if (existing) return { nextCatalog, item: { id: existing.id || existing.device_id, device_id: existing.device_id || existing.id } };

      const device = { id: normalized, device_id: normalized };
      return {
        nextCatalog: {
          ...nextCatalog,
          devices: [device, ...nextCatalog.devices]
        },
        item: device
      };
    }

    if (type === 'ward') {
      const existing = nextCatalog.wards.find((ward) => String(ward.name || '').trim().toLowerCase() === normalized.toLowerCase());
      if (existing) return { nextCatalog, item: existing };

      const ward = { id: makeTempId('ward'), name: normalized, code: null, _pending: true };
      return {
        nextCatalog: {
          ...nextCatalog,
          wards: [...nextCatalog.wards, ward]
        },
        item: ward
      };
    }

    if (type === 'floor') {
      const existing = nextCatalog.floors.find((floor) => String(floor.name || '').trim().toLowerCase() === normalized.toLowerCase());
      if (existing) return { nextCatalog, item: existing };

      const floor = { id: makeTempId('floor'), name: normalized, code: null, _pending: true };
      return {
        nextCatalog: {
          ...nextCatalog,
          floors: [...nextCatalog.floors, floor]
        },
        item: floor
      };
    }

    const existing =
      nextCatalog.cylinders.find((cylinder) => String(cylinder.id || '').trim() === String(currentId || '').trim()) ||
      nextCatalog.cylinders.find((cylinder) => String(cylinder.cylinder_num || '').trim().toLowerCase() === normalized.toLowerCase());
    if (existing) {
      const updated = { ...existing, cylinder_num: normalized };
      return {
        nextCatalog: {
          ...nextCatalog,
          cylinders: nextCatalog.cylinders.map((cylinder) => (cylinder.id === updated.id ? updated : cylinder))
        },
        item: updated
      };
    }

    const cylinder = {
      id: makeTempId('cylinder'),
      cylinder_num: normalized,
      ward: 'Unassigned',
      floor: null,
      device_id: null,
      is_active: true,
      _pending: true
    };
    return {
      nextCatalog: {
        ...nextCatalog,
        cylinders: [cylinder, ...nextCatalog.cylinders]
      },
      item: cylinder
    };
  }

  function applyTableConnectionState(baseCylinder, values) {
    const normalized = {
      cylinder_num: String(values.cylinder_num || '').trim(),
      device_id: String(values.device_id || '').trim(),
      ward: String(values.ward || '').trim(),
      floor: String(values.floor || '').trim()
    };

    let nextCatalog = {
      floors: [...catalog.floors],
      wards: [...catalog.wards],
      cylinders: [...catalog.cylinders],
      devices: [...catalog.devices]
    };
    let nextNodes = [...nodes];
    let nextEdges = [...edges];

    const cylinderResult = upsertTableCatalog(nextCatalog, 'cylinder', normalized.cylinder_num, baseCylinder?.id || null);
    nextCatalog = cylinderResult.nextCatalog;
    const cylinderItem = {
      ...cylinderResult.item,
      ward: normalized.ward || 'Unassigned',
      floor: normalized.floor || null,
      device_id: normalized.device_id || null
    };
    nextCatalog.cylinders = nextCatalog.cylinders.map((cylinder) => (cylinder.id === cylinderItem.id ? cylinderItem : cylinder));
    nextNodes = ensureWorkspaceNode(nextNodes, 'cylinder', cylinderItem);

    let wardItem = null;
    let floorItem = null;
    let deviceItem = null;

    if (normalized.ward) {
      const wardResult = upsertTableCatalog(nextCatalog, 'ward', normalized.ward);
      nextCatalog = wardResult.nextCatalog;
      wardItem = wardResult.item;
      nextNodes = ensureWorkspaceNode(nextNodes, 'ward', wardItem);
    }

    if (normalized.floor) {
      const floorResult = upsertTableCatalog(nextCatalog, 'floor', normalized.floor);
      nextCatalog = floorResult.nextCatalog;
      floorItem = floorResult.item;
      nextNodes = ensureWorkspaceNode(nextNodes, 'floor', floorItem);
    }

    if (normalized.device_id) {
      const deviceResult = upsertTableCatalog(nextCatalog, 'device', normalized.device_id);
      nextCatalog = deviceResult.nextCatalog;
      deviceItem = deviceResult.item;
      nextNodes = ensureWorkspaceNode(nextNodes, 'device', deviceItem);
    }

    const cylinderNodeId = makeNodeId('cylinder', cylinderItem.id);
    const wardNodeId = wardItem ? makeNodeId('ward', wardItem.id) : null;
    const floorNodeId = floorItem ? makeNodeId('floor', floorItem.id) : null;
    const deviceNodeId = deviceItem ? makeNodeId('device', deviceItem.id || deviceItem.device_id) : null;

    nextEdges = nextEdges.filter((edge) => {
      if (edge.target === cylinderNodeId && nodeMap.get(edge.source)?.type === 'device') return false;
      if (edge.source === cylinderNodeId) return false;
      if (wardNodeId && edge.source === wardNodeId) return false;
      if (deviceNodeId && edge.source === deviceNodeId) return false;
      return true;
    });

    if (deviceNodeId) nextEdges = [...nextEdges, makeEdge(deviceNodeId, cylinderNodeId)];
    if (wardNodeId) nextEdges = [...nextEdges, makeEdge(cylinderNodeId, wardNodeId)];
    if (wardNodeId && floorNodeId) nextEdges = [...nextEdges, makeEdge(wardNodeId, floorNodeId)];

    setCatalog(nextCatalog);
    setNodes(nextNodes);
    setEdges(nextEdges);
    setDirty(true);

    return cylinderItem;
  }

  async function saveTableRow(cylinder) {
    const row = getTableRow(cylinder);
    setTableSavingId(cylinder.id);
    try {
      applyTableConnectionState(cylinder, row);
      toast.success('Connection updated. Click Save Mapping');
      setTableDrafts((prev) => {
        const next = { ...prev };
        delete next[cylinder.id];
        return next;
      });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setTableSavingId(null);
    }
  }

  async function deleteTableRow(cylinderId) {
    if (!confirm('Delete this cylinder?')) return;
    try {
      await apiJson(`/api/mapping/cylinders/${cylinderId}`, {
        token: accessToken,
        method: 'DELETE',
        queueOffline: true
      });
      toast.success('Cylinder deleted');
      await loadWorkspace();
    } catch (error) {
      toast.error(error.message);
    }
  }

  async function createTableConnection(event) {
    event.preventDefault();
    const cylinderValue = String(newConnection.cylinder_id || '').trim();
    if (!cylinderValue) return toast.error('Enter a cylinder');

    let matchedCylinder = tableCylinders.find(
      (cylinder) =>
        String(cylinder.id || '').trim() === cylinderValue ||
        String(cylinder.cylinder_num || '').trim().toLowerCase() === cylinderValue.toLowerCase()
    );

    try {
      applyTableConnectionState(matchedCylinder || null, {
        cylinder_num: cylinderValue,
        device_id: newConnection.device_id,
        ward: newConnection.ward,
        floor: newConnection.floor
      });
      toast.success('Connection created. Click Save Mapping');
      setNewConnection({ cylinder_id: '', device_id: '', ward: '', floor: '' });
    } catch (error) {
      toast.error(error.message);
    }
  }

  const typeOrder = ['device', 'cylinder', 'ward', 'floor'];
  const tableCylinders = useMemo(
    () => [...catalog.cylinders].sort((a, b) => String(a.cylinder_num || '').localeCompare(String(b.cylinder_num || ''))),
    [catalog.cylinders]
  );
  const availableDevices = useMemo(
    () => catalog.devices.map((device) => String(device.device_id || device.id || '').trim()).filter(Boolean),
    [catalog.devices]
  );
  const availableWards = useMemo(
    () => catalog.wards.map((ward) => String(ward.name || '').trim()).filter(Boolean),
    [catalog.wards]
  );
  const availableFloors = useMemo(
    () => catalog.floors.map((floor) => String(floor.name || '').trim()).filter(Boolean),
    [catalog.floors]
  );


  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-12 w-12 rounded-2xl border border-border/50 bg-surface/80 flex items-center justify-center">
              <GitBranch size={20} className="text-accent animate-pulse" />
            </div>
          </div>
          <div className="text-sm text-muted">Loading mapping workspace…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-surface/80 px-5 py-4 shadow-sm backdrop-blur sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border/50 bg-background/60">
            <Layers size={18} className="text-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-text leading-tight">Mapping Workspace</h2>
            <p className="text-xs text-muted">Build device → cylinder → ward → floor chains visually</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className={`flex items-center gap-1 rounded-xl border border-border/50 bg-background/60 p-1 ${mappingView === 'table' ? 'opacity-50' : ''}`}>
            <button
              onClick={() => setMappingView('map')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${mappingView === 'map' ? 'bg-accent text-white' : 'text-muted hover:bg-surface hover:text-text'}`}
            >
              Map
            </button>
            <button
              onClick={() => setMappingView('table')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${mappingView === 'table' ? 'bg-accent text-white' : 'text-muted hover:bg-surface hover:text-text'}`}
            >
              Table
            </button>
          </div>
          {/* Zoom controls */}
          <div className="flex items-center gap-1 rounded-xl border border-border/50 bg-background/60 p-1">
            <button onClick={() => setViewport((p) => ({ ...p, zoom: Math.max(0.35, p.zoom - 0.1) }))} className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-text">
              <ZoomOut size={14} />
            </button>
            <span className="min-w-[44px] text-center text-xs font-medium tabular-nums text-muted">
              {(viewport.zoom * 100).toFixed(0)}%
            </span>
            <button onClick={() => setViewport((p) => ({ ...p, zoom: Math.min(2, p.zoom + 0.1) }))} className="rounded-lg p-1.5 text-muted transition hover:bg-surface hover:text-text">
              <ZoomIn size={14} />
            </button>
          </div>

          {activeConnection && (
            <button
              onClick={() => { setActiveConnection(null); actionRef.current = null; }}
              disabled={mappingView === 'table'}
              className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-400 transition hover:bg-orange-500/15"
            >
              ✕ Cancel Connect
            </button>
          )}

          <button
            onClick={saveWorkspace}
            disabled={saving}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold shadow-lg transition disabled:opacity-60 ${
              dirty
                ? 'bg-accent text-white shadow-accent/20 hover:bg-accent/90'
                : 'border border-border/50 bg-surface text-muted'
            }`}
          >
            <Save size={14} />
            {saving ? 'Saving…' : dirty ? 'Save Mapping' : 'Saved'}
          </button>
        </div>
      </div>

      {/* ── Main layout ── */}
      {mappingView === 'map' ? (
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">

        {/* ── Sidebar ── */}
        <aside className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur">
          <div>
            <div className="text-sm font-semibold text-text">Library</div>
            <div className="text-xs text-muted mt-0.5">Drag items onto the canvas</div>
          </div>

          <div className="flex flex-col gap-2">
            {catalogSections.map((section) => {
              const theme = typeTheme[section.key.replace('s', '') === 'floor' ? 'floor' : section.key.slice(0, -1)];
              const sectionType = section.key.slice(0, -1);
              const t = typeTheme[sectionType] || typeTheme.floor;
              const Icon = t.icon;
              return (
                <div key={section.key} className="rounded-xl border border-border/40 bg-background/50 p-3">
                  <div className="mb-2 flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md" style={{ background: `${t.accent}20` }}>
                      <Icon size={11} style={{ color: t.accent }} />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted">{section.label}</span>
                    <span className="ml-auto rounded-full bg-border/40 px-1.5 py-0.5 text-[10px] font-medium text-muted tabular-nums">
                      {section.items.length}
                    </span>
                  </div>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
                    {section.items.map((item) => {
                      const ItemIcon = t.icon;
                      return (
                        <div
                          key={makeNodeId(item.type, item.sourceId)}
                          draggable
                          onDragStart={(e) => handlePaletteDragStart(e, item)}
                          className="group flex cursor-grab items-center gap-2.5 rounded-lg border border-border/30 bg-surface/80 px-3 py-2 transition hover:border-accent/30 hover:bg-surface active:cursor-grabbing"
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border" style={{ borderColor: `${t.accent}30`, background: `${t.accent}12` }}>
                            <ItemIcon size={13} style={{ color: t.accent }} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-semibold text-text">{item.title}</div>
                            <div className="truncate text-[10px] text-muted">{item.displayId}</div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              deleteCatalogItem(item);
                            }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="shrink-0 rounded-lg p-1 text-muted transition hover:bg-red-500/15 hover:text-red-400"
                            title={`Delete ${item.type}`}
                            draggable={false}
                          >
                            <Trash2 size={13} />
                          </button>
                          <ArrowRight size={12} className="shrink-0 text-border/60 transition group-hover:text-accent/60" />
                        </div>
                      );
                    })}
                    {section.items.length === 0 && (
                      <div className="py-2 text-center text-xs text-muted/60">All placed</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add Floor */}
          <form onSubmit={createFloor} className="rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Building2 size={13} className="text-amber-400" />
              <span className="text-xs font-semibold text-text">New Floor</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <input value={newFloor.name} onChange={(e) => setNewFloor((p) => ({ ...p, name: e.target.value }))} placeholder="Floor name" className="w-full rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs focus:border-accent/50 focus:outline-none" />
              <input value={newFloor.code} onChange={(e) => setNewFloor((p) => ({ ...p, code: e.target.value }))} placeholder="Code (optional)" className="w-full rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs focus:border-accent/50 focus:outline-none" />
              <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent/40 hover:text-accent">
                <Plus size={12} /> Add Floor
              </button>
            </div>
          </form>

          {/* Add Ward */}
          <form onSubmit={createWard} className="rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <MapIcon size={13} className="text-emerald-400" />
              <span className="text-xs font-semibold text-text">New Ward</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <input value={newWard.name} onChange={(e) => setNewWard((p) => ({ ...p, name: e.target.value }))} placeholder="Ward name" className="w-full rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs focus:border-accent/50 focus:outline-none" />
              <input value={newWard.code} onChange={(e) => setNewWard((p) => ({ ...p, code: e.target.value }))} placeholder="Code (optional)" className="w-full rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs focus:border-accent/50 focus:outline-none" />
              <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent/40 hover:text-accent">
                <Plus size={12} /> Add Ward
              </button>
            </div>
          </form>

          <form onSubmit={createCylinder} className="rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Droplets size={13} className="text-blue-400" />
              <span className="text-xs font-semibold text-text">New Cylinder</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <input
                value={newCylinderNumber}
                onChange={(e) => setNewCylinderNumber(e.target.value)}
                placeholder="Cylinder number"
                className="w-full rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs focus:border-accent/50 focus:outline-none"
              />
              <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent/40 hover:text-accent">
                <Plus size={12} /> Add Cylinder
              </button>
            </div>
          </form>

          <form onSubmit={createDevice} className="rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <Cpu size={13} className="text-red-400" />
              <span className="text-xs font-semibold text-text">New Device</span>
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              <input
                value={newDeviceId}
                onChange={(e) => setNewDeviceId(e.target.value)}
                placeholder="Device ID"
                className="w-full rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs focus:border-accent/50 focus:outline-none"
              />
              <button className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-medium transition hover:border-accent/40 hover:text-accent">
                <Plus size={12} /> Add Device
              </button>
            </div>
          </form>

          {/* Legend */}
          <div className="rounded-xl border border-border/40 bg-background/50 p-3">
            <div className="mb-2 text-xs font-semibold text-muted">Flow Direction</div>
            <div className="flex items-center gap-1 flex-wrap">
              {typeOrder.map((t, i) => {
                const theme = typeTheme[t];
                const Icon = theme.icon;
                return (
                  <React.Fragment key={t}>
                    <div className="flex items-center gap-1 rounded-lg px-2 py-1" style={{ background: `${theme.accent}12`, border: `1px solid ${theme.accent}25` }}>
                      <Icon size={10} style={{ color: theme.accent }} />
                      <span className="text-[10px] font-medium" style={{ color: theme.accent }}>{theme.label}</span>
                    </div>
                    {i < typeOrder.length - 1 && <ArrowRight size={9} className="text-border/50" />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ── Canvas ── */}
        <section className="relative overflow-hidden rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur">
          {/* Canvas header */}
          <div className="flex items-center justify-between border-b border-border/40 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-accent/60 animate-pulse" />
              <span className="text-xs font-semibold text-text">Mapping Workspace</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="tabular-nums">{nodes.length} nodes</span>
              <span className="h-3 w-px bg-border/40" />
              <span className="tabular-nums">{edges.length} edges</span>
              {activeConnection && (
                <>
                  <span className="h-3 w-px bg-border/40" />
                  <span className="text-orange-400 font-medium animate-pulse">● Connecting…</span>
                </>
              )}
            </div>
          </div>

          {/* Drag canvas */}
          <div
            ref={boardRef}
            className="relative h-[74vh] min-h-[600px] overflow-hidden"
            style={{
              backgroundImage: `radial-gradient(circle, rgba(var(--color-border-raw, 100 100 100) / 0.18) 1px, transparent 1px)`,
              backgroundSize: '28px 28px',
              cursor: activeConnection ? 'crosshair' : 'default',
              touchAction: 'none',
              userSelect: 'none'
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleBoardDrop}
            onPointerDown={handleBoardPointerDown}
          >
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{ width: WORLD_WIDTH, height: WORLD_HEIGHT, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
            >

              {/* ── SVG Edges ── */}
              <svg width={WORLD_WIDTH} height={WORLD_HEIGHT} className="absolute inset-0 overflow-visible pointer-events-none">
                <defs>
                  {/* Gradient arrow head */}
                  <marker id="arrow-head" markerWidth="16" markerHeight="16" refX="13" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M2,2 L14,6 L2,10 L5,6 Z" fill="rgba(99,179,237,0.95)" />
                  </marker>
                  <marker id="arrow-head-hover" markerWidth="16" markerHeight="16" refX="13" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M2,2 L14,6 L2,10 L5,6 Z" fill="rgba(248,113,113,0.95)" />
                  </marker>
                  <marker id="arrow-head-preview" markerWidth="16" markerHeight="16" refX="13" refY="6" orient="auto" markerUnits="userSpaceOnUse">
                    <path d="M2,2 L14,6 L2,10 L5,6 Z" fill="rgba(251,146,60,0.9)" />
                  </marker>
                  <filter id="edge-glow">
                    <feGaussianBlur stdDeviation="2" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" />
                  </filter>
                </defs>

                {/* Existing edges */}
                {edges.map((edge) => {
                  const source = nodeMap.get(edge.source);
                  const target = nodeMap.get(edge.target);
                  if (!source || !target) return null;
                  const { start, end } = getEdgeAnchors(source, target);
                  const path = getBezierPath(start, end);
                  const isHovered = hoveredEdgeId === edge.id;
                  return (
                    <g key={edge.id} className="pointer-events-auto" style={{ cursor: 'pointer' }}>
                      {/* Hit area */}
                      <path d={path} fill="none" stroke="transparent" strokeWidth="16" onMouseEnter={() => setHoveredEdgeId(edge.id)} onMouseLeave={() => setHoveredEdgeId(null)} onClick={() => removeEdge(edge.id)} />
                      {/* Glow layer */}
                      {isHovered && (
                        <path d={path} fill="none" stroke="rgba(248,113,113,0.2)" strokeWidth="8" strokeLinecap="round" filter="url(#edge-glow)" />
                      )}
                      {/* Main stroke */}
                      <path
                        d={path}
                        fill="none"
                        stroke={isHovered ? 'rgba(248,113,113,0.9)' : 'rgba(99,179,237,0.85)'}
                        strokeWidth={isHovered ? '2.5' : '2'}
                        strokeLinecap="round"
                        markerEnd={isHovered ? 'url(#arrow-head-hover)' : 'url(#arrow-head)'}
                        style={{ transition: 'stroke 0.15s, stroke-width 0.15s' }}
                      />
                      {/* Delete hint on hover */}
                      {isHovered && (() => {
                        const mx = (start.x + end.x) / 2;
                        const my = (start.y + end.y) / 2;
                        return (
                          <g onMouseEnter={() => setHoveredEdgeId(edge.id)} onMouseLeave={() => setHoveredEdgeId(null)} onClick={() => removeEdge(edge.id)}>
                            <circle cx={mx} cy={my} r={12} fill="rgba(248,113,113,0.15)" stroke="rgba(248,113,113,0.5)" strokeWidth="1.5" />
                            <line x1={mx - 5} y1={my - 5} x2={mx + 5} y2={my + 5} stroke="rgba(248,113,113,0.9)" strokeWidth="2" strokeLinecap="round" />
                            <line x1={mx + 5} y1={my - 5} x2={mx - 5} y2={my + 5} stroke="rgba(248,113,113,0.9)" strokeWidth="2" strokeLinecap="round" />
                          </g>
                        );
                      })()}
                    </g>
                  );
                })}

                {/* Preview edge while connecting */}
                {activeConnection && (() => {
                  const source = nodeMap.get(activeConnection.sourceId);
                  if (!source) return null;
                  const sourceCenter = getNodeCenter(source);
                  const end = activeConnection.point;
                  const start = Math.abs(end.x - sourceCenter.x) >= Math.abs(end.y - sourceCenter.y)
                    ? getAnchorPoint(source, end.x >= sourceCenter.x ? 'right' : 'left')
                    : getAnchorPoint(source, end.y >= sourceCenter.y ? 'bottom' : 'top');
                  const path = getBezierPath(start, end);
                  return (
                    <>
                      <path d={path} fill="none" stroke="rgba(251,146,60,0.2)" strokeWidth="8" strokeLinecap="round" filter="url(#edge-glow)" />
                      <path d={path} fill="none" stroke="rgba(251,146,60,0.85)" strokeWidth="2" strokeLinecap="round" strokeDasharray="10 6" markerEnd="url(#arrow-head-preview)" />
                    </>
                  );
                })()}
              </svg>

              {/* ── Nodes ── */}
              {nodes.map((node) => {
                const theme = typeTheme[node.type];
                const Icon = theme.icon;
                const isSelected = selectedNodeId === node.id;
                const isMovable = movableNodeId === node.id;
                const isConnectSource = activeConnection?.sourceId === node.id;
                const canAccept = Boolean(
                  activeConnection &&
                  activeConnection.sourceId !== node.id &&
                  allowedTargets[nodeMap.get(activeConnection.sourceId)?.type || '']?.includes(node.type)
                );
                const canConnect = allowedTargets[node.type]?.length > 0;

                return (
                  <div
                    key={node.id}
                    data-node-id={node.id}
                    className="absolute rounded-xl border transition-all duration-150"
                    style={{
                      left: node.position.x,
                      top: node.position.y,
                      width: NODE_WIDTH,
                      minHeight: NODE_HEIGHT,
                      borderColor: canAccept
                        ? `${typeTheme.ward.accent}80`
                        : isConnectSource
                        ? `${typeTheme.cylinder.accent}80`
                        : isMovable
                        ? `${theme.accent}90`
                        : isSelected
                        ? `${theme.accent}50`
                        : `${theme.accent}22`,
                      background: canAccept
                        ? `${typeTheme.ward.accent}12`
                        : `${theme.accent}08`,
                      boxShadow: isMovable
                        ? `0 0 0 2px ${theme.accent}60, 0 8px 24px ${theme.accent}20`
                        : isSelected
                        ? `0 0 0 1.5px ${theme.accent}35, 0 4px 16px ${theme.accent}15`
                        : canAccept
                        ? `0 0 0 2px ${typeTheme.ward.accent}50`
                        : `0 2px 8px rgba(0,0,0,0.12)`,
                      cursor: isMovable ? 'move' : 'pointer'
                    }}
                    onPointerDown={(e) => startNodeDrag(e, node)}
                    onPointerUp={(e) => { e.stopPropagation(); if (actionRef.current?.type === 'connect-edge') finishConnection(node); }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedNodeId(node.id);
                      setMovableNodeId((prev) => prev === node.id ? null : node.id);
                    }}
                  >
                    <div className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {/* Icon badge */}
                          <div
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
                            style={{ borderColor: `${theme.accent}30`, background: `${theme.accent}15` }}
                          >
                            <Icon size={16} style={{ color: theme.accent }} />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-text leading-tight">{node.label}</div>
                            <div className="truncate text-[10px] uppercase tracking-widest mt-0.5" style={{ color: theme.accent }}>
                              {theme.label}
                            </div>
                          </div>
                        </div>

                        {/* Delete */}
                        <button
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                          className="shrink-0 rounded-lg p-1 text-muted transition hover:bg-red-500/15 hover:text-red-400"
                          title="Remove node"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>

                      {/* Meta row */}
                      <div className="mt-2 flex items-center justify-between">
                        <div className="truncate text-[10px] text-muted font-mono">{node.meta?.displayId || node.sourceId}</div>
                        {/* Move indicator */}
                        <div
                          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 transition"
                          style={{
                            background: isMovable ? `${theme.accent}18` : 'transparent',
                            border: `1px solid ${isMovable ? `${theme.accent}35` : 'transparent'}`
                          }}
                        >
                          {isMovable
                            ? <Move size={10} style={{ color: theme.accent }} />
                            : <Lock size={10} className="text-muted/40" />}
                          <span className="text-[9px] font-medium" style={{ color: isMovable ? theme.accent : undefined }}>
                            {isMovable ? 'Move' : 'Locked'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Input port — left */}
                    <div
                      className="pointer-events-none absolute -left-2 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-surface shadow-md"
                      style={{ background: theme.accent }}
                    />

                    {/* Output port — right (connect button) */}
                    {canConnect && (
                      <button
                        onPointerDown={(e) => startConnectionDrag(e, node)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute -right-3.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface shadow-lg transition hover:scale-110 active:scale-95"
                        style={{ background: theme.accent }}
                        title="Drag to connect"
                      >
                        <ArrowRight size={12} className="text-white" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Minimap ── */}
            <div className="pointer-events-none absolute bottom-4 right-4 rounded-xl border border-border/50 bg-surface/95 p-3 shadow-xl backdrop-blur">
              <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-muted">Minimap</div>
              <div className="relative h-32 w-[200px] overflow-hidden rounded-lg border border-border/40 bg-background/80">
                {/* Edge lines in minimap */}
                <svg className="absolute inset-0" width={200} height={128}>
                  {edges.map((edge) => {
                    const source = nodeMap.get(edge.source);
                    const target = nodeMap.get(edge.target);
                    if (!source || !target) return null;
                    return (
                      <line
                        key={edge.id}
                        x1={(source.position.x / WORLD_WIDTH) * 200 + 3.5}
                        y1={(source.position.y / WORLD_HEIGHT) * 128 + 3}
                        x2={(target.position.x / WORLD_WIDTH) * 200 + 3.5}
                        y2={(target.position.y / WORLD_HEIGHT) * 128 + 3}
                        stroke="rgba(99,179,237,0.35)"
                        strokeWidth="1"
                      />
                    );
                  })}
                </svg>
                {/* Node dots */}
                {nodes.map((node) => {
                  const theme = typeTheme[node.type];
                  return (
                    <div
                      key={node.id}
                      className="absolute rounded-sm"
                      style={{
                        left: `${(node.position.x / WORLD_WIDTH) * 200}px`,
                        top: `${(node.position.y / WORLD_HEIGHT) * 128}px`,
                        width: '14px',
                        height: '8px',
                        background: `${theme.accent}70`,
                        border: `1px solid ${theme.accent}40`
                      }}
                    />
                  );
                })}
                {/* Viewport box */}
                <div
                  className="absolute border border-accent/60 bg-accent/8"
                  style={{
                    left: `${Math.max(0, viewportBox.left)}px`,
                    top: `${Math.max(0, viewportBox.top)}px`,
                    width: `${Math.min(200, viewportBox.width)}px`,
                    height: `${Math.min(128, viewportBox.height)}px`
                  }}
                />
              </div>
            </div>

            {/* ── Empty state ── */}
            {nodes.length === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-center opacity-40">
                  <GitBranch size={32} className="text-muted" />
                  <div className="text-sm font-medium text-muted">Drag items from the library to start mapping</div>
                  <div className="text-xs text-muted">Device → Cylinder → Ward → Floor</div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-surface/80 p-4 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold text-text">Create Connection</div>
            <form onSubmit={createTableConnection} className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
              <label className="text-xs text-muted">
                Cylinder
                <input
                  list="mapping-cylinder-options"
                  value={newConnection.cylinder_id}
                  onChange={(e) => setNewConnection((prev) => ({ ...prev, cylinder_id: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                  placeholder="Cylinder number"
                  required
                />
              </label>
              <label className="text-xs text-muted">
                Device ID
                <input
                  list="mapping-device-options"
                  value={newConnection.device_id}
                  onChange={(e) => setNewConnection((prev) => ({ ...prev, device_id: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                  placeholder="Device ID"
                />
              </label>
              <label className="text-xs text-muted">
                Ward
                <input
                  list="mapping-ward-options"
                  value={newConnection.ward}
                  onChange={(e) => setNewConnection((prev) => ({ ...prev, ward: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                  placeholder="Ward"
                />
              </label>
              <label className="text-xs text-muted">
                Floor
                <input
                  list="mapping-floor-options"
                  value={newConnection.floor}
                  onChange={(e) => setNewConnection((prev) => ({ ...prev, floor: e.target.value }))}
                  className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                  placeholder="Floor"
                />
              </label>
              <div className="md:col-span-4">
                <button className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/90">
                  Create Connection
                </button>
              </div>
            </form>
            <datalist id="mapping-device-options">
              {availableDevices.map((deviceId) => (
                <option key={deviceId} value={deviceId} />
              ))}
            </datalist>
            <datalist id="mapping-cylinder-options">
              {tableCylinders.map((cylinder) => (
                <option key={cylinder.id} value={cylinder.cylinder_num || cylinder.id} />
              ))}
            </datalist>
            <datalist id="mapping-ward-options">
              {availableWards.map((ward) => (
                <option key={ward} value={ward} />
              ))}
            </datalist>
            <datalist id="mapping-floor-options">
              {availableFloors.map((floor) => (
                <option key={floor} value={floor} />
              ))}
            </datalist>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border/50 bg-surface/50 text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Cylinder</th>
                    <th className="px-5 py-4 font-semibold">Device</th>
                    <th className="px-5 py-4 font-semibold">Ward</th>
                    <th className="px-5 py-4 font-semibold">Floor</th>
                    <th className="px-5 py-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {tableCylinders.map((cylinder) => {
                    const row = getTableRow(cylinder);
                    const dirty = isTableRowDirty(cylinder);
                    const saving = tableSavingId === cylinder.id;
                    return (
                      <tr key={cylinder.id} className="group transition hover:bg-accent/5">
                        <td className="px-5 py-4">
                          <input
                            value={row.cylinder_num}
                            onChange={(e) => updateTableDraft(cylinder.id, { cylinder_num: e.target.value })}
                            className="w-36 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm outline-none"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <input
                            list="mapping-device-options"
                            value={row.device_id}
                            onChange={(e) => updateTableDraft(cylinder.id, { device_id: e.target.value })}
                            className="w-48 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm outline-none"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <input
                            list="mapping-ward-options"
                            value={row.ward}
                            onChange={(e) => updateTableDraft(cylinder.id, { ward: e.target.value })}
                            className="w-36 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm outline-none"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <input
                            list="mapping-floor-options"
                            value={row.floor}
                            onChange={(e) => updateTableDraft(cylinder.id, { floor: e.target.value })}
                            className="w-36 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm outline-none"
                          />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => saveTableRow(cylinder)}
                              disabled={!dirty || saving}
                              className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
                            >
                              <Save size={14} />
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => deleteTableRow(cylinder.id)}
                              className="inline-flex items-center gap-2 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-danger/90"
                            >
                              <Trash2 size={14} />
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

