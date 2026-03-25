import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useCylinders } from '../hooks/useCylinders.js';
import { apiJson, formatDateTime } from '../lib/api.js';
import { loadHospitalProfile, saveHospitalProfile } from '../lib/hospitalProfile.js';

const tabs = [
  { key: 'profile', label: 'Hospital Details' },
  { key: 'cylinder-types', label: 'Cylinder Types' },
  { key: 'thresholds', label: 'Alert Thresholds' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'ai', label: 'AI Settings' }
];

export default function Settings() {
  const { user, accessToken } = useAuth();
  const { cylinders, refresh } = useCylinders();
  const [tab, setTab] = useState('profile');
  const [typeSavingId, setTypeSavingId] = useState(null);
  const [thresholds, setThresholds] = useState({
    low_gas_pct: 20,
    danger_gas_pct: 10,
    leak_warn_ppm: 120,
    leak_danger_ppm: 200,
    low_weight_kg: 10,
    danger_weight_kg: 5
  });
  const [hospitalProfile, setHospitalProfile] = useState(() => loadHospitalProfile());
  const [cylinderTypes, setCylinderTypes] = useState([]);
  const [typeDrafts, setTypeDrafts] = useState({});
  const [newType, setNewType] = useState({ type_name: '', full_weight: '', empty_weight: '' });

  const ingestUrl = `${import.meta.env.VITE_API_URL}/api/readings/ingest`;

  const ai = useMemo(() => ({
    key: localStorage.getItem('oxytrace-gemini-key') || '',
    model: localStorage.getItem('oxytrace-gemini-model') || 'gemini-3-flash',
    temp: Number(localStorage.getItem('oxytrace-gemini-temp') || 0.4)
  }), []);

  const [aiKey, setAiKey] = useState(ai.key);
  const [aiModel, setAiModel] = useState(ai.model);
  const [aiTemp, setAiTemp] = useState(ai.temp);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    async function loadSettings() {
      try {
        const [thresholdRes, typeRes] = await Promise.all([
          apiJson('/api/settings/thresholds', { token: accessToken }),
          apiJson('/api/settings/cylinder-types', { token: accessToken })
        ]);
        if (!cancelled && thresholdRes?.thresholds) {
          setThresholds((prev) => ({ ...prev, ...thresholdRes.thresholds }));
        }
        if (!cancelled) {
          setCylinderTypes(typeRes?.cylinderTypes || []);
        }
      } catch (e) {
        toast.error(e.message);
      }
    }

    loadSettings();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function updateTypeDraft(id, patch) {
    setTypeDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }

  function getTypeRow(type) {
    const draft = typeDrafts[type.id] || {};
    return {
      type_name: draft.type_name ?? type.type_name ?? '',
      full_weight: draft.full_weight ?? type.full_weight ?? '',
      empty_weight: draft.empty_weight ?? type.empty_weight ?? ''
    };
  }

  function isTypeDirty(type) {
    if (!typeDrafts[type.id]) return false;
    const row = getTypeRow(type);
    return (
      String(row.type_name) !== String(type.type_name ?? '') ||
      Number(row.full_weight) !== Number(type.full_weight ?? 0) ||
      Number(row.empty_weight) !== Number(type.empty_weight ?? 0)
    );
  }

  async function saveThresholds() {
    try {
      await apiJson('/api/settings/thresholds', {
        token: accessToken,
        method: 'PATCH',
        body: thresholds,
        queueOffline: true
      });
      toast.success('Thresholds saved');
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function createCylinderType() {
    try {
      await apiJson('/api/settings/cylinder-types', {
        token: accessToken,
        method: 'POST',
        body: {
          type_name: String(newType.type_name || '').trim(),
          full_weight: Number(newType.full_weight),
          empty_weight: Number(newType.empty_weight)
        }
      });
      toast.success('Cylinder type created');
      setNewType({ type_name: '', full_weight: '', empty_weight: '' });
      const res = await apiJson('/api/settings/cylinder-types', { token: accessToken });
      setCylinderTypes(res.cylinderTypes || []);
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function saveCylinderType(type) {
    const row = getTypeRow(type);
    setTypeSavingId(type.id);
    try {
      await apiJson(`/api/settings/cylinder-types/${type.id}`, {
        token: accessToken,
        method: 'PATCH',
        body: {
          type_name: String(row.type_name || '').trim(),
          full_weight: Number(row.full_weight),
          empty_weight: Number(row.empty_weight)
        }
      });
      toast.success('Cylinder type saved');
      setTypeDrafts((prev) => {
        const next = { ...prev };
        delete next[type.id];
        return next;
      });
      const res = await apiJson('/api/settings/cylinder-types', { token: accessToken });
      setCylinderTypes(res.cylinderTypes || []);
      refresh();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setTypeSavingId(null);
    }
  }

  async function deleteCylinderType(typeId) {
    if (!confirm('Delete this cylinder type?')) return;
    try {
      await apiJson(`/api/settings/cylinder-types/${typeId}`, {
        token: accessToken,
        method: 'DELETE'
      });
      toast.success('Cylinder type deleted');
      setCylinderTypes((prev) => prev.filter((type) => type.id !== typeId));
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  }

  function saveHospitalDetails() {
    saveHospitalProfile(hospitalProfile);
    toast.success('Hospital details saved');
  }

  function saveAI() {
    localStorage.setItem('oxytrace-gemini-key', aiKey);
    localStorage.setItem('oxytrace-gemini-model', aiModel);
    localStorage.setItem('oxytrace-gemini-temp', String(aiTemp));
    toast.success('AI settings saved (local)');
  }

  async function testAI() {
    try {
      const res = await apiJson('/api/ai/test', {
        token: accessToken,
        method: 'POST',
        headers: {
          ...(aiKey ? { 'x-gemini-key': aiKey } : {}),
          ...(aiModel ? { 'x-gemini-model': aiModel } : {}),
          'x-gemini-temp': String(aiTemp)
        },
        body: { prompt: 'Say OK if you can read this.' }
      });
      toast.success(res.text || 'OK');
    } catch (e) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition shadow-sm border border-border/50 ${
              tab === t.key ? 'bg-accent text-white shadow-accent/20 border-transparent' : 'bg-surface text-text hover:border-accent hover:text-accent'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-lg font-semibold">Hospital details</div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-xs text-muted md:col-span-2">
              Hospital name
              <input value={hospitalProfile.hospital_name} onChange={(e) => setHospitalProfile((p) => ({ ...p, hospital_name: e.target.value }))} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-muted">
              Contact person
              <input value={hospitalProfile.contact_name} onChange={(e) => setHospitalProfile((p) => ({ ...p, contact_name: e.target.value }))} placeholder={user?.user_metadata?.full_name || ''} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-muted">
              Email
              <input value={hospitalProfile.email} onChange={(e) => setHospitalProfile((p) => ({ ...p, email: e.target.value }))} placeholder={user?.email || ''} type="email" className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
            </label>
          </div>
          <div className="mt-4">
            <button onClick={saveHospitalDetails} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">Save hospital details</button>
          </div>
        </div>
      ) : null}

      {tab === 'cylinder-types' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <div className="text-lg font-semibold">Cylinder types</div>
            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="text-xs text-muted">
                Type name
                <input value={newType.type_name} onChange={(e) => setNewType((p) => ({ ...p, type_name: e.target.value }))} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-muted">
                Full weight
                <input type="number" step="0.1" value={newType.full_weight} onChange={(e) => setNewType((p) => ({ ...p, full_weight: e.target.value }))} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs text-muted">
                Empty weight
                <input type="number" step="0.1" value={newType.empty_weight} onChange={(e) => setNewType((p) => ({ ...p, empty_weight: e.target.value }))} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
              </label>
            </div>
            <div className="mt-4">
              <button onClick={createCylinderType} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">Create type</button>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border/50 bg-surface/50 text-xs uppercase text-muted">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Type</th>
                    <th className="px-5 py-4 font-semibold">Full weight</th>
                    <th className="px-5 py-4 font-semibold">Empty weight</th>
                    <th className="px-5 py-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {cylinderTypes.map((type) => {
                    const row = getTypeRow(type);
                    const dirty = isTypeDirty(type);
                    const saving = typeSavingId === type.id;
                    return (
                      <tr key={type.id} className="group transition hover:bg-accent/5">
                        <td className="px-5 py-4"><input value={row.type_name} onChange={(e) => updateTypeDraft(type.id, { type_name: e.target.value })} className="w-48 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm outline-none" /></td>
                        <td className="px-5 py-4"><input type="number" step="0.1" value={row.full_weight} onChange={(e) => updateTypeDraft(type.id, { full_weight: e.target.value })} className="w-32 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm outline-none" /></td>
                        <td className="px-5 py-4"><input type="number" step="0.1" value={row.empty_weight} onChange={(e) => updateTypeDraft(type.id, { empty_weight: e.target.value })} className="w-32 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm outline-none" /></td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <button onClick={() => saveCylinderType(type)} disabled={!dirty || saving} className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:border-accent hover:text-accent disabled:opacity-50">
                              <Save size={14} />
                              {saving ? 'Saving...' : 'Save'}
                            </button>
                            <button onClick={() => deleteCylinderType(type.id)} className="inline-flex items-center gap-2 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-danger/90">
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
      ) : null}

      {tab === 'thresholds' ? (
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-lg font-semibold">Alert threshold controls</div>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Object.keys(thresholds).map((key) => (
              <label key={key} className="text-xs text-muted">
                {key}
                <input type="number" step="0.1" value={thresholds[key]} onChange={(e) => setThresholds((t) => ({ ...t, [key]: Number(e.target.value) }))} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
              </label>
            ))}
          </div>
          <div className="mt-4">
            <button onClick={saveThresholds} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">Save threshold settings</button>
          </div>
        </div>
      ) : null}

      {tab === 'integrations' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <div className="text-sm font-semibold">ESP32 ingest endpoint</div>
            <div className="mt-2 font-mono text-xs text-muted">{ingestUrl}</div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
                  <tr>
                    <th className="px-5 py-4 font-semibold">Device</th>
                    <th className="px-5 py-4 font-semibold">Cylinder</th>
                    <th className="px-5 py-4 font-semibold">Last seen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {cylinders.map((c) => (
                    <tr key={c.id} className="hover:bg-accent/5 transition group">
                      <td className="px-5 py-4 font-mono font-medium text-xs">{c.device_id || c.esp32_device_id}</td>
                      <td className="px-5 py-4 font-medium text-text">{c.cylinder_num || c.cylinder_name}</td>
                      <td className="px-5 py-4 text-muted text-xs">{formatDateTime(c.latest_reading?.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'ai' ? (
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Gemini configuration</div>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="text-xs text-muted md:col-span-2">
              Gemini API key
              <input value={aiKey} onChange={(e) => setAiKey(e.target.value)} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" type="password" />
            </label>
            <label className="text-xs text-muted">
              Model
              <input value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-muted">
              Temperature ({aiTemp})
              <input type="range" min="0" max="1" step="0.05" value={aiTemp} onChange={(e) => setAiTemp(Number(e.target.value))} className="mt-2 w-full" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={saveAI} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">Save</button>
            <button onClick={testAI} className="rounded-xl border border-border/60 bg-surface/60 px-4 py-2 text-sm transition hover:border-accent/40">Test connection</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
