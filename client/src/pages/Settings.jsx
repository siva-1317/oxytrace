import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Save, Trash2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useCylinders } from '../hooks/useCylinders.js';
import { apiJson, formatDateTime } from '../lib/api.js';

const tabs = [
  { key: 'profile', label: 'Profile' },
  { key: 'cylinders', label: 'Cylinders' },
  { key: 'thresholds', label: 'Alert Thresholds' },
  { key: 'integrations', label: 'Integrations' },
  { key: 'ai', label: 'AI Settings' }
];

export default function Settings() {
  const { user, accessToken } = useAuth();
  const { cylinders, refresh } = useCylinders();
  const [tab, setTab] = useState('profile');
  const [drafts, setDrafts] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [thresholds, setThresholds] = useState({
    low_gas_pct: 20,
    danger_gas_pct: 10,
    leak_warn_ppm: 120,
    leak_danger_ppm: 200
  });

  const ingestUrl = `${import.meta.env.VITE_API_URL}/api/readings/ingest`;

  const ai = useMemo(() => {
    return {
      key: localStorage.getItem('oxytrace-gemini-key') || '',
      model: localStorage.getItem('oxytrace-gemini-model') || 'gemini-3-flash',
      temp: Number(localStorage.getItem('oxytrace-gemini-temp') || 0.4)
    };
  }, []);

  const [aiKey, setAiKey] = useState(ai.key);
  const [aiModel, setAiModel] = useState(ai.model);
  const [aiTemp, setAiTemp] = useState(ai.temp);

  async function saveCylinder(id, patch) {
    try {
      await apiJson(`/api/cylinders/${id}`, { token: accessToken, method: 'PATCH', body: patch });
      toast.success('Saved');
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  }
  function updateDraft(id, patch) {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));
  }

  function getDraftRow(c) {
    const d = drafts[c.id] || {};
    return {
      cylinder_name: d.cylinder_name ?? c.cylinder_name ?? '',
      ward: d.ward ?? c.ward ?? '',
      location: d.location ?? c.location ?? '',
      total_capacity_kg: d.total_capacity_kg ?? c.total_capacity_kg ?? 47,
      refill_threshold_pct: d.refill_threshold_pct ?? c.refill_threshold_pct ?? 20
    };
  }

  function isDirty(c) {
    if (!drafts[c.id]) return false;
    const d = getDraftRow(c);
    return (
      String(d.cylinder_name) !== String(c.cylinder_name ?? '') ||
      String(d.ward) !== String(c.ward ?? '') ||
      String(d.location) !== String(c.location ?? '') ||
      Number(d.total_capacity_kg) !== Number(c.total_capacity_kg ?? 47) ||
      Number(d.refill_threshold_pct) !== Number(c.refill_threshold_pct ?? 20)
    );
  }

  async function saveRow(c) {
    const d = getDraftRow(c);
    setSavingId(c.id);
    try {
      await saveCylinder(c.id, {
        cylinder_name: String(d.cylinder_name).trim(),
        ward: String(d.ward).trim(),
        location: String(d.location).trim(),
        total_capacity_kg: Number(d.total_capacity_kg),
        refill_threshold_pct: Number(d.refill_threshold_pct)
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[c.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteCylinder(id) {
    if (!confirm('Delete this cylinder?')) return;
    try {
      await apiJson(`/api/cylinders/${id}`, { token: accessToken, method: 'DELETE' });
      toast.success('Deleted');
      refresh();
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function saveThresholds() {
    try {
      await apiJson('/api/settings/thresholds', { token: accessToken, method: 'PATCH', body: thresholds });
      toast.success('Thresholds saved');
    } catch (e) {
      toast.error(e.message);
    }
  }

  async function saveAI() {
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
          <div className="flex items-center gap-3">
            <img
              src={user?.user_metadata?.avatar_url}
              alt="avatar"
              className="h-12 w-12 rounded-full"
              referrerPolicy="no-referrer"
            />
            <div>
              <div className="text-lg font-semibold">{user?.user_metadata?.full_name || 'User'}</div>
              <div className="text-sm text-muted">{user?.email}</div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === 'cylinders' ? (
        <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
                <tr>
                  <th className="px-5 py-4 font-semibold">Name</th>
                  <th className="px-5 py-4 font-semibold">Ward</th>
                  <th className="px-5 py-4 font-semibold">Location</th>
                  <th className="px-5 py-4 font-semibold">Capacity</th>
                  <th className="px-5 py-4 font-semibold">Threshold %</th>
                  <th className="px-5 py-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {cylinders.map((c) => {
                  const row = getDraftRow(c);
                  const dirty = isDirty(c);
                  const saving = savingId === c.id;
                  return (
                    <tr key={c.id} className="hover:bg-accent/5 transition group">
                      <td className="px-5 py-4">
                      <input
                        value={row.cylinder_name}
                        onChange={(e) => updateDraft(c.id, { cylinder_name: e.target.value })}
                        className="w-56 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm focus:border-accent transition outline-none"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <input
                        value={row.ward}
                        onChange={(e) => updateDraft(c.id, { ward: e.target.value })}
                        className="w-40 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm focus:border-accent transition outline-none"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <input
                        value={row.location}
                        onChange={(e) => updateDraft(c.id, { location: e.target.value })}
                        className="w-56 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm focus:border-accent transition outline-none"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <input
                        type="number"
                        value={row.total_capacity_kg}
                        onChange={(e) => updateDraft(c.id, { total_capacity_kg: e.target.value })}
                        className="w-24 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm focus:border-accent transition outline-none"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <input
                        type="number"
                        value={row.refill_threshold_pct}
                        onChange={(e) => updateDraft(c.id, { refill_threshold_pct: e.target.value })}
                        className="w-24 rounded-lg border border-border/50 bg-background px-3 py-1.5 text-sm shadow-sm focus:border-accent transition outline-none"
                      />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => saveRow(c)}
                          disabled={!dirty || saving}
                          className="inline-flex items-center gap-2 rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-semibold text-text shadow-sm transition hover:border-accent hover:text-accent disabled:opacity-50"
                          title="Save"
                        >
                          <Save size={14} />
                          {saving ? 'Saving…' : 'Save'}
                        </button>
                        <button
                          onClick={() => deleteCylinder(c.id)}
                          className="inline-flex items-center gap-2 rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-danger/20 transition hover:bg-danger/90"
                          title="Delete"
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
      ) : null}
      {tab === 'thresholds' ? (
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
          <div className="text-sm font-semibold">Alert thresholds</div>
          <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              { key: 'low_gas_pct', label: 'Low gas warning %', min: 5, max: 40 },
              { key: 'danger_gas_pct', label: 'Danger gas %', min: 1, max: 30 },
              { key: 'leak_warn_ppm', label: 'Leakage warning PPM', min: 20, max: 300 },
              { key: 'leak_danger_ppm', label: 'Leakage danger PPM', min: 50, max: 600 }
            ].map((s) => (
              <div key={s.key} className="rounded-xl border border-border/50 bg-card/20 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted">{s.label}</div>
                  <div className="font-mono text-sm">{thresholds[s.key]}</div>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  value={thresholds[s.key]}
                  onChange={(e) => setThresholds((t) => ({ ...t, [s.key]: Number(e.target.value) }))}
                  className="mt-2 w-full"
                />
              </div>
            ))}
          </div>
          <button onClick={saveThresholds} className="mt-4 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">
            Save thresholds
          </button>
          <div className="mt-2 text-xs text-muted">Stored server-side (simple implementation; customize to persist per-ward/global in your DB).</div>
        </div>
      ) : null}

      {tab === 'integrations' ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Supabase connection</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 rounded-full bg-success" />
                <span className="text-muted">Configured via env</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">ESP32 ingest endpoint</div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(ingestUrl);
                  toast.success('Copied');
                }}
                className="rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm transition hover:border-accent/40"
              >
                Copy URL
              </button>
            </div>
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
                      <td className="px-5 py-4 font-mono font-medium text-xs">{c.esp32_device_id}</td>
                      <td className="px-5 py-4 font-medium text-text">{c.cylinder_name}</td>
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
              Gemini API key (stored in localStorage)
              <input
                value={aiKey}
                onChange={(e) => setAiKey(e.target.value)}
                placeholder="AIza…"
                className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                type="password"
              />
            </label>
            <label className="text-xs text-muted">
              Model
              <select value={aiModel} onChange={(e) => setAiModel(e.target.value)} className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm">
                <option value="">auto (server picks)</option>
                <option value="gemini-3-flash">gemini-3-flash</option>
                <option value="gemini-3.1-pro">gemini-3.1-pro</option>
                <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite</option>
                <option value="gemini-1.5-flash-latest">gemini-1.5-flash-latest</option>
                <option value="gemini-1.5-pro-latest">gemini-1.5-pro-latest</option>
                <option value="gemini-2.0-flash">gemini-2.0-flash</option>
                <option value="gemini-2.0-pro">gemini-2.0-pro</option>
              </select>
            </label>
            <label className="text-xs text-muted">
              Temperature ({aiTemp})
              <input type="range" min="0" max="1" step="0.05" value={aiTemp} onChange={(e) => setAiTemp(Number(e.target.value))} className="mt-2 w-full" />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button onClick={saveAI} className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">
              Save
            </button>
            <button onClick={testAI} className="rounded-xl border border-border/60 bg-surface/60 px-4 py-2 text-sm transition hover:border-accent/40">
              Test connection
            </button>
          </div>
          <div className="mt-2 text-xs text-muted">If the server has `GEMINI_API_KEY`, this UI key is optional.</div>
        </div>
      ) : null}
    </div>
  );
}






