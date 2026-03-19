import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiJson, formatDateTime } from '../../lib/api';
import { Plus, Search, Filter, CheckCircle, Eye, Trash2, X, PlusCircle, MinusCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import Skeleton from 'react-loading-skeleton';
import { motion, AnimatePresence } from 'framer-motion';

export default function OrdersTab() {
  const { accessToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Modals state
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showDeliver, setShowDeliver] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);

  // New Order Form state
  const [orderForm, setOrderForm] = useState({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: '',
    invoice_number: '',
    notes: '',
    items: [{ cylinder_size: 'B-type 10L', gas_type: 'oxygen', quantity_ordered: 1, unit_price: 0 }]
  });

  // Deliver Form State
  const [deliverItems, setDeliverItems] = useState([]);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const [ordRes, supRes] = await Promise.all([
        apiJson('/api/stock/orders?page=1&pageSize=50', { token: accessToken }),
        apiJson('/api/stock/suppliers', { token: accessToken })
      ]);
      setOrders(ordRes.orders || []);
      setSuppliers(supRes.suppliers || []);
    } catch (err) {
      toast.error('Failed to load orders or suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) fetchOrders();
  }, [accessToken]);

  const StatusPill = ({ status }) => {
    const colors = {
      pending: 'bg-warning/20 text-warning',
      in_transit: 'bg-blue-500/20 text-blue-400',
      delivered: 'bg-success/20 text-success',
      cancelled: 'bg-muted/20 text-muted',
      partial: 'bg-orange-500/20 text-orange-400'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${colors[status] || colors.pending}`}>
        {status.replace('_', ' ')}
      </span>
    );
  };

  const PaymentPill = ({ status }) => {
    const colors = {
      unpaid: 'bg-danger/20 text-danger',
      partial: 'bg-warning/20 text-warning',
      paid: 'bg-success/20 text-success'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-[10px] uppercase font-bold ${colors[status] || colors.unpaid}`}>
        {status}
      </span>
    );
  };

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);

  // -- New Order Handlers --
  const handleAddRow = () => {
    setOrderForm({
      ...orderForm,
      items: [...orderForm.items, { cylinder_size: 'B-type 10L', gas_type: 'oxygen', quantity_ordered: 1, unit_price: 0 }]
    });
  };

  const handleRemoveRow = (index) => {
    setOrderForm({
      ...orderForm,
      items: orderForm.items.filter((_, i) => i !== index)
    });
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...orderForm.items];
    newItems[index][field] = value;
    setOrderForm({ ...orderForm, items: newItems });
  };

  const calculateTotal = () => {
    return orderForm.items.reduce((sum, item) => sum + (item.quantity_ordered * item.unit_price), 0);
  };

  const submitNewOrder = async (e) => {
    e.preventDefault();
    if (!orderForm.supplier_id) return toast.error('Please select a supplier');
    if (!orderForm.items.length) return toast.error('Add at least one item');
    
    try {
      await apiJson('/api/stock/orders', {
        method: 'POST',
        token: accessToken,
        body: orderForm
      });
      toast.success('Order created successfully');
      setShowNewOrder(false);
      setOrderForm({
        supplier_id: '', order_date: new Date().toISOString().slice(0, 10), expected_delivery_date: '',
        invoice_number: '', notes: '', items: [{ cylinder_size: 'B-type 10L', gas_type: 'oxygen', quantity_ordered: 1, unit_price: 0 }]
      });
      fetchOrders();
    } catch (err) {
      toast.error('Failed to create order: ' + err.message);
    }
  };

  // -- Deliver Handlers --
  const openDeliverModal = (order) => {
    setActiveOrder(order);
    setDeliverItems(order.items.map(it => ({
      id: it.id,
      cylinder_size: it.cylinder_size,
      gas_type: it.gas_type,
      ordered: it.quantity_ordered,
      quantity_received: it.quantity_ordered - (it.quantity_received || 0), // default to remaining
      condition: 'good'
    })));
    setShowDeliver(true);
  };

  const submitDeliver = async (e) => {
    e.preventDefault();
    try {
      await apiJson(`/api/stock/orders/${activeOrder.id}/deliver`, {
        method: 'PATCH',
        token: accessToken,
        body: {
          items: deliverItems.map(it => ({
            id: it.id,
            quantity_received: Number(it.quantity_received),
            condition: it.condition
          }))
        }
      });
      toast.success('Delivery recorded');
      setShowDeliver(false);
      fetchOrders();
    } catch (err) {
      toast.error('Failed to record delivery: ' + err.message);
    }
  };

  return (
    <div className="space-y-4 relative">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex bg-surface/80 border border-border/50 rounded-xl px-3 py-2 w-full md:w-96 items-center focus-within:border-accent transition">
          <Search size={16} className="text-muted mr-2" />
          <input 
            type="text" 
            placeholder="Search orders..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent border-none outline-none text-sm w-full text-text placeholder:text-muted/50"
          />
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
          <button className="flex items-center justify-center gap-2 bg-surface/60 border border-border/50 px-4 py-2 rounded-xl text-sm font-medium hover:border-text/30 transition w-full md:w-auto">
            <Filter size={16} /> Filters
          </button>
          <button onClick={() => setShowNewOrder(true)} className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-lg shadow-accent/20 w-full md:w-auto">
            <Plus size={16} /> New Order
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
              <tr>
                <th className="px-4 py-3 font-semibold">Order No.</th>
                <th className="px-4 py-3 font-semibold">Supplier</th>
                <th className="px-4 py-3 font-semibold">Order Date</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Cylinders</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Payment</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan="8" className="px-4 py-3"><Skeleton height={20} baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" /></td>
                  </tr>
                ))
              ) : orders.filter(o => o.order_number.toLowerCase().includes(search.toLowerCase())).length > 0 ? (
                orders.filter(o => o.order_number.toLowerCase().includes(search.toLowerCase())).map((order) => (
                  <tr key={order.id} className="hover:bg-accent/5 transition group">
                    <td className="px-4 py-3 font-medium text-text">{order.order_number}</td>
                    <td className="px-4 py-3 text-muted">{order.supplier?.supplier_name || 'Unknown'}</td>
                    <td className="px-4 py-3 text-muted">{formatDateTime(order.order_date).split(',')[0]}</td>
                    <td className="px-4 py-3"><StatusPill status={order.status} /></td>
                    <td className="px-4 py-3">
                      <span className="font-semibold">{order.total_cylinders_received}</span>
                      <span className="text-muted text-xs"> / {order.total_cylinders_ordered}</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-text">{formatCurrency(order.total_amount)}</td>
                    <td className="px-4 py-3"><PaymentPill status={order.payment_status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2 opacity-100 transition">
                        <button className="p-1.5 rounded-lg bg-surface hover:bg-accent/20 text-muted hover:text-accent transition tooltip" title="View Details">
                          <Eye size={16} />
                        </button>
                        {order.status !== 'delivered' && (
                          <button onClick={() => openDeliverModal(order)} className="p-1.5 rounded-lg bg-success/10 hover:bg-success/30 text-success transition tooltip" title="Mark Delivered">
                            <CheckCircle size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-muted">No orders found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* New Order Modal */}
      <AnimatePresence>
        {showNewOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl rounded-2xl border border-border/50 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <h2 className="text-lg font-bold text-text">Create New Order</h2>
                <button onClick={() => setShowNewOrder(false)} className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"><X size={20}/></button>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                <form id="newOrderForm" onSubmit={submitNewOrder} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Supplier *</label>
                      <select required value={orderForm.supplier_id} onChange={e => setOrderForm({...orderForm, supplier_id: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition">
                        <option value="">Select Supplier...</option>
                        {suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Invoice Number</label>
                      <input type="text" value={orderForm.invoice_number} onChange={e => setOrderForm({...orderForm, invoice_number: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" placeholder="INV-0000" />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Order Date *</label>
                      <input required type="date" value={orderForm.order_date} onChange={e => setOrderForm({...orderForm, order_date: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-text">Expected Delivery</label>
                      <input type="date" value={orderForm.expected_delivery_date} onChange={e => setOrderForm({...orderForm, expected_delivery_date: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition" />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                       <label className="block text-sm font-bold text-text">Order Items</label>
                       <button type="button" onClick={handleAddRow} className="text-xs font-semibold text-accent hover:text-accent/80 flex items-center gap-1"><PlusCircle size={14}/> Add Row</button>
                    </div>
                    <div className="rounded-xl border border-border/50 overflow-hidden bg-background">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-surface/50 text-xs text-muted border-b border-border/50">
                          <tr>
                            <th className="px-3 py-2 font-medium">Cylinder Size</th>
                            <th className="px-3 py-2 font-medium">Gas</th>
                            <th className="px-3 py-2 font-medium w-24">Qty</th>
                            <th className="px-3 py-2 font-medium w-32">Unit Price (₹)</th>
                            <th className="px-3 py-2 font-medium w-24">Total</th>
                            <th className="px-2 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {orderForm.items.map((item, idx) => (
                            <tr key={idx}>
                              <td className="px-2 py-2">
                                <select value={item.cylinder_size} onChange={e => handleItemChange(idx, 'cylinder_size', e.target.value)} className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-xs text-text outline-none">
                                  <option>B-type 10L</option>
                                  <option>D-type 46L</option>
                                  <option>Jumbo 47L</option>
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <select value={item.gas_type} onChange={e => handleItemChange(idx, 'gas_type', e.target.value)} className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-xs text-text outline-none">
                                  <option>oxygen</option>
                                  <option>medical_air</option>
                                  <option>nitrous_oxide</option>
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <input type="number" min="1" value={item.quantity_ordered} onChange={e => handleItemChange(idx, 'quantity_ordered', Number(e.target.value))} className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-xs text-text outline-none text-center" />
                              </td>
                              <td className="px-2 py-2">
                                <input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => handleItemChange(idx, 'unit_price', Number(e.target.value))} className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-xs text-text outline-none text-right" />
                              </td>
                              <td className="px-2 py-2 text-right font-medium text-accent">
                                {formatCurrency(item.quantity_ordered * item.unit_price)}
                              </td>
                              <td className="px-2 py-2 text-center">
                                <button type="button" onClick={() => handleRemoveRow(idx)} disabled={orderForm.items.length === 1} className="text-muted hover:text-danger disabled:opacity-30"><MinusCircle size={16}/></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 text-right">
                       <span className="text-sm font-medium text-muted mr-3">Grand Total:</span>
                       <span className="text-xl font-bold text-text">{formatCurrency(calculateTotal())}</span>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-text">Notes</label>
                    <textarea rows={2} value={orderForm.notes} onChange={e => setOrderForm({...orderForm, notes: e.target.value})} className="w-full rounded-lg border border-border/50 bg-background px-3 py-2 text-sm text-text outline-none focus:border-accent transition resize-none custom-scrollbar" />
                  </div>
                </form>
              </div>
              <div className="border-t border-border/50 p-4 flex justify-end gap-3 bg-surface/50">
                <button type="button" onClick={() => setShowNewOrder(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-card hover:text-text transition">Cancel</button>
                <button type="submit" form="newOrderForm" className="rounded-xl bg-accent px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90">Submit Order</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mark Delivered Modal */}
      <AnimatePresence>
        {showDeliver && activeOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-2xl border border-border/50 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <div>
                  <h2 className="text-lg font-bold text-text">Receive Delivery</h2>
                  <p className="text-xs text-muted">Order: {activeOrder.order_number}</p>
                </div>
                <button onClick={() => setShowDeliver(false)} className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"><X size={20}/></button>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                <form id="deliverForm" onSubmit={submitDeliver} className="space-y-4">
                  <div className="rounded-xl border border-border/50 overflow-hidden bg-background">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-surface/50 text-xs text-muted border-b border-border/50">
                          <tr>
                            <th className="px-3 py-2 font-medium">Item</th>
                            <th className="px-3 py-2 font-medium w-24 text-center">Ordered</th>
                            <th className="px-3 py-2 font-medium w-32">Receiving Qty</th>
                            <th className="px-3 py-2 font-medium w-32">Condition</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {deliverItems.map((item, idx) => (
                            <tr key={idx}>
                              <td className="px-3 py-3">
                                <div className="font-semibold text-text">{item.cylinder_size}</div>
                                <div className="text-[10px] text-accent font-bold uppercase">{item.gas_type}</div>
                              </td>
                              <td className="px-3 py-3 text-center text-muted font-medium">
                                {item.ordered}
                              </td>
                              <td className="px-3 py-3">
                                <input type="number" min="0" max={item.ordered} value={item.quantity_received} onChange={e => {
                                  const v = [...deliverItems];
                                  v[idx].quantity_received = e.target.value;
                                  setDeliverItems(v);
                                }} className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-sm text-text outline-none text-center" />
                              </td>
                              <td className="px-3 py-3">
                                <select value={item.condition} onChange={e => {
                                  const v = [...deliverItems];
                                  v[idx].condition = e.target.value;
                                  setDeliverItems(v);
                                }} className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-sm text-text outline-none">
                                  <option value="good">Good</option>
                                  <option value="damaged">Damaged</option>
                                  <option value="returned">Returned</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                  </div>
                  <div className="p-3 bg-warning/10 text-warning border border-warning/20 rounded-lg text-xs">
                    Receiving quantities will automatically update live inventory bucketing depending on the condition.
                  </div>
                </form>
              </div>
              <div className="border-t border-border/50 p-4 flex justify-end gap-3 bg-surface/50">
                <button type="button" onClick={() => setShowDeliver(false)} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-card hover:text-text transition">Cancel</button>
                <button type="submit" form="deliverForm" className="rounded-xl bg-success px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-success/20 transition hover:bg-success/90">Confirm Delivery</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
