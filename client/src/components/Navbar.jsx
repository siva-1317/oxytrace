import React, { useMemo } from 'react';
import { Bell, LogOut, Menu, RefreshCw, Wifi, WifiOff } from 'lucide-react';
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
      <div className="min-w-0 leading-tight">
        <div className="font-semibold text-text">OxyTrace</div>
        <div className="truncate text-xs text-muted">Real-time monitoring</div>
      </div>
    </div>
  );
}

export default function Navbar({ title, recentAlerts = [], alertCount = 0, onOpenMobileNav }) {
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
      '/mapping': 'Mapping',
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

  const userLabel = user?.user_metadata?.full_name || user?.email || 'Account';
  const avatarUrl = user?.user_metadata?.avatar_url;

  return (
    <div className="sticky top-0 z-30 border-b border-border/50 bg-surface/70 backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col gap-3 px-3 py-3 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              onClick={onOpenMobileNav}
              className="inline-flex items-center justify-center rounded-xl border border-border/60 bg-surface/60 p-2 text-text shadow-sm transition hover:border-accent/40 md:hidden"
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <Link to="/dashboard" className="min-w-0 shrink">
              <Logo />
            </Link>
          </div>

          <div className="hidden flex-1 justify-center md:flex">
            <div className="text-sm font-medium text-text/90">{pageTitle}</div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold shadow-sm sm:px-3 ${
                online ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger'
              }`}
              title={online ? `Connection speed: ${connectionLabel}` : 'Internet not connected'}
            >
              {online ? <Wifi size={16} /> : <WifiOff size={16} />}
              <span className="hidden lg:inline">{connectionLabel}</span>
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
                <div className="absolute right-0 mt-2 w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-border/60 bg-surface/90 p-2 shadow-xl backdrop-blur">
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
                <button className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-surface/60 px-2 py-2 text-sm shadow-sm transition hover:border-accent/40 sm:px-3">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt="avatar"
                      className="h-6 w-6 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="grid h-6 w-6 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                      {String(userLabel).charAt(0).toUpperCase()}
                    </div>
                  )}
                  <span className="hidden max-w-40 truncate sm:inline">{userLabel}</span>
                </button>
              </summary>
              <div className="absolute right-0 mt-2 w-48 rounded-xl border border-border/60 bg-surface/90 p-2 shadow-xl backdrop-blur">
                <div className="border-b border-border/40 px-2 py-2 text-xs text-muted sm:hidden">{userLabel}</div>
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

        <div className="md:hidden">
          <div className="truncate text-sm font-medium text-text/90">{pageTitle}</div>
        </div>
      </div>

      {!online ? (
        <div className="border-t border-danger/20 bg-danger/10 px-3 py-2 text-center text-xs font-medium text-danger sm:px-4 lg:px-6">
          You are working offline until internet is connected. Offline changes are stored locally
          {queueCount ? ` (${queueCount} pending)` : ''} and will sync automatically.
        </div>
      ) : null}
    </div>
  );
}
