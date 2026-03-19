import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Grid2X2, List, Plus, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useCylinders } from '../hooks/useCylinders.js';
import { apiJson, formatDateTime } from '../lib/api.js';
import CylinderCard from '../components/CylinderCard.jsx';
import GasLevelBar from '../components/GasLevelBar.jsx';
import Spinner from '../components/Spinner.jsx';

function Modal({ open, title, children, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-border/60 bg-surface/90 p-4 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">{title}</div>
          <button onClick={onClose} className="text-sm text-muted hover:text-text">
            Close
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export default function Cylinders() {
  const { accessToken } = useAuth();
  const { cylinders, refresh, loading } = useCylinders();

  const [view, setView] = useState('grid');
  const [q, setQ] = useState('');
  const [ward, setWard] = useState('all');
  const [status, setStatus] = useState('all');
  const [sortBy, setSortBy] = useState('name');

  const [openAdd, setOpenAdd] = useState(false);
  const [form, setForm] = useState({
    esp32_device_id: '',
    cylinder_name: '',
    ward: '',
    location: '',
    total_capacity_kg: 47,
    last_refill_date: ''
  });

  const wards = useMemo(() => {
    const set = new Set(cylinders.map((c) => c.ward).filter(Boolean));
    return Array.from(set).sort();
  }, [cylinders]);

  const filtered = useMemo(() => {
    let list = [...cylinders];
    if (q.trim()) {
      const s = q.toLowerCase();
      list = list.filter(
        (c) =>
          c.cylinder_name?.toLowerCase().includes(s) ||
          c.location?.toLowerCase().includes(s) ||
          c.esp32_device_id?.toLowerCase().includes(s)
      );
    }
    if (ward !== 'all') list = list.filter((c) => c.ward === ward);
    if (status !== 'all') list = list.filter((c) => (status === 'active' ? c.is_active : !c.is_active));

    const cmp = {
      name: (a, b) => (a.cylinder_name || '').localeCompare(b.cylinder_name || ''),
      gas: (a, b) => (b.latest_reading?.gas_level_pct ?? -1) - (a.latest_reading?.gas_level_pct ?? -1),
      last: (a, b) => new Date(b.latest_reading?.created_at || 0) - new Date(a.latest_reading?.created_at || 0)
    };
    list.sort(cmp[sortBy] || cmp.name);
    return list;
  }, [cylinders, q, ward, status, sortBy]);

  if (loading) {
    return (
      <div className="grid place-items-center rounded-2xl border border-border/50 bg-surface/70 p-10 shadow-sm backdrop-blur">
        <Spinner label="Loading cylinders…" />
      </div>
    );
  }

  async function addCylinder(e) {
    e.preventDefault();
    try {
      await apiJson('/api/cylinders', { token: accessToken, method: 'POST', body: form });
      toast.success('Cylinder added');
      setOpenAdd(false);
      setForm({ esp32_device_id: '', cylinder_name: '', ward: '', location: '', total_capacity_kg: 47, last_refill_date: '' });
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-surface/80 p-4 rounded-2xl border border-border/50 shadow-sm backdrop-blur">
        <div>
          <h2 className="text-lg font-semibold text-text">Cylinders Directory</h2>
          <p className="text-xs text-muted mt-0.5">Manage all tracked cylinders and monitor telemetry</p>
        </div>
        <div className="flex w-full md:w-64 items-center gap-2 rounded-xl border border-border/50 bg-background px-3 py-2 shadow-sm focus-within:border-accent transition">
          <Search size={16} className="text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, ID..."
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted/50"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={ward} onChange={(e) => setWard(e.target.value)} className="rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm">
            <option value="all">All wards</option>
            {wards.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm">
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} className="rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm">
            <option value="name">Sort: Name</option>
            <option value="gas">Sort: Gas level</option>
            <option value="last">Sort: Last reading</option>
          </select>
          <button
            onClick={() => setView((v) => (v === 'grid' ? 'table' : 'grid'))}
            className="inline-flex items-center gap-2 rounded-xl border border-border/50 bg-surface px-4 py-2 text-sm font-medium transition hover:border-accent hover:text-accent shadow-sm"
          >
            {view === 'grid' ? <List size={16} /> : <Grid2X2 size={16} />}
            {view === 'grid' ? 'Table View' : 'Grid View'}
          </button>
        </div>
        <button
          onClick={() => setOpenAdd(true)}
          className="inline-flex items-center gap-2 justify-center rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
        >
          <Plus size={16} /> Add Cylinder
        </button>
      </div>

      {view === 'grid' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((c) => (
            <CylinderCard key={c.id} cylinder={c} />
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
                <tr>
                  <th className="px-5 py-4 font-semibold">Cylinder</th>
                  <th className="px-5 py-4 font-semibold">Ward</th>
                  <th className="px-5 py-4 font-semibold">Location</th>
                  <th className="px-5 py-4 font-semibold">Gas</th>
                  <th className="px-5 py-4 font-semibold">Weight</th>
                  <th className="px-5 py-4 font-semibold">Leakage</th>
                  <th className="px-5 py-4 font-semibold">Valve</th>
                  <th className="px-5 py-4 font-semibold">Last reading</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
              {filtered.map((c) => {
                const r = c.latest_reading || {};
                return (
                  <tr key={c.id} className="hover:bg-accent/5 transition group">
                    <td className="px-5 py-4 font-medium text-text">{c.cylinder_name}</td>
                    <td className="px-5 py-4 text-muted">{c.ward}</td>
                    <td className="px-5 py-4 text-muted">{c.location}</td>
                    <td className="px-5 py-4" style={{ minWidth: 180 }}>
                      <GasLevelBar pct={r.gas_level_pct ?? 0} />
                    </td>
                    <td className="px-5 py-4 font-mono font-medium">{Number(r.gas_weight_kg ?? 0).toFixed(1)} kg</td>
                    <td className="px-5 py-4 font-mono font-medium">{Number(r.leakage_ppm ?? 0).toFixed(0)} ppm</td>
                    <td className="px-5 py-4 font-semibold">
                      <span className={r.valve_open ? 'text-success' : 'text-danger'}>
                        {r.valve_open ? 'OPEN' : 'CLOSED'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-muted text-xs">{formatDateTime(r.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </div>
      )}

      <Modal open={openAdd} title="Add Cylinder" onClose={() => setOpenAdd(false)}>
        <form onSubmit={addCylinder} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="text-xs text-muted">
              Device ID
              <input
                value={form.esp32_device_id}
                onChange={(e) => setForm((f) => ({ ...f, esp32_device_id: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-muted">
              Cylinder Name
              <input
                value={form.cylinder_name}
                onChange={(e) => setForm((f) => ({ ...f, cylinder_name: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-muted">
              Ward
              <input
                value={form.ward}
                onChange={(e) => setForm((f) => ({ ...f, ward: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-muted">
              Location
              <input
                value={form.location}
                onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
                required
              />
            </label>
            <label className="text-xs text-muted">
              Capacity (kg)
              <input
                type="number"
                value={form.total_capacity_kg}
                onChange={(e) => setForm((f) => ({ ...f, total_capacity_kg: Number(e.target.value) }))}
                className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-muted">
              Last refill date
              <input
                type="date"
                value={form.last_refill_date}
                onChange={(e) => setForm((f) => ({ ...f, last_refill_date: e.target.value }))}
                className="mt-1 w-full rounded-xl border border-border/60 bg-surface/60 px-3 py-2 text-sm"
              />
            </label>
          </div>
          <button className="w-full rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent2">
            Create
          </button>
        </form>
      </Modal>
    </div>
  );
}

