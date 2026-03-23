import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiJson, formatDateTime, getCachedData } from '../../lib/api';
import { Plus, ArrowRightLeft, ShieldAlert, CheckCircle, Package, ArrowDownLeft, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { StockTableShell } from '../../components/DashboardPageLoader.jsx';

export default function InventoryTab() {
  const { accessToken } = useAuth();
  const cacheKey = '/api/stock/inventory';
  const [inventory, setInventory] = useState(() => getCachedData(cacheKey)?.inventory || []);
  const [loading, setLoading] = useState(() => !getCachedData(cacheKey));

  // Modals state
  const [activeInv, setActiveInv] = useState(null);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showIssueReturn, setShowIssueReturn] = useState(false);
  const [irMode, setIrMode] = useState('issue'); // 'issue' or 'return'

  // Adjust Form
  const [adjustForm, setAdjustForm] = useState({ bucket: 'full', mode: 'add', quantity: 1, notes: '' });

  // Issue/Return Form
  const [irForm, setIrForm] = useState({ ward: '', quantity: 1, condition: 'good' });

  const fetchInventory = async () => {
    if (!getCachedData(cacheKey)) setLoading(true);
    try {
      const res = await apiJson('/api/stock/inventory', { token: accessToken, cacheKey });
      setInventory(res.inventory || []);
    } catch (err) {
      toast.error('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) fetchInventory();
  }, [accessToken]);

  const StatusPill = ({ full, reorder }) => {
    if (full === 0) return <span className="bg-danger/20 text-danger px-2 py-1 flex items-center gap-1 rounded-full text-[10px] uppercase font-bold"><ShieldAlert size={12}/> Critical</span>;
    if (full < reorder) return <span className="bg-warning/20 text-warning flex items-center gap-1 px-2 py-1 rounded-full text-[10px] uppercase font-bold"><ShieldAlert size={12}/> Low Stock</span>;
    return <span className="bg-success/20 text-success flex items-center gap-1 px-2 py-1 rounded-full text-[10px] uppercase font-bold"><CheckCircle size={12}/> OK</span>;
  };

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);

  // Action Handlers
  const handleAdjustSubmit = async (e) => {
    e.preventDefault();
    try {
      await apiJson('/api/stock/inventory/adjust', {
        method: 'POST',
        token: accessToken,
        queueOffline: true,
        body: {
          cylinder_size: activeInv.cylinder_size,
          gas_type: activeInv.gas_type,
          ...adjustForm
        }
      });
      toast.success('Inventory adjusted');
      setShowAdjust(false);
      fetchInventory();
    } catch (err) {
      toast.error('Adjustment failed: ' + err.message);
    }
  };

  const handleIRSubmit = async (e) => {
    e.preventDefault();
    if (!irForm.ward.trim()) return toast.error('Ward is required');
    try {
      const endpoint = irMode === 'issue' ? '/api/stock/inventory/issue' : '/api/stock/inventory/return';
      await apiJson(endpoint, {
        method: 'POST',
        token: accessToken,
        queueOffline: true,
        body: {
          cylinder_size: activeInv.cylinder_size,
          gas_type: activeInv.gas_type,
          ...irForm
        }
      });
      toast.success(irMode === 'issue' ? 'Cylinders issued to ward' : 'Cylinders returned from ward');
      setShowIssueReturn(false);
      fetchInventory();
    } catch (err) {
      toast.error('Transaction failed: ' + err.message);
    }
  };

  const openIRModal = (inv, mode) => {
    setActiveInv(inv);
    setIrMode(mode);
    setIrForm({ ward: '', quantity: 1, condition: 'good' });
    setShowIssueReturn(true);
  };

  const openAdjustModal = (inv) => {
    setActiveInv(inv);
    setAdjustForm({ bucket: 'full', mode: 'add', quantity: 1, notes: '' });
    setShowAdjust(true);
  };

  if (loading && !inventory.length) {
    return <StockTableShell rows={5} columns={8} header={true} topbar={false} />;
  }

  return (
    <div className="space-y-4 relative">
      <div className="flex justify-between items-center bg-surface/80 p-4 rounded-2xl border border-border/50 shadow-sm backdrop-blur">
        <div>
          <h2 className="text-lg font-semibold text-text">Live Inventory</h2>
          <p className="text-xs text-muted">Current on-hand stock across all status buckets</p>
        </div>
        <div className="flex gap-2">
           <button onClick={() => window.open(import.meta.env.VITE_API_URL + '/api/stock/export/inventory', '_blank')} className="flex items-center gap-2 bg-surface border border-border/50 hover:border-accent hover:text-accent transition px-4 py-2 rounded-xl text-sm font-medium">
            <Package size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
              <tr>
                <th className="px-5 py-4 font-semibold">Cylinder Type</th>
                <th className="px-5 py-4 font-semibold text-center">Full</th>
                <th className="px-5 py-4 font-semibold text-center">In Use</th>
                <th className="px-5 py-4 font-semibold text-center">Empty</th>
                <th className="px-5 py-4 font-semibold text-center">Damaged</th>
                <th className="px-5 py-4 font-semibold text-center border-l border-border/20">Total</th>
                <th className="px-5 py-4 font-semibold">Status</th>
                <th className="px-5 py-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {inventory.length > 0 ? (
                inventory.map((inv) => {
                  const total = inv.quantity_full + inv.quantity_in_use + inv.quantity_empty + inv.quantity_damaged;
                  return (
                    <tr key={inv.id} className="hover:bg-accent/5 transition group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-text">{inv.cylinder_size}</span>
                          <span className="text-[10px] text-accent bg-accent/10 px-1.5 py-0.5 rounded uppercase font-bold">{inv.gas_type}</span>
                        </div>
                        <div className="text-[10px] text-muted mt-0.5">Updated {formatDateTime(inv.last_updated).split(',')[0]}</div>
                      </td>
                      <td className="px-5 py-4 text-center font-bold text-success text-base">{inv.quantity_full}</td>
                      <td className="px-5 py-4 text-center font-semibold text-accent">{inv.quantity_in_use}</td>
                      <td className="px-5 py-4 text-center font-medium text-muted">{inv.quantity_empty}</td>
                      <td className="px-5 py-4 text-center font-medium text-danger">{inv.quantity_damaged}</td>
                      <td className="px-5 py-4 text-center font-bold text-text border-l border-border/20">{total}</td>
                      <td className="px-5 py-4">
                        <StatusPill full={inv.quantity_full} reorder={inv.reorder_level} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-end gap-1.5 opacity-100 transition">
                          <button onClick={() => openIRModal(inv, 'issue')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent text-accent hover:text-white transition text-[10px] uppercase font-bold tooltip" title="Issue to Ward">
                            <ArrowRightLeft size={12} /> Issue
                          </button>
                          <button onClick={() => openIRModal(inv, 'return')} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-warning/10 hover:bg-warning text-warning hover:text-white transition text-[10px] uppercase font-bold tooltip" title="Return from Ward">
                            <ArrowDownLeft size={12} /> Return
                          </button>
                          <button onClick={() => openAdjustModal(inv)} className="p-1.5 rounded-lg bg-surface hover:bg-accent/20 border border-border/50 text-muted transition tooltip" title="Manual Adjust">
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="8" className="px-5 py-8 text-center text-muted">No inventory records found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-surface/60 border border-border/50 rounded-2xl p-5 flex flex-col md:flex-row justify-between items-center gap-4 backdrop-blur shadow-sm">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-text">Inventory Valuation</span>
          <span className="text-xs text-muted">Based on full + in-use cylinders</span>
        </div>
        <div className="text-2xl font-bold tracking-tight text-accent">
          {formatCurrency(inventory.reduce((a, i) => a + Number(i.unit_price || 0) * (Number(i.quantity_full || 0) + Number(i.quantity_in_use || 0)), 0))}
        </div>
      </div>

      {/* Manual Adjust Modal */}
      <AnimatePresence>
        {showAdjust && activeInv && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm rounded-2xl border border-border/50 bg-surface shadow-2xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <div>
                  <h2 className="text-lg font-bold text-text">Adjust Inventory</h2>
                  <p className="text-xs text-muted">{activeInv.cylinder_size} ({activeInv.gas_type})</p>
                </div>
                <button onClick={() => setShowAdjust(false)} className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"><X size={20}/></button>
              </div>
              <div className="p-4">
                <form id="adjustForm" onSubmit={handleAdjustSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Bucket</label>
                    <select required value={adjustForm.bucket} onChange={e => setAdjustForm({...adjustForm, bucket: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition">
                      <option value="full">Full Cylinders</option>
                      <option value="empty">Empty Cylinders</option>
                      <option value="in_use">In Use</option>
                      <option value="damaged">Damaged</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Operation</label>
                      <select required value={adjustForm.mode} onChange={e => setAdjustForm({...adjustForm, mode: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition">
                        <option value="add">Add (+)</option>
                        <option value="subtract">Subtract (-)</option>
                        <option value="set">Set (=)</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Quantity</label>
                      <input required type="number" min="0" value={adjustForm.quantity} onChange={e => setAdjustForm({...adjustForm, quantity: Number(e.target.value)})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Reason / Notes</label>
                    <input type="text" value={adjustForm.notes} onChange={e => setAdjustForm({...adjustForm, notes: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" placeholder="Found uncounted stock..." />
                  </div>
                </form>
              </div>
              <div className="border-t border-border/50 p-4 flex justify-end gap-3 bg-surface/50">
                <button type="button" onClick={() => setShowAdjust(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-card hover:text-text transition">Cancel</button>
                <button type="submit" form="adjustForm" className="rounded-xl bg-accent px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90">Apply Adjust</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Issue / Return Modal */}
      <AnimatePresence>
        {showIssueReturn && activeInv && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="w-full max-w-sm rounded-2xl border border-border/50 bg-surface shadow-2xl overflow-hidden flex flex-col">
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <div>
                  <h2 className="text-lg font-bold text-text">{irMode === 'issue' ? 'Issue to Ward' : 'Process Return'}</h2>
                  <p className="text-xs text-muted">{activeInv.cylinder_size} ({activeInv.gas_type})</p>
                </div>
                <button onClick={() => setShowIssueReturn(false)} className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"><X size={20}/></button>
              </div>
              <div className="p-4">
                <form id="irForm" onSubmit={handleIRSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">{irMode === 'issue' ? 'Destination Ward' : 'From Ward'} *</label>
                    <input required autoFocus type="text" value={irForm.ward} onChange={e => setIrForm({...irForm, ward: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" placeholder="e.g. ICU-01" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Quantity *</label>
                    <input required type="number" min="1" max={irMode === 'issue' ? activeInv.quantity_full : activeInv.quantity_in_use} value={irForm.quantity} onChange={e => setIrForm({...irForm, quantity: Number(e.target.value)})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    <p className="text-[10px] text-muted mt-1">
                      {irMode === 'issue' ? `Available full: ${activeInv.quantity_full}` : `Currently in use: ${activeInv.quantity_in_use}`}
                    </p>
                  </div>
                  {irMode === 'return' && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Condition</label>
                      <select required value={irForm.condition} onChange={e => setIrForm({...irForm, condition: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition">
                        <option value="good">Good (Empty)</option>
                        <option value="damaged">Damaged</option>
                      </select>
                    </div>
                  )}
                </form>
              </div>
              <div className="border-t border-border/50 p-4 flex justify-end gap-3 bg-surface/50">
                <button type="button" onClick={() => setShowIssueReturn(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-card hover:text-text transition">Cancel</button>
                <button type="submit" form="irForm" className={`rounded-xl px-6 py-2 text-sm font-semibold text-white shadow-lg transition ${irMode === 'issue' ? 'bg-accent shadow-accent/20 hover:bg-accent/90' : 'bg-warning shadow-warning/20 hover:bg-warning/90'}`}>
                  {irMode === 'issue' ? 'Issue Stock' : 'Confirm Return'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
