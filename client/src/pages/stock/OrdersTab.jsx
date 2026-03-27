import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiJson, formatDateTime, getCachedData, setCachedData } from '../../lib/api';
import { Expand, Plus, Search, Filter, CheckCircle, Eye, Trash2, X, PlusCircle, MinusCircle, ReceiptIndianRupee, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { StockTableShell } from '../../components/DashboardPageLoader.jsx';
import { loadHospitalProfile } from '../../lib/hospitalProfile.js';

const PAYMENT_HISTORY_MARKER = '__OXYTRACE_PAYMENT_HISTORY__';
const FALLBACK_ORDER_CYLINDER_SIZE = 'B-type 10L';

function createDefaultOrderItem(cylinderTypes = []) {
  return {
    cylinder_size: cylinderTypes[0]?.type_name || FALLBACK_ORDER_CYLINDER_SIZE,
    gas_type: 'oxygen',
    stock_mode: 'replace_cylinder',
    quantity_ordered: 1,
    unit_price: 0
  };
}

const buildGeneratedInvoiceNumber = () => {
  const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replaceAll('T', '').replaceAll('Z', '').replaceAll('.', '').slice(0, 12);
  const nonce = Math.random().toString(36).slice(2, 5).toUpperCase();
  return 'INV-' + stamp + '-' + nonce;
};

const buildDeliverItems = (items = [], defaultToRemaining = true) =>
  items.map((it) => {
    const ordered = Number(it.quantity_ordered || 0);
    const receivedSoFar = Number(it.quantity_received || 0);
    const remaining = Math.max(0, ordered - receivedSoFar);
    return {
      id: it.id,
      cylinder_size: it.cylinder_size,
      gas_type: it.gas_type,
      stock_mode: it.stock_mode || 'replace_cylinder',
      ordered,
      received_so_far: receivedSoFar,
      remaining,
      receive_now: defaultToRemaining ? remaining : 0,
      condition: it.condition || 'good'
    };
  });

export default function OrdersTab() {
  const { accessToken } = useAuth();
  const [orders, setOrders] = useState(() => getCachedData('/api/stock/orders?page=1&pageSize=50')?.orders || []);
  const [suppliers, setSuppliers] = useState(() => getCachedData('/api/stock/suppliers')?.suppliers || []);
  const [cylinderTypes, setCylinderTypes] = useState(() => getCachedData('/api/settings/cylinder-types')?.cylinderTypes || []);
  const [loading, setLoading] = useState(() => !getCachedData('/api/stock/orders?page=1&pageSize=50'));
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    payment_status: '',
    supplier_id: '',
    from: '',
    to: ''
  });

  // Modals state
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [showPaymentEditor, setShowPaymentEditor] = useState(false);
  const [activeOrder, setActiveOrder] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedPaymentEntry, setSelectedPaymentEntry] = useState(null);
  const [expandedProofImage, setExpandedProofImage] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    payment_amount: '',
    payment_method: '',
    paid_by: '',
    invoice_number: '',
    invoice_url: '',
    notes: ''
  });
  const ordersCacheKey = '/api/stock/orders?page=1&pageSize=50';

  // New Order Form state
  const [orderForm, setOrderForm] = useState({
    supplier_id: '',
    order_date: new Date().toISOString().slice(0, 10),
    expected_delivery_date: '',
    invoice_number: buildGeneratedInvoiceNumber(),
    send_supplier_email: true,
    notes: '',
    items: [createDefaultOrderItem(cylinderTypes)]
  });

  // Deliver Form State
  const [deliverItems, setDeliverItems] = useState([]);

  // Loading States
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  const fetchOrders = async () => {
    if (!getCachedData(ordersCacheKey)) setLoading(true);
    try {
      const [ordRes, supRes, typeRes] = await Promise.all([
        apiJson('/api/stock/orders?page=1&pageSize=50', { token: accessToken, cacheKey: ordersCacheKey }),
        apiJson('/api/stock/suppliers', { token: accessToken, cacheKey: '/api/stock/suppliers' }),
        apiJson('/api/settings/cylinder-types', { token: accessToken, cacheKey: '/api/settings/cylinder-types' })
      ]);
      setOrders(ordRes.orders || []);
      setSuppliers(supRes.suppliers || []);
      setCylinderTypes(typeRes.cylinderTypes || []);
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
      items: [...orderForm.items, createDefaultOrderItem(cylinderTypes)]
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
    
    setIsSubmittingOrder(true);
    try {
      const hospitalProfile = loadHospitalProfile();
      const res = await apiJson('/api/stock/orders', {
        method: 'POST',
        token: accessToken,
        queueOffline: true,
        body: {
          ...orderForm,
          hospital_profile: hospitalProfile
        }
      });
      if (res?.queued) {
        toast.success('Order queued offline');
      } else if (res?.email?.sent) {
        toast.success('Order created and supplier email sent');
      } else if (res?.email?.attempted) {
        toast.success('Order created. Supplier email was not sent.');
      } else {
        toast.success('Order created successfully');
      }
      setShowNewOrder(false);
      setOrderForm({
        supplier_id: '', order_date: new Date().toISOString().slice(0, 10), expected_delivery_date: '',
        invoice_number: buildGeneratedInvoiceNumber(),
        send_supplier_email: true,
        notes: '',
        items: [createDefaultOrderItem(cylinderTypes)]
      });
      if (res?.email?.attempted && !res?.email?.sent && res?.email?.reason) {
        toast.error(`Supplier email status: ${res.email.reason}`);
      }
      fetchOrders();
    } catch (err) {
      toast.error('Failed to create order: ' + err.message);
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  // -- Deliver Handlers --
  const submitDeliver = async (e) => {
    e.preventDefault();
    setIsDelivering(true);
    try {
      await apiJson(`/api/stock/orders/${activeOrder.id}/deliver`, {
        method: 'PATCH',
        token: accessToken,
        queueOffline: true,
        body: {
          items: deliverItems.map(it => ({
            id: it.id,
            quantity_received: Number(it.received_so_far || 0) + Number(it.receive_now || 0),
            condition: it.condition,
            stock_mode: it.stock_mode
          }))
        }
      });
      toast.success('Delivery recorded');
      const refreshed = (await apiJson(`/api/stock/orders/${activeOrder.id}`, { token: accessToken })).order;
      setActiveOrder(refreshed);
      setDeliverItems(buildDeliverItems(refreshed.items, false));
      syncOrderIntoList(refreshed);
      fetchOrders();
    } catch (err) {
      toast.error('Failed to record delivery: ' + err.message);
    } finally {
      setIsDelivering(false);
    }
  };

  const formatPaidByNotes = (notes, paidBy) => {
    const cleaned = extractVisibleNotes(notes)
      .split('\n')
      .filter((line) => !line.startsWith('Payment by:'))
      .join('\n')
      .trim();
    return [paidBy ? `Payment by: ${paidBy}` : '', cleaned].filter(Boolean).join('\n');
  };

  const extractPaymentHistory = (notes) => {
    const raw = String(notes || '');
    const markerIndex = raw.indexOf(PAYMENT_HISTORY_MARKER);
    if (markerIndex === -1) return [];
    const payload = raw.slice(markerIndex + PAYMENT_HISTORY_MARKER.length).trim();
    if (!payload) return [];
    try {
      const parsed = JSON.parse(payload);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const extractVisibleNotes = (notes) => {
    const raw = String(notes || '');
    const markerIndex = raw.indexOf(PAYMENT_HISTORY_MARKER);
    return (markerIndex === -1 ? raw : raw.slice(0, markerIndex)).trim();
  };

  const extractPaidBy = (notes) =>
    extractVisibleNotes(notes)
      .split('\n')
      .find((line) => line.startsWith('Payment by:'))
      ?.replace('Payment by:', '')
      .trim() || '';

  const buildOrderNotes = ({ notes, paidBy, paymentHistory }) => {
    const summary = formatPaidByNotes(notes, paidBy).trim();
    const history = Array.isArray(paymentHistory) && paymentHistory.length
      ? `${PAYMENT_HISTORY_MARKER}\n${JSON.stringify(paymentHistory)}`
      : '';
    return [summary, history].filter(Boolean).join('\n\n') || null;
  };

  const derivePaymentStatus = (totalAmount, paidAmount, fallback = 'unpaid') => {
    const total = Math.max(0, Number(totalAmount || 0));
    const paid = Math.max(0, Number(paidAmount || 0));
    if (total <= 0) return fallback;
    if (paid >= total) return 'paid';
    if (paid > 0) return 'partial';
    return 'unpaid';
  };

  const syncOrderIntoList = (nextOrder) => {
    setOrders((prev) => {
      const nextOrders = prev.map((order) => (order.id === nextOrder.id ? { ...order, ...nextOrder } : order));
      const cached = getCachedData(ordersCacheKey);
      setCachedData(ordersCacheKey, {
        ...(cached || {}),
        orders: nextOrders
      });
      return nextOrders;
    });
  };

  const removeOrderFromList = (orderId) => {
    setOrders((prev) => {
      const nextOrders = prev.filter((order) => order.id !== orderId);
      const cached = getCachedData(ordersCacheKey);
      setCachedData(ordersCacheKey, {
        ...(cached || {}),
        orders: nextOrders
      });
      return nextOrders;
    });
  };

  const closeDetailsModal = () => {
    setShowDetails(false);
    setShowPaymentEditor(false);
    setSelectedPaymentEntry(null);
    setExpandedProofImage(null);
  };

  const deleteOrder = async (order) => {
    const confirmed = window.confirm(`Delete order ${order.order_number}?`);
    if (!confirmed) return;

    try {
      const res = await apiJson(`/api/stock/orders/${order.id}`, {
        method: 'DELETE',
        token: accessToken,
        queueOffline: true
      });

      removeOrderFromList(order.id);
      if (activeOrder?.id === order.id) closeDetailsModal();

      if (res?.queued) {
        toast.success('Order delete queued offline');
      } else {
        toast.success('Order deleted');
      }
    } catch (err) {
      toast.error('Failed to delete order: ' + err.message);
    }
  };

  const openDetailsModal = async (order) => {
    setShowDetails(true);
    setDetailsLoading(true);
    try {
      const res = await apiJson(`/api/stock/orders/${order.id}`, { token: accessToken });
      const fullOrder = res.order;
      setActiveOrder(fullOrder);
      setDeliverItems(buildDeliverItems(fullOrder.items));
      setPaymentForm({
        payment_amount: '',
        payment_method: '',
        paid_by: '',
        invoice_number: '',
        invoice_url: '',
        notes: ''
      });
    } catch (err) {
      toast.error('Failed to load order details');
      setShowDetails(false);
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleProofUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Please upload an image under 2 MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPaymentForm((prev) => ({ ...prev, invoice_url: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const savePaymentDetails = async (e) => {
    e.preventDefault();
    if (!activeOrder) return;
    setIsSavingPayment(true);
    try {
      const paymentAmount = Math.max(0, Number(paymentForm.payment_amount || 0));
      if (paymentAmount <= 0) {
        toast.error('Enter a payment amount greater than 0');
        return;
      }
      const previousPaidAmount = Number(activeOrder.paid_amount || 0);
      const nextPaidAmount = previousPaidAmount + paymentAmount;
      const previousHistory = extractPaymentHistory(activeOrder.notes);
      const nextHistory = [
        ...previousHistory,
        {
          id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          created_at: new Date().toISOString(),
          amount_added: paymentAmount,
          total_paid: nextPaidAmount,
          payment_method: paymentForm.payment_method.trim() || '',
          paid_by: paymentForm.paid_by.trim() || '',
          invoice_number: paymentForm.invoice_number.trim() || '',
          invoice_url: paymentForm.invoice_url || '',
          notes: paymentForm.notes.trim() || ''
        }
      ];
      const nextNotes = buildOrderNotes({
        notes: paymentForm.notes,
        paidBy: paymentForm.paid_by,
        paymentHistory: nextHistory
      });
      const optimisticOrder = {
        ...activeOrder,
        paid_amount: nextPaidAmount,
        payment_method: paymentForm.payment_method.trim() || null,
        invoice_number: paymentForm.invoice_number.trim() || null,
        invoice_url: paymentForm.invoice_url || null,
        notes: nextNotes,
        payment_status: derivePaymentStatus(activeOrder.total_amount, nextPaidAmount, activeOrder.payment_status || 'unpaid')
      };

      const res = await apiJson(`/api/stock/orders/${activeOrder.id}`, {
        method: 'PATCH',
        token: accessToken,
        queueOffline: true,
        body: {
          paid_amount: nextPaidAmount,
          payment_method: paymentForm.payment_method.trim() || null,
          invoice_number: paymentForm.invoice_number.trim() || null,
          invoice_url: paymentForm.invoice_url || null,
          notes: nextNotes
        }
      });

      let committedOrder = optimisticOrder;
      if (res?.queued) {
        toast.success('Payment update queued offline');
      } else {
        const refreshed = res?.order || (await apiJson(`/api/stock/orders/${activeOrder.id}`, { token: accessToken })).order;
        committedOrder = {
          ...refreshed,
          payment_status: derivePaymentStatus(refreshed.total_amount, refreshed.paid_amount, refreshed.payment_status || 'unpaid')
        };
        toast.success('Payment details updated');
      }

      setActiveOrder(committedOrder);
      syncOrderIntoList(committedOrder);
      setShowPaymentEditor(false);
      setPaymentForm({
        payment_amount: '',
        payment_method: '',
        paid_by: '',
        invoice_number: '',
        invoice_url: '',
        notes: ''
      });
    } catch (err) {
      toast.error('Failed to update payment details: ' + err.message);
    } finally {
      setIsSavingPayment(false);
    }
  };

  const getRemainingAmount = (order, paidOverride) => {
    const total = Number(order?.total_amount || 0);
    const paid = Math.max(0, Number(paidOverride ?? order?.paid_amount ?? 0));
    return Math.max(0, total - paid);
  };

  const openCreatePaymentModal = () => {
    setPaymentForm({
      payment_amount: '',
      payment_method: '',
      paid_by: '',
      invoice_number: activeOrder?.invoice_number || '',
      invoice_url: '',
      notes: ''
    });
    setShowPaymentEditor(true);
  };

  const openNewOrderModal = () => {
    setOrderForm({
      supplier_id: '',
      order_date: new Date().toISOString().slice(0, 10),
      expected_delivery_date: '',
      invoice_number: buildGeneratedInvoiceNumber(),
      send_supplier_email: true,
      notes: '',
      items: [createDefaultOrderItem(cylinderTypes)]
    });
    setShowNewOrder(true);
  };

  const paymentHistory = useMemo(
    () => (activeOrder ? extractPaymentHistory(activeOrder.notes).slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at)) : []),
    [activeOrder]
  );

  const filteredOrders = useMemo(() => {
    return orders.filter((order) => {
      const matchesSearch =
        order.order_number?.toLowerCase().includes(search.toLowerCase()) ||
        order.supplier?.supplier_name?.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (filters.status && order.status !== filters.status) return false;
      if (filters.payment_status && order.payment_status !== filters.payment_status) return false;
      if (filters.supplier_id && String(order.supplier_id || '') !== String(filters.supplier_id)) return false;

      const orderDate = String(order.order_date || '').slice(0, 10);
      if (filters.from && orderDate && orderDate < filters.from) return false;
      if (filters.to && orderDate && orderDate > filters.to) return false;

      return true;
    });
  }, [filters, orders, search]);

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const clearFilters = () => {
    setFilters({
      status: '',
      payment_status: '',
      supplier_id: '',
      from: '',
      to: ''
    });
  };

  if (loading && !orders.length) {
    return <StockTableShell rows={5} columns={8} header={true} topbar={true} />;
  }

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
          <button
            type="button"
            onClick={() => setShowFilters(true)}
            className={`flex items-center justify-center gap-2 border px-4 py-2 rounded-xl text-sm font-medium transition w-full md:w-auto ${
              hasActiveFilters
                ? 'bg-accent/10 text-accent border-accent/40'
                : 'bg-surface/60 border-border/50 hover:border-text/30'
            }`}
          >
            <Filter size={16} /> Filters
          </button>
          <button onClick={openNewOrderModal} className="flex items-center justify-center gap-2 bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-xl text-sm font-semibold transition shadow-lg shadow-accent/20 w-full md:w-auto">
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
              {filteredOrders.length > 0 ? (
                filteredOrders.map((order) => (
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
                        <button type="button" onClick={() => openDetailsModal(order)} className="p-1.5 rounded-lg bg-surface hover:bg-accent/20 text-muted hover:text-accent transition tooltip" title="Order Actions">
                          <Eye size={16} />
                        </button>
                        {!['delivered', 'partial'].includes(order.status) ? (
                          <button
                            type="button"
                            onClick={() => deleteOrder(order)}
                            className="p-1.5 rounded-lg bg-danger/10 hover:bg-danger/20 text-danger transition tooltip"
                            title="Delete Order"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="px-4 py-8 text-center text-muted">
                    {hasActiveFilters || search ? 'No orders match the current filters.' : 'No orders found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {showFilters ? (
          <div
            className="fixed inset-0 z-[55] flex items-start justify-center overflow-y-auto bg-background/80 p-4 pb-6 pt-24 backdrop-blur-sm"
            onClick={() => setShowFilters(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-2xl border border-border/60 bg-surface/95 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <div>
                  <h2 className="text-base font-bold text-text">Filter Orders</h2>
                  <p className="text-xs text-muted">Refine the order list by status, supplier, payment, and date.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
                <label className="text-xs text-muted">
                  Order Status
                  <select
                    value={filters.status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, status: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                  >
                    <option value="">All statuses</option>
                    <option value="pending">Pending</option>
                    <option value="in_transit">In transit</option>
                    <option value="partial">Partial</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </label>
                <label className="text-xs text-muted">
                  Payment Status
                  <select
                    value={filters.payment_status}
                    onChange={(e) => setFilters((prev) => ({ ...prev, payment_status: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                  >
                    <option value="">All payments</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                </label>
                <label className="text-xs text-muted">
                  Supplier
                  <select
                    value={filters.supplier_id}
                    onChange={(e) => setFilters((prev) => ({ ...prev, supplier_id: e.target.value }))}
                    className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                  >
                    <option value="">All suppliers</option>
                    {suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.supplier_name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-muted">
                    From Date
                    <input
                      type="date"
                      value={filters.from}
                      onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    To Date
                    <input
                      type="date"
                      value={filters.to}
                      onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                    />
                  </label>
                </div>
              </div>
              <div className="flex items-center justify-end gap-3 border-t border-border/50 p-4">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-card hover:text-text transition"
                >
                  Clear Filters
                </button>
                <button
                  type="button"
                  onClick={() => setShowFilters(false)}
                  className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      {/* New Order Modal */}
      <AnimatePresence>
        {showNewOrder && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 pb-6 pt-24 backdrop-blur-sm"
            onClick={() => setShowNewOrder(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-3xl rounded-2xl border border-border/50 bg-surface shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <h2 className="text-lg font-bold text-text">Create New Order</h2>
                <button type="button" onClick={() => setShowNewOrder(false)} className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"><X size={20}/></button>
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

                  <label className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/20 px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-text">Send supplier email</div>
                      <div className="mt-1 text-xs text-muted">If turned off, the order will be created without sending a supplier mail.</div>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={orderForm.send_supplier_email}
                      onClick={() => setOrderForm((prev) => ({ ...prev, send_supplier_email: !prev.send_supplier_email }))}
                      className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                        orderForm.send_supplier_email ? 'bg-accent' : 'bg-border/70'
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                          orderForm.send_supplier_email ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                  </label>

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
                            <th className="px-3 py-2 font-medium">Stock Update</th>
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
                                  {(cylinderTypes.length ? cylinderTypes : [{ id: 'fallback-order-size', type_name: FALLBACK_ORDER_CYLINDER_SIZE }]).map((type) => (
                                    <option key={type.id || type.type_name} value={type.type_name}>{type.type_name}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-2">
                                <select
                                  value={item.stock_mode || 'replace_cylinder'}
                                  onChange={e => handleItemChange(idx, 'stock_mode', e.target.value)}
                                  className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-xs text-text outline-none"
                                >
                                  <option value="new_cylinders">New cylinders</option>
                                  <option value="replace_cylinder">Replace cylinder</option>
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
                    <div className="mt-3 rounded-xl border border-border/40 bg-card/20 p-3 text-xs text-muted">
                      `New cylinders` adds to full stock and increases total cylinder count. `Replace cylinder` adds to full stock and reduces empty stock so total cylinder count stays the same.
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
                <button type="submit" form="newOrderForm" disabled={isSubmittingOrder} className="rounded-xl bg-accent px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed">
                  {isSubmittingOrder ? 'Submitting...' : 'Submit Order'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showDetails && (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-background/80 p-4 pb-6 pt-24 backdrop-blur-sm"
            onClick={closeDetailsModal}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-surface/95 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <div>
                  <h2 className="text-lg font-bold text-text">Order Details</h2>
                  <p className="text-xs text-muted">{activeOrder?.order_number || 'Loading order...'}</p>
                </div>
                <button
                  type="button"
                  onClick={closeDetailsModal}
                  className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                {detailsLoading || !activeOrder ? (
                  <div className="text-sm text-muted">Loading details...</div>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                      <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                        <div className="text-xs text-muted">Supplier</div>
                        <div className="mt-1 text-sm font-semibold">{activeOrder.supplier?.supplier_name || 'Unknown'}</div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                        <div className="text-xs text-muted">Order Total</div>
                        <div className="mt-1 text-sm font-semibold">{formatCurrency(activeOrder.total_amount)}</div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                        <div className="text-xs text-muted">Paid Amount</div>
                        <div className="mt-1 text-sm font-semibold">{formatCurrency(activeOrder.paid_amount || 0)}</div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                        <div className="text-xs text-muted">Remaining Amount</div>
                        <div className="mt-1 text-sm font-semibold text-warning">{formatCurrency(getRemainingAmount(activeOrder))}</div>
                      </div>
                      <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                        <div className="text-xs text-muted">Payment Status</div>
                        <div className="mt-1"><PaymentPill status={activeOrder.payment_status} /></div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border/50 overflow-hidden bg-background/70">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-surface/50 text-xs text-muted border-b border-border/50">
                          <tr>
                            <th className="px-3 py-2 font-medium">Cylinder Size</th>
                            <th className="px-3 py-2 font-medium">Stock Update</th>
                            <th className="px-3 py-2 font-medium">Ordered</th>
                            <th className="px-3 py-2 font-medium">Received</th>
                            <th className="px-3 py-2 font-medium">Unit Price</th>
                            <th className="px-3 py-2 font-medium">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/30">
                          {(activeOrder.items || []).map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-3 font-medium">{item.cylinder_size}</td>
                              <td className="px-3 py-3 text-xs text-muted">
                                {item.stock_mode === 'new_cylinders' ? 'New cylinders' : 'Replace cylinder'}
                              </td>
                              <td className="px-3 py-3">{item.quantity_ordered}</td>
                              <td className="px-3 py-3">{item.quantity_received || 0}</td>
                              <td className="px-3 py-3">{formatCurrency(item.unit_price)}</td>
                              <td className="px-3 py-3 font-semibold">{formatCurrency((item.quantity_ordered || 0) * (item.unit_price || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {activeOrder.status !== 'delivered' ? (
                      <form onSubmit={submitDeliver} className="space-y-4 rounded-2xl border border-border/50 bg-card/30 p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={18} className="text-success" />
                          <h3 className="text-sm font-semibold">Delivery Update</h3>
                        </div>
                        <div className="rounded-xl border border-border/50 overflow-hidden bg-background/70">
                          <table className="w-full text-left text-sm">
                            <thead className="border-b border-border/50 bg-surface/50 text-xs text-muted">
                              <tr>
                                <th className="px-3 py-2 font-medium">Item</th>
                                <th className="px-3 py-2 font-medium">Stock Update</th>
                                <th className="px-3 py-2 text-center font-medium">Ordered</th>
                                <th className="px-3 py-2 text-center font-medium">Remaining</th>
                                <th className="px-3 py-2 font-medium">Receive Now</th>
                                <th className="px-3 py-2 font-medium">Condition</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {deliverItems.map((item, idx) => {
                                return (
                                  <tr key={item.id || idx}>
                                    <td className="px-3 py-3">
                                      <div className="font-semibold text-text">{item.cylinder_size}</div>
                                    </td>
                                    <td className="px-3 py-3">
                                      <select
                                        value={item.stock_mode || 'replace_cylinder'}
                                        onChange={(e) => {
                                          setDeliverItems((prev) =>
                                            prev.map((row, rowIndex) =>
                                              rowIndex === idx ? { ...row, stock_mode: e.target.value } : row
                                            )
                                          );
                                        }}
                                        className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-sm text-text outline-none"
                                      >
                                        <option value="new_cylinders">New cylinders</option>
                                        <option value="replace_cylinder">Replace cylinder</option>
                                      </select>
                                    </td>
                                    <td className="px-3 py-3 text-center text-text">{item.ordered}</td>
                                    <td className="px-3 py-3 text-center text-warning">{Math.max(0, Number(item.remaining || 0))}</td>
                                    <td className="px-3 py-3">
                                      <input
                                        type="number"
                                        min="0"
                                        max={item.remaining}
                                        value={item.receive_now}
                                        onChange={(e) => {
                                          const value = Math.max(0, Math.min(Number(e.target.value || 0), Number(item.remaining || 0)));
                                          setDeliverItems((prev) => prev.map((row, rowIndex) => (rowIndex === idx ? { ...row, receive_now: value } : row)));
                                        }}
                                        className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-sm text-text outline-none text-center"
                                      />
                                    </td>
                                    <td className="px-3 py-3">
                                      <select
                                        value={item.condition}
                                        onChange={(e) => {
                                          setDeliverItems((prev) => prev.map((row, rowIndex) => (rowIndex === idx ? { ...row, condition: e.target.value } : row)));
                                        }}
                                        className="w-full rounded border border-border/50 bg-background px-2 py-1.5 text-sm text-text outline-none"
                                      >
                                        <option value="good">Good</option>
                                        <option value="damaged">Damaged</option>
                                        <option value="returned">Returned</option>
                                      </select>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                        <div className="rounded-xl border border-warning/20 bg-warning/10 p-3 text-xs text-warning">
                          Receive the pending quantity from here. `New cylinders` increases total stock. `Replace cylinder` moves empty cylinders into full cylinders without increasing total stock.
                        </div>
                        <div className="flex justify-end">
                          <button type="submit" disabled={isDelivering} className="rounded-xl bg-success px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-success/20 transition hover:bg-success/90 disabled:opacity-60 disabled:cursor-not-allowed">
                            {isDelivering ? 'Recording...' : 'Confirm Delivery'}
                          </button>
                        </div>
                      </form>
                    ) : null}

                    <div className="space-y-4 rounded-2xl border border-border/50 bg-card/30 p-4">
                      <div className="flex items-center gap-2">
                        <ReceiptIndianRupee size={18} className="text-accent" />
                        <h3 className="text-sm font-semibold">Payment Details</h3>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                        <div className="rounded-xl border border-border/50 bg-surface/60 p-3">
                          <div className="text-xs text-muted">Order Total</div>
                          <div className="mt-1 text-base font-semibold text-text">{formatCurrency(activeOrder.total_amount || 0)}</div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-surface/60 p-3">
                          <div className="text-xs text-muted">Total Paid</div>
                          <div className="mt-1 text-base font-semibold text-text">{formatCurrency(activeOrder.paid_amount || 0)}</div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-surface/60 p-3">
                          <div className="text-xs text-muted">Remaining Amount</div>
                          <div className="mt-1 text-base font-semibold text-warning">{formatCurrency(getRemainingAmount(activeOrder))}</div>
                        </div>
                        <div className="rounded-xl border border-border/50 bg-surface/60 p-3">
                          <div className="text-xs text-muted">Payment Status</div>
                          <div className="mt-2"><PaymentPill status={activeOrder.payment_status} /></div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-text">Previous Payments</div>
                            <div className="text-xs text-muted">Minimal payment list with full details on demand.</div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-xs text-muted">{paymentHistory.length} record(s)</div>
                            <button
                              type="button"
                              onClick={openCreatePaymentModal}
                              disabled={getRemainingAmount(activeOrder) <= 0}
                              className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Plus size={14} />
                              Create Payment
                            </button>
                          </div>
                        </div>
                        <div className="overflow-hidden rounded-xl border border-border/50 bg-background/70">
                          <table className="w-full text-left text-sm">
                            <thead className="bg-surface/50 text-xs text-muted border-b border-border/50">
                              <tr>
                                <th className="px-3 py-2 font-medium">Date</th>
                                <th className="px-3 py-2 font-medium">Added</th>
                                <th className="px-3 py-2 font-medium">Total Paid</th>
                                <th className="px-3 py-2 font-medium">Method</th>
                                <th className="px-3 py-2 font-medium">Paid By</th>
                                <th className="px-3 py-2 text-right font-medium">View</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-border/30">
                              {paymentHistory.length ? (
                                paymentHistory.map((entry) => (
                                  <tr key={entry.id} className="hover:bg-accent/5 transition">
                                    <td className="px-3 py-3 text-muted">{formatDateTime(entry.created_at).split(',')[0]}</td>
                                    <td className="px-3 py-3 font-medium text-text">{formatCurrency(entry.amount_added || 0)}</td>
                                    <td className="px-3 py-3 font-medium text-text">{formatCurrency(entry.total_paid || 0)}</td>
                                    <td className="px-3 py-3 text-muted">{entry.payment_method || '-'}</td>
                                    <td className="px-3 py-3 text-muted">{entry.paid_by || '-'}</td>
                                    <td className="px-3 py-3 text-right">
                                      <button
                                        type="button"
                                        onClick={() => setSelectedPaymentEntry(entry)}
                                        className="rounded-lg border border-border/50 bg-surface px-3 py-1.5 text-xs font-semibold text-text transition hover:border-accent hover:text-accent"
                                      >
                                        View
                                      </button>
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan="6" className="px-3 py-5 text-center text-xs text-muted">
                                    No payment entries saved yet.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showPaymentEditor && activeOrder ? (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-background/80 p-4 pb-6 pt-24 backdrop-blur-sm"
            onClick={() => setShowPaymentEditor(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl overflow-hidden rounded-2xl border border-border/60 bg-surface/95 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <div>
                  <h2 className="text-base font-bold text-text">Create Payment</h2>
                  <p className="text-xs text-muted">
                    Remaining amount: {formatCurrency(getRemainingAmount(activeOrder))}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPaymentEditor(false)}
                  className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"
                >
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={savePaymentDetails} className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <label className="text-xs text-muted">
                    Payment Amount
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentForm.payment_amount}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_amount: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                      placeholder="Enter payment amount"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Paid By
                    <input
                      value={paymentForm.paid_by}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, paid_by: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                      placeholder="Accounts team / finance officer"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Payment Method
                    <input
                      value={paymentForm.payment_method}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, payment_method: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                      placeholder="UPI / bank transfer / cash"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    Bill / Invoice Number
                    <input
                      value={paymentForm.invoice_number}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, invoice_number: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition"
                    />
                  </label>
                  <label className="text-xs text-muted md:col-span-2">
                    Upload Bill Proof
                    <div className="mt-1 flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text transition hover:border-accent">
                        <Upload size={16} />
                        <span>Choose image</span>
                        <input type="file" accept="image/*" onChange={handleProofUpload} className="hidden" />
                      </label>
                      {paymentForm.invoice_url ? <span className="text-xs text-success">Proof attached</span> : <span className="text-xs text-muted">No image uploaded</span>}
                    </div>
                    {paymentForm.invoice_url ? (
                      <div className="mt-3">
                        <img src={paymentForm.invoice_url} alt="Bill proof" className="max-h-44 rounded-xl border border-border/50 object-contain" />
                      </div>
                    ) : null}
                  </label>
                  <label className="text-xs text-muted md:col-span-2">
                    Notes
                    <textarea
                      rows={3}
                      value={paymentForm.notes}
                      onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                      className="mt-1 w-full rounded-lg border border-border/50 bg-background/70 px-3 py-2 text-sm text-text outline-none focus:border-accent transition resize-none"
                    />
                  </label>
                </div>
                <div className="rounded-xl border border-border/40 bg-surface/50 p-3 text-xs text-muted">
                  Payment status is updated automatically from order total vs total paid amount.
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowPaymentEditor(false)}
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-muted hover:bg-card hover:text-text transition"
                  >
                    Cancel
                  </button>
                  <button type="submit" disabled={isSavingPayment} className="rounded-xl bg-accent px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/20 transition hover:bg-accent/90 disabled:opacity-60 disabled:cursor-not-allowed">
                    {isSavingPayment ? 'Saving...' : 'Save Payment'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPaymentEntry ? (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-background/80 p-4 pb-6 pt-24 backdrop-blur-sm"
            onClick={() => setSelectedPaymentEntry(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl rounded-2xl border border-border/60 bg-surface/95 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/50 p-4">
                <div>
                  <h2 className="text-base font-bold text-text">Payment Entry Details</h2>
                  <p className="text-xs text-muted">{formatDateTime(selectedPaymentEntry.created_at)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPaymentEntry(null)}
                  className="rounded-lg p-1 text-muted hover:bg-card/50 hover:text-text transition"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                      <div className="text-xs text-muted">Amount Added</div>
                      <div className="mt-1 text-sm font-semibold text-text">{formatCurrency(selectedPaymentEntry.amount_added || 0)}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                      <div className="text-xs text-muted">Total Paid After Update</div>
                      <div className="mt-1 text-sm font-semibold text-text">{formatCurrency(selectedPaymentEntry.total_paid || 0)}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                      <div className="text-xs text-muted">Payment Method</div>
                      <div className="mt-1 text-sm font-semibold text-text">{selectedPaymentEntry.payment_method || '-'}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card/20 p-3">
                      <div className="text-xs text-muted">Paid By</div>
                      <div className="mt-1 text-sm font-semibold text-text">{selectedPaymentEntry.paid_by || '-'}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card/20 p-3 md:col-span-2">
                      <div className="text-xs text-muted">Invoice Number</div>
                      <div className="mt-1 text-sm font-semibold text-text">{selectedPaymentEntry.invoice_number || '-'}</div>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-card/20 p-3 md:col-span-2">
                      <div className="text-xs text-muted">Notes</div>
                      <div className="mt-1 whitespace-pre-wrap text-sm text-text">{selectedPaymentEntry.notes || 'No notes added'}</div>
                    </div>
                  </div>
                  <div className="flex h-full flex-col rounded-xl border border-border/50 bg-card/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs text-muted">Bill Proof</div>
                      {selectedPaymentEntry.invoice_url ? (
                        <button
                          type="button"
                          onClick={() => setExpandedProofImage(selectedPaymentEntry.invoice_url)}
                          className="inline-flex items-center gap-1 rounded-lg border border-border/50 bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text transition hover:border-accent hover:text-accent"
                        >
                          <Expand size={13} />
                          Expand
                        </button>
                      ) : null}
                    </div>
                    <div className="mt-3 flex h-full min-h-[24rem] items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-background/70 p-3">
                      {selectedPaymentEntry.invoice_url ? (
                        <img
                          src={selectedPaymentEntry.invoice_url}
                          alt="Payment proof"
                          className="h-full max-h-[26rem] w-full rounded-lg object-contain"
                        />
                      ) : (
                        <div className="px-4 text-center text-sm text-muted">No bill proof uploaded</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {expandedProofImage ? (
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md"
            onClick={() => setExpandedProofImage(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="relative flex h-full max-h-[92vh] w-full max-w-6xl items-center justify-center rounded-2xl border border-border/60 bg-surface/95 p-4 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setExpandedProofImage(null)}
                className="absolute right-4 top-4 rounded-lg border border-border/50 bg-surface px-3 py-2 text-sm font-semibold text-text transition hover:border-accent hover:text-accent"
              >
                <span className="inline-flex items-center gap-2">
                  <X size={16} />
                  Close
                </span>
              </button>
              <img src={expandedProofImage} alt="Expanded bill proof" className="h-full max-h-full w-full rounded-xl object-contain" />
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}




