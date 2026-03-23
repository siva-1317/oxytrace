import React, { useMemo } from 'react';
import { Bell, LogOut, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import ThemeToggle from './ThemeToggle.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Link, useLocation } from 'react-router-dom';
import { useConnectivity } from '../hooks/useConnectivity.js';

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/15 ring-1 ring-accent/25">
        <span className="font-semibold text-accent">O2</span>
      </div>
      <div className="leading-tight">
        <div className="font-semibold">OxyTrace</div>
        <div className="text-xs text-muted">Real-time monitoring</div>
      </div>
    </div>
  );
}

export default function Navbar({ title, recentAlerts = [], alertCount = 0 }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const { online, effectiveType, downlink, speedMbps, queueCount } = useConnectivity();

  const pageTitle = useMemo(() => {
    if (title) return title;
    const map = {
      '/dashboard': 'Dashboard',
      '/cylinders': 'Cylinders',
      '/alerts': 'Alerts',
      '/analytics': 'Analytics',
      '/refills': 'Refills',
      '/stock': 'Stock',
      '/settings': 'Settings'
    };
    return map[location.pathname] || 'OxyTrace';
  }, [location.pathname, title]);

  const unresolved = recentAlerts.filter((a) => !a.is_resolved).slice(0, 5);
  const badge = Math.min(99, Number(alertCount || unresolved.length || 0));
  const connectionLabel = online
    ? speedMbps
      ? `${speedMbps.toFixed(2)} Mbps`
      : downlink
      ? `${downlink.toFixed(1)} Mbps`
      : effectiveType || 'Online'
    : 'Not connected';

  return (
    <div className="sticky top-0 z-30 border-b border-border/50 bg-surface/70 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/dashboard" className="shrink-0">
          <Logo />
        </Link>
        <div className="hidden flex-1 justify-center md:flex">
          <div className="text-sm font-medium text-text/90">{pageTitle}</div>
        </div>
        <div className="flex items-center gap-3">
          <div
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold shadow-sm ${
              online ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
            }`}
            title={online ? `Connection speed: ${connectionLabel}` : 'Internet not connected'}
          >
            {online ? <Wifi size={16} /> : <WifiOff size={16} />}
            <span className="hidden sm:inline">{connectionLabel}</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-lg border border-border/60 bg-surface/60 p-2 text-text shadow-sm transition hover:border-accent/40"
            title="Refresh page"
          >
            <RefreshCw size={18} />
          </button>
          <div className="relative">
            <details className="group">
              <summary className="list-none">
                <button className="relative inline-flex items-center justify-center rounded-lg border border-border/60 bg-surface/60 p-2 text-text shadow-sm transition hover:border-accent/40">
                  <Bell size={18} />
                  {badge > 0 ? (
                    <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
                      {badge}
                    </span>
                  ) : null}
                </button>
              </summary>
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-border/60 bg-surface/90 p-2 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="text-xs font-semibold text-muted">Notifications</div>
                  <div className="text-xs text-muted">{badge} active</div>
                </div>
                {unresolved.length === 0 ? (
                  <div className="px-2 py-3 text-sm text-muted">No unresolved alerts.</div>
                ) : (
                  <div className="space-y-1">
                    {unresolved.map((a) => (
                      <div key={a.id} className="rounded-lg border border-border/60 bg-card/40 px-2 py-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium">
                            {a.cylinder?.cylinder_name ? `${a.cylinder.cylinder_name} · ` : ''}
                            {a.alert_type}
                          </div>
                          <div className={a.severity === 'critical' ? 'text-danger text-xs' : 'text-warning text-xs'}>
                            {a.severity}
                          </div>
                        </div>
                        <div className="text-xs text-muted">{a.message}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-2 flex items-center justify-between px-2 pb-1">
                  <Link to="/alerts" className="text-sm text-accent hover:underline">
                    View all
                  </Link>
                </div>
              </div>
            </details>
          </div>
          <ThemeToggle />
          <details className="group relative">
            <summary className="list-none">
              <button className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface/60 px-3 py-2 text-sm shadow-sm transition hover:border-accent/40">
                <img
                  src={user?.user_metadata?.avatar_url}
                  alt="avatar"
                  className="h-6 w-6 rounded-full"
                  referrerPolicy="no-referrer"
                />
                <span className="hidden sm:inline">{user?.user_metadata?.full_name || user?.email}</span>
              </button>
            </summary>
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border/60 bg-surface/90 p-2 shadow-xl backdrop-blur">
              <button
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-card/40"
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          </details>
        </div>
      </div>
      {!online ? (
        <div className="border-t border-danger/20 bg-danger/10 px-4 py-2 text-center text-xs font-medium text-danger">
          You are working offline until internet is connected. Offline changes are stored locally{queueCount ? ` (${queueCount} pending)` : ''} and will sync automatically.
        </div>
      ) : null}
    </div>
  );
}
