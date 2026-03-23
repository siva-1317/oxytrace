import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import OverviewTab from './stock/OverviewTab.jsx';
import OrdersTab from './stock/OrdersTab.jsx';
import SuppliersTab from './stock/SuppliersTab.jsx';
import InventoryTab from './stock/InventoryTab.jsx';
import TransactionsTab from './stock/TransactionsTab.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import ReportDownloadButton from '../components/ReportDownloadButton.jsx';
import { downloadStockReportPdf } from '../lib/reportPrint.js';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'orders', label: 'Orders' },
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'transactions', label: 'Transactions' }
];

export default function Stock() {
  const { accessToken } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  return (
    <div className="relative flex h-full flex-col">
      <div className="mesh-bg" />
      
      <div className="relative z-10 flex flex-col space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text">Stock & Procurement</h1>
            <p className="text-sm text-muted">Manage oxygen cylinder inventory, orders, and suppliers</p>
          </div>
          <ReportDownloadButton onGenerate={() => downloadStockReportPdf({ token: accessToken, activeTab })} />
        </div>

        {/* Tabs */}
        <div className="flex w-full overflow-x-auto border-b border-border/50 pb-px scrollbar-hide">
          <div className="flex space-x-6">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id ? 'text-accent' : 'text-muted hover:text-text'
                }`}
              >
                {tab.label}
                {activeTab === tab.id && (
                  <motion.div
                    layoutId="stock-tab-indicator"
                    className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent"
                    initial={false}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="relative flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'orders' && <OrdersTab />}
              {activeTab === 'suppliers' && <SuppliersTab />}
              {activeTab === 'inventory' && <InventoryTab />}
              {activeTab === 'transactions' && <TransactionsTab />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
