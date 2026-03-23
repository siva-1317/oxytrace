import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { apiJson, formatDateTime, getCachedData } from '../../lib/api';
import { Search, Filter, History, Download, ArrowUpRight, ArrowDownLeft, RefreshCcw, AlertOctagon, Settings2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { StockTransactionsShell } from '../../components/DashboardPageLoader.jsx';

export default function TransactionsTab() {
  const { accessToken } = useAuth();
  const cacheKey = '/api/stock/transactions?page=1&pageSize=100';
  const [txs, setTxs] = useState(() => getCachedData(cacheKey)?.transactions || []);
  const [loading, setLoading] = useState(() => !getCachedData(cacheKey));

  const fetchTransactions = async () => {
    if (!getCachedData(cacheKey)) setLoading(true);
    try {
      const res = await apiJson('/api/stock/transactions?page=1&pageSize=100', { token: accessToken, cacheKey });
      setTxs(res.transactions || []);
    } catch (err) {
      toast.error('Failed to load transactions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (accessToken) fetchTransactions();
  }, [accessToken]);

  const chartData = [
    { name: 'Received', count: txs.filter(t => t.transaction_type === 'received').length, fill: '#10b981' }, // success
    { name: 'Issued', count: txs.filter(t => t.transaction_type === 'issued').length, fill: '#00b4d8' }, // accent
    { name: 'Returned', count: txs.filter(t => t.transaction_type === 'returned').length, fill: '#8b5cf6' }, // purple
    { name: 'Damaged', count: txs.filter(t => t.transaction_type === 'damaged').length, fill: '#ef4444' } // danger
  ].filter(d => d.count > 0);

  const getTypeIcon = (type) => {
    switch (type) {
      case 'received': return <ArrowDownLeft size={16} className="text-success" />;
      case 'issued': return <ArrowUpRight size={16} className="text-accent" />;
      case 'returned': return <RefreshCcw size={16} className="text-purple-400" />;
      case 'damaged': return <AlertOctagon size={16} className="text-danger" />;
      case 'adjusted': return <Settings2 size={16} className="text-warning" />;
      default: return <History size={16} className="text-muted" />;
    }
  };

  const getTypeBg = (type) => {
    switch (type) {
      case 'received': return 'bg-success/10 text-success border-success/20';
      case 'issued': return 'bg-accent/10 text-accent border-accent/20';
      case 'returned': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'damaged': return 'bg-danger/10 text-danger border-danger/20';
      case 'adjusted': return 'bg-warning/10 text-warning border-warning/20';
      default: return 'bg-muted/10 text-muted border-border/50';
    }
  };

  if (loading && !txs.length) {
    return <StockTransactionsShell />;
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-surface/70 border border-border/50 rounded-2xl p-5 shadow-sm backdrop-blur flex flex-col justify-center">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2"><History size={16} className="text-accent"/> Audit Log (Recent)</h3>
            <button className="flex items-center px-3 py-1.5 text-xs font-semibold bg-surface border border-border/60 hover:text-accent hover:border-accent/50 rounded-lg transition gap-1.5"><Download size={12}/> CSV</button>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
             <div className="flex flex-1 items-center bg-surface/50 border border-border/50 rounded-xl px-3 py-2">
                <Search size={16} className="text-muted mr-2" />
                <input type="text" placeholder="Search reference ID or notes..." className="bg-transparent border-none outline-none text-sm w-full text-text placeholder:text-muted/50" />
             </div>
             <button className="flex items-center justify-center bg-surface border border-border/50 px-4 py-2 rounded-xl text-sm font-medium hover:border-text/30 transition">
               <Filter size={16} className="mr-2"/> Type
             </button>
          </div>
        </div>

        <div className="bg-surface/70 border border-border/50 rounded-2xl p-5 shadow-sm backdrop-blur h-48">
          <h3 className="text-sm font-semibold mb-2 text-center text-muted">Movement Summary</h3>
          <ResponsiveContainer width="100%" height="100%" className="-ml-3">
             <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 0, bottom: 20, left: 10 }}>
               <XAxis type="number" hide />
               <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#cbd5e1'}} width={70} />
               <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} contentStyle={{backgroundColor: '#0f172a', borderColor: 'rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12}} />
               <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={16}>
                  {chartData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.fill} />
                  ))}
               </Bar>
             </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-border/50 bg-surface/70 shadow-sm backdrop-blur overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface/50 text-xs uppercase text-muted border-b border-border/50">
              <tr>
                <th className="px-5 py-4 font-semibold">Date & Time</th>
                <th className="px-5 py-4 font-semibold">Type</th>
                <th className="px-5 py-4 font-semibold">Cylinder/Gas</th>
                <th className="px-5 py-4 font-semibold">Qty</th>
                <th className="px-5 py-4 font-semibold">Reference</th>
                <th className="px-5 py-4 font-semibold">Performed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {txs.length > 0 ? (
                txs.map((tx) => (
                  <tr key={tx.id} className="hover:bg-accent/5 transition">
                    <td className="px-5 py-4">
                       <span className="text-text font-medium">{formatDateTime(tx.created_at).split(',')[0]}</span>
                       <span className="text-xs text-muted block">{formatDateTime(tx.created_at).split(',')[1]}</span>
                    </td>
                    <td className="px-5 py-4">
                      <div className={`inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${getTypeBg(tx.transaction_type)}`}>
                        {getTypeIcon(tx.transaction_type)}
                        <span className="text-[10px] uppercase font-bold tracking-wide">{tx.transaction_type}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-semibold text-text">{tx.cylinder_size}</div>
                      <div className="text-[10px] text-muted uppercase">{tx.gas_type}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-[15px]">{tx.quantity > 0 ? '+' : ''}{tx.quantity}</span>
                    </td>
                    <td className="px-5 py-4">
                      {tx.reference_id ? (
                        <div className="text-sm">
                           <span className="text-text font-medium block">{tx.reference_id}</span>
                           <span className="text-[10px] text-muted uppercase">{tx.reference_type}</span>
                        </div>
                      ) : (
                        <span className="text-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-sm font-medium text-text">{tx.performed_by || 'System'}</span>
                      {tx.notes && <div className="text-xs text-muted truncate max-w-[150px]" title={tx.notes}>{tx.notes}</div>}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="px-5 py-8 text-center text-muted">No transactions recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
