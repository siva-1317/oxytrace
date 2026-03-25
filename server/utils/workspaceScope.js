import { supabaseAdmin } from '../services/supabaseAdmin.js';

const WORKSPACE_KEY = 'main-workspace';

export async function getWorkspaceRow() {
  const { data, error } = await supabaseAdmin
    .from('workspace_mappings')
    .select('nodes')
    .eq('workspace_key', WORKSPACE_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data || null;
}

export async function getPlacedSourceIdSet(type) {
  const workspace = await getWorkspaceRow();
  const nodes = Array.isArray(workspace?.nodes) ? workspace.nodes : [];
  return new Set(
    nodes
      .filter((node) => String(node?.type || '').trim() === type)
      .map((node) => String(node?.sourceId || '').trim())
      .filter(Boolean)
  );
}

export async function filterRowsByPlacedSourceId(type, rows) {
  const idSet = await getPlacedSourceIdSet(type);
  if (!idSet.size) return [];
  return (rows || []).filter((row) => idSet.has(String(row?.id || '').trim()));
}

export async function isPlacedSourceId(type, sourceId) {
  const idSet = await getPlacedSourceIdSet(type);
  return idSet.has(String(sourceId || '').trim());
}
