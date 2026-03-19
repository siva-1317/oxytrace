import React, { useState } from 'react';
import { TrendingUp, AlertCircle, Package, Truck, Sparkles } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import Skeleton from 'react-loading-skeleton';
import ReactMarkdown from 'react-markdown';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useStockOverview } from '../../hooks/useStockOverview';
import { useAuth } from '../../context/AuthContext';
import { apiJson, formatDateTime } from '../../lib/api';
import CountUp from 'react-countup';

const COLORS = ['#00B4D8', '#48CAE4', '#90E0EF', '#ADE8F4', '#CAF0F8'];

export default function OverviewTab() {
  const { data, loading, refetch } = useStockOverview();
  const { accessToken } = useAuth();
  const [aiReport, setAiReport] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);

  const formatCurrency = (val) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(val || 0);

  const analyzeStock = async () => {
    try {
      setAnalyzing(true);
      const res = await apiJson('/api/stock/ai-analysis', {
        method: 'POST',
        token: accessToken,
        body: { data }
      });
      setAiReport(res.markdown || res.text);
      toast.success('AI Analysis complete');
    } catch (err) {
      toast.error('Failed to analyze stock. ' + (err.message || ''));
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <Skeleton height={120} className="w-full" baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
        <Skeleton height={300} className="w-full" baseColor="rgba(100,116,139,0.15)" highlightColor="rgba(0,180,216,0.1)" />
      </div>
    );
  }

  const { kpis, inventory, upcoming_deliveries, recent_orders, monthly_spend, supplier_spend } = data || {};

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-accent">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <TrendingUp size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Total Stock Value</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.total_stock_value || 0} prefix="₹" separator="," decimals={2} />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-success">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
              <Package size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Cylinders (Full)</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.cylinders_full || 0} />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-warning">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <Truck size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Pending Orders</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.pending_orders || 0} />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-danger">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <AlertCircle size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Low Stock Alerts</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.low_stock_alerts || 0} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Visual Inventory */}
        <div className="xl:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-text">Stock Levels</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inventory?.map((inv, i) => {
              const total = inv.quantity_full + inv.quantity_in_use + inv.quantity_empty + inv.quantity_damaged;
              const pFull = total ? (inv.quantity_full / total) * 100 : 0;
              const pInUse = total ? (inv.quantity_in_use / total) * 100 : 0;
              const pEmpty = total ? (inv.quantity_empty / total) * 100 : 0;
              const pDamaged = total ? (inv.quantity_damaged / total) * 100 : 0;

              return (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.05 }}
                  key={inv.id}
                  className="rounded-2xl border border-border/50 bg-surface/60 p-4 shadow-sm backdrop-blur"
                >
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-text">{inv.cylinder_size}</span>
                      <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-xs text-accent">
                        {inv.gas_type}
                      </span>
                    </div>
                    {inv.quantity_full < inv.reorder_level && (
                      <AlertCircle size={16} className="text-warning" />
                    )}
                  </div>
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-border/40">
                    <div style={{ width: `${pFull}%` }} className="bg-success transition-all duration-500" />
                    <div style={{ width: `${pInUse}%` }} className="bg-accent transition-all duration-500" />
                    <div style={{ width: `${pEmpty}%` }} className="bg-muted transition-all duration-500" />
                    <div style={{ width: `${pDamaged}%` }} className="bg-danger transition-all duration-500" />
                  </div>
                  <div className="mt-2 flex justify-between text-xs">
                    <span className="text-success font-medium">{inv.quantity_full} Full</span>
                    <span className="text-accent font-medium">{inv.quantity_in_use} In Use</span>
                    <span className="text-muted font-medium">{inv.quantity_empty} Empty</span>
                    <span className="text-danger font-medium">{inv.quantity_damaged} Damaged</span>
                  </div>
                </motion.div>
              );
            })}
            {!inventory?.length && (
              <div className="col-span-2 text-center text-sm text-muted py-8">No inventory items found.</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
              <h3 className="text-sm font-semibold mb-4">Monthly Spend (Last 12)</h3>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[...(monthly_spend || [])].reverse()} margin={{ top: 0, left: -20, right: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="spendCol" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgba(0,180,216,0.4)" />
                        <stop offset="100%" stopColor="rgba(0,180,216,0.01)" />
                      </linearGradient>
                    </defs>
                    <Tooltip 
                      formatter={(val, name, props) => [formatCurrency(val), 'Spend', <span key="c">({props.payload.cylinder_count} cyl)</span>]}
                      contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: 'rgba(255,255,255,0.5)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `₹${val/1000}k`} />
                    <Area type="monotone" dataKey="amount" stroke="#00b4d8" fill="url(#spendCol)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
            
            <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur flex flex-col items-center">
              <h3 className="text-sm font-semibold w-full text-left">Supplier Spend Mix</h3>
              <div className="h-48 w-full mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={supplier_spend} dataKey="amount" nameKey="supplier_name" cx="50%" cy="50%" innerRadius={40} outerRadius={70} stroke="none">
                      {supplier_spend?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatCurrency(val)} contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-6">
          {/* AI Analysis */}
          <div className="rounded-2xl border border-accent/30 bg-accent/5 p-5 shadow-sm backdrop-blur relative overflow-hidden">
            <div className="absolute top-0 right-0 -m-4 opacity-10 blur-xl">
              <Sparkles size={120} className="text-accent" />
            </div>
            <div className="flex items-center gap-2 mb-3 relative z-10">
              <Sparkles size={18} className="text-accent" />
              <h3 className="text-sm font-semibold text-accent">Stock Analysis AI</h3>
            </div>
            <p className="text-xs text-muted mb-4 relative z-10">Generate recommendations on spending, reordering, and supplier choices using O₂ data.</p>
            {aiReport ? (
              <div className="prose prose-sm prose-invert max-w-none text-xs text-text bg-surface/80 p-3 rounded-xl border border-border/40 max-h-60 overflow-y-auto custom-scrollbar">
                <ReactMarkdown>{aiReport}</ReactMarkdown>
              </div>
            ) : (
              <button
                onClick={analyzeStock}
                disabled={analyzing}
                className="w-full flex justify-center items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-accent/90 disabled:opacity-50"
              >
                {analyzing ? 'Analyzing...' : 'Analyse Stock with AI'}
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <h3 className="text-sm font-semibold mb-4">Upcoming Deliveries</h3>
            <div className="space-y-3">
              {upcoming_deliveries?.length ? (
                upcoming_deliveries.map(od => (
                  <div key={od.id} className="flex flex-col gap-1 p-3 rounded-xl bg-surface/50 border border-border/40">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-semibold text-text">{od.order_number}</span>
                      <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-sm ${od.status === 'in_transit' ? 'bg-blue-500/20 text-blue-400' : 'bg-warning/20 text-warning'}`}>
                        {od.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-xs text-muted">{od.supplier?.supplier_name}</div>
                    <div className="flex justify-between items-end mt-1">
                      <span className="text-xs font-medium">{od.total_cylinders_ordered} Cylinders</span>
                      <span className={`text-xs ${new Date(od.expected_delivery_date) < new Date() ? 'text-danger font-semibold' : 'text-muted'}`}>
                        {od.expected_delivery_date ? formatDateTime(od.expected_delivery_date).split(',')[0] : 'TBD'}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-xs text-muted text-center py-4">No upcoming deliveries.</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur">
            <h3 className="text-sm font-semibold mb-4">Recent Orders</h3>
            <div className="space-y-2">
              {recent_orders?.slice(0, 5).map(o => (
                <div key={o.id} className="flex justify-between items-center py-2 border-b border-border/20 last:border-0">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-semibold">{o.order_number}</span>
                    <span className="text-[10px] text-muted">{o.supplier?.supplier_name}</span>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-medium text-text">{formatCurrency(o.total_amount)}</span>
                    <span className={`text-[10px] uppercase font-bold ${o.payment_status === 'paid' ? 'text-success' : o.payment_status === 'partial' ? 'text-warning' : 'text-danger'}`}>
                      {o.payment_status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
