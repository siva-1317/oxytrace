import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiJson, getCachedData } from '../../lib/api';
import { Plus, Building2, Phone, Mail, Star, Edit, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { StockSuppliersShell } from '../../components/DashboardPageLoader.jsx';

export default function SuppliersTab() {
  const { accessToken } = useAuth();
  const cacheKey = '/api/stock/suppliers';
  const [suppliers, setSuppliers] = useState(() => getCachedData(cacheKey)?.suppliers || []);
  const [loading, setLoading] = useState(() => !getCachedData(cacheKey));
  
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    supplier_name: '',
    contact_person: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    gstin: '',
    supplier_type: 'dealer',
    is_active: true,
    rating: 0,
    notes: ''
  });

  const fetchSuppliers = async () => {
    if (!getCachedData(cacheKey)) setLoading(true);
    try {
      const res = await apiJson('/api/stock/suppliers', { token: accessToken, cacheKey });
      setSuppliers(res.suppliers || []);
    } catch (err) {
      toast.error('Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) fetchSuppliers();
  }, [accessToken]);

  const openAdd = () => {
    setFormData({
      supplier_name: '', contact_person: '', phone: '', email: '', 
      address: '', city: '', gstin: '', supplier_type: 'dealer', 
      is_active: true, rating: 0, notes: ''
    });
    setEditingId(null);
    setShowModal(true);
  };

  const openEdit = (s) => {
    setFormData({
      supplier_name: s.supplier_name || '',
      contact_person: s.contact_person || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      city: s.city || '',
      gstin: s.gstin || '',
      supplier_type: s.supplier_type || 'dealer',
      is_active: s.is_active,
      rating: s.rating || 0,
      notes: s.notes || ''
    });
    setEditingId(s.id);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.supplier_name.trim()) return toast.error('Supplier name is required');
    
    try {
      const endpoint = editingId ? `/api/stock/suppliers/${editingId}` : '/api/stock/suppliers';
      const method = editingId ? 'PATCH' : 'POST';
      
      await apiJson(endpoint, {
        method,
        token: accessToken,
        queueOffline: true,
        body: formData
      });
      
      toast.success(editingId ? 'Supplier updated' : 'Supplier added');
      setShowModal(false);
      fetchSuppliers();
    } catch (err) {
      toast.error('Error saving supplier: ' + err.message);
    }
  };

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

  if (loading && !suppliers.length) {
    return <StockSuppliersShell />;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-text">Supplier Directory</h2>
        <button onClick={openAdd} className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-lg shadow-accent/20">
          <Plus size={16} /> Add Supplier
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {suppliers.length > 0 ? (
          suppliers.map((s) => (
            <div key={s.id} className="rounded-2xl border border-border/50 bg-surface/70 p-5 shadow-sm backdrop-blur transition hover:border-accent hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/10 flex flex-col h-full group">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-text font-bold text-base leading-tight">{s.supplier_name}</h3>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-accent bg-accent/10 px-1.5 py-0.5 rounded-sm">
                      {s.supplier_type}
                    </span>
                  </div>
                </div>
                {s.rating > 0 && (
                  <div className="flex items-center gap-1 text-warning bg-warning/10 px-2 py-1 rounded-lg text-xs font-bold">
                    <Star size={12} fill="currentColor" /> {s.rating}
                  </div>
                )}
              </div>

              <div className="space-y-2 text-sm text-muted flex-grow mb-4">
                {s.contact_person && (
                  <div className="flex items-center gap-2">
                    <span className="w-5 flex justify-center"><div className="w-1.5 h-1.5 bg-muted rounded-full" /></span>
                    <span className="text-text font-medium">{s.contact_person}</span>
                  </div>
                )}
                {s.phone && (
                  <div className="flex items-center gap-2">
                    <Phone size={14} className="text-accent/70" />
                    <span>{s.phone}</span>
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-2">
                    <Mail size={14} className="text-accent/70" />
                    <span className="truncate">{s.email}</span>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-border/40 grid grid-cols-3 gap-2">
                <div className="flex flex-col text-center">
                  <span className="text-xs text-muted mb-0.5">Orders</span>
                  <span className="text-sm font-semibold text-text">{s.stats?.total_orders || 0}</span>
                </div>
                <div className="flex flex-col text-center border-l border-r border-border/40">
                  <span className="text-xs text-muted mb-0.5">Spend</span>
                  <span className="text-sm font-semibold text-text">{formatCurrency(s.stats?.total_spend)}</span>
                </div>
                <div className="flex flex-col text-center">
                  <span className="text-xs text-muted mb-0.5">On Time</span>
                  <span className="text-sm font-semibold text-success">
                    {Number(s.stats?.on_time_delivery_pct || 0).toFixed(0)}%
                  </span>
                </div>
              </div>

              <div className="absolute top-4 right-4 opacity-100 transition flex gap-1">
                <button onClick={() => openEdit(s)} className="p-1.5 bg-surface rounded-lg text-muted hover:text-accent border border-border/50 hover:border-accent/40 shadow-sm transition"><Edit size={14}/></button>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-12 text-center text-muted border border-dashed border-border/60 rounded-2xl">
            No suppliers added yet.
          </div>
        )}
      </div>

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg rounded-2xl border border-border/50 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <h2 className="text-lg font-bold text-text">{editingId ? 'Edit Supplier' : 'Add Supplier'}</h2>
                <button onClick={() => setShowModal(false)} className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"><X size={20}/></button>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar">
                <form id="supplierForm" onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Company Name *</label>
                    <input autoFocus required type="text" value={formData.supplier_name} onChange={e => setFormData({...formData, supplier_name: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" placeholder="Supplier Ltd." />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Supplier Type</label>
                      <select value={formData.supplier_type} onChange={e => setFormData({...formData, supplier_type: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition">
                        <option value="dealer">Dealer</option>
                        <option value="manufacturer">Manufacturer</option>
                        <option value="distributor">Distributor</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Rating (1-5)</label>
                      <input type="number" min="0" max="5" step="0.1" value={formData.rating} onChange={e => setFormData({...formData, rating: Number(e.target.value)})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Contact Person</label>
                      <input type="text" value={formData.contact_person} onChange={e => setFormData({...formData, contact_person: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Phone</label>
                      <input type="text" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Email</label>
                    <input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Address</label>
                    <input type="text" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">City</label>
                      <input type="text" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">GSTIN</label>
                      <input type="text" value={formData.gstin} onChange={e => setFormData({...formData, gstin: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Notes</label>
                    <textarea rows={2} value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition resize-none custom-scrollbar" />
                  </div>
                </form>
              </div>
              <div className="border-t border-border/50 p-4 flex justify-end gap-3 bg-surface/50">
                <button type="button" onClick={() => setShowModal(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-card hover:text-text transition">Cancel</button>
                <button type="submit" form="supplierForm" className="rounded-xl bg-accent px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90">Save Supplier</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
