import React, { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Navbar from './components/Navbar.jsx';
import Sidebar from './components/Sidebar.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Cylinders from './pages/Cylinders.jsx';
import CylinderDetail from './pages/CylinderDetail.jsx';
import Alerts from './pages/Alerts.jsx';
import Analytics from './pages/Analytics.jsx';
import Refills from './pages/Refills.jsx';
import Settings from './pages/Settings.jsx';
import Stock from './pages/Stock.jsx';
import Mapping from './pages/Mapping.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { apiJson, getCachedData, initializeOfflineSync } from './lib/api.js';
import Spinner from './components/Spinner.jsx';

function ProtectedRoute({ children }) {
  const { session, loading } = useAuth();
  const loc = useLocation();
  if (loading)
    return (
      <div className="grid h-full place-items-center">
        <Spinner label="Loading session…" />
      </div>
    );
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}

const pageVariants = {
  hidden: { opacity: 0, y: 10 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, staggerChildren: 0.06 }
  }
};

export default function App() {
  const { session, accessToken } = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [recentAlerts, setRecentAlerts] = useState(() => getCachedData('/api/alerts?status=active&limit=5')?.alerts || []);
  const [activeAlertCount, setActiveAlertCount] = useState(() => Number(getCachedData('/api/alerts?status=active&limit=5')?.count || 0));
  const [stockBadgeCount, setStockBadgeCount] = useState(() => {
    const cached = getCachedData('/api/stock/overview');
    return Number(cached?.kpis?.in_transit_orders || 0) + Number(cached?.kpis?.low_stock_alerts || 0);
  });

  useEffect(() => initializeOfflineSync(), []);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    async function load() {
      try {
        const [alertsData, stockData] = await Promise.all([
          apiJson('/api/alerts?status=active&limit=5', {
            token: accessToken,
            cacheKey: '/api/alerts?status=active&limit=5'
          }),
          apiJson('/api/stock/overview', { token: accessToken, cacheKey: '/api/stock/overview' })
        ]);
        if (cancelled) return;
        setRecentAlerts(alertsData.alerts || []);
        setActiveAlertCount(Number(alertsData.count || 0));
        setStockBadgeCount(
          Number(stockData?.kpis?.in_transit_orders || 0) + Number(stockData?.kpis?.low_stock_alerts || 0)
        );
      } catch {
        // ignore
      }
    }
    load();
    const t = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [accessToken, location.pathname]);

  const badgeCount = useMemo(() => Number(activeAlertCount || 0), [activeAlertCount]);

  return (
    <div className="h-full">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <ProtectedRoute>
              <div className="flex h-full">
                <Sidebar
                  alertCount={badgeCount}
                  stockBadgeCount={stockBadgeCount}
                  mobileOpen={mobileNavOpen}
                  onCloseMobile={() => setMobileNavOpen(false)}
                />
                <div className="flex min-w-0 flex-1 flex-col">
                  <Navbar
                    recentAlerts={recentAlerts}
                    alertCount={badgeCount}
                    onOpenMobileNav={() => setMobileNavOpen(true)}
                  />
                  <motion.main
                    variants={pageVariants}
                    initial="hidden"
                    animate="show"
                    className="relative flex-1 overflow-auto"
                  >
                    <div className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
                      <ErrorBoundary>
                        <Routes>
                          <Route path="/" element={<Navigate to="/dashboard" replace />} />
                          <Route path="/dashboard" element={<Dashboard />} />
                          <Route path="/cylinders" element={<Cylinders />} />
                          <Route path="/cylinders/:id" element={<CylinderDetail />} />
                          <Route path="/alerts" element={<Alerts />} />
                          <Route path="/analytics" element={<Analytics />} />
                          <Route path="/refills" element={<Refills />} />
                          <Route path="/stock" element={<Stock />} />
                          <Route path="/mapping" element={<Mapping />} />
                          <Route path="/settings" element={<Settings />} />
                          <Route path="*" element={<Navigate to="/dashboard" replace />} />
                        </Routes>
                      </ErrorBoundary>
                    </div>
                  </motion.main>
                </div>
              </div>
            </ProtectedRoute>
          }
        />
      </Routes>
      {!session ? null : null}
    </div>
  );
}
