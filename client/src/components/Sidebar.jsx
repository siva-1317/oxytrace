import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Droplets,
  LayoutDashboard,
  LogOut,
  Map,
  PackageOpen,
  Settings,
  X
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cylinders', label: 'Cylinders', icon: Droplets },
  { to: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/refills', label: 'Refills', icon: Activity },
  { to: '/stock', label: 'Stock', icon: PackageOpen },
  { to: '/mapping', label: 'Mapping', icon: Map },
  { to: '/settings', label: 'Settings', icon: Settings }
];

function SidebarLinks({ alertCount, stockBadgeCount, onNavigate, expanded = true }) {
  return (
    <div className="space-y-1">
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={onNavigate}
            className={({ isActive }) =>
              [
                'relative flex items-center rounded-xl text-sm transition',
                expanded ? 'justify-between px-3 py-3' : 'justify-center px-2 py-3',
                isActive
                  ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                  : 'text-text hover:bg-card/30'
              ].join(' ')
            }
            title={!expanded ? it.label : undefined}
          >
            <span className={`flex items-center ${expanded ? 'gap-3' : 'justify-center'}`}>
              <Icon size={18} />
              <span
                className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
                  expanded ? 'max-w-[140px] translate-x-0 opacity-100' : 'max-w-0 -translate-x-2 opacity-0'
                }`}
              >
                {it.label}
              </span>
            </span>
            {expanded ? (
              it.to === '/alerts' && alertCount > 0 ? (
                <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
                  {alertCount}
                </span>
              ) : it.to === '/stock' && stockBadgeCount > 0 ? (
                <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-white">
                  {stockBadgeCount}
                </span>
              ) : null
            ) : it.to === '/alerts' && alertCount > 0 ? (
              <span className="absolute right-1 top-1 rounded-full bg-danger px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {alertCount}
              </span>
            ) : it.to === '/stock' && stockBadgeCount > 0 ? (
              <span className="absolute right-1 top-1 rounded-full bg-warning px-1.5 py-0.5 text-[10px] font-semibold text-white">
                {stockBadgeCount}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </div>
  );
}

function LogoutButton({ expanded = true, onClick }) {
  return (
    <button
      onClick={onClick}
      className={[
        'flex w-full items-center rounded-xl text-sm text-text transition hover:bg-card/30 hover:text-danger',
        expanded ? 'justify-between px-3 py-3' : 'justify-center px-2 py-3'
      ].join(' ')}
      title={!expanded ? 'Logout' : undefined}
      aria-label="Logout"
    >
      <span className={`flex items-center ${expanded ? 'gap-3' : 'justify-center'}`}>
        <LogOut size={18} />
        <span
          className={`overflow-hidden whitespace-nowrap transition-all duration-300 ${
            expanded ? 'max-w-[140px] translate-x-0 opacity-100' : 'max-w-0 -translate-x-2 opacity-0'
          }`}
        >
          Logout
        </span>
      </span>
    </button>
  );
}

export default function Sidebar({
  alertCount = 0,
  stockBadgeCount = 0,
  mobileOpen = false,
  onCloseMobile
}) {
  const [desktopExpanded, setDesktopExpanded] = useState(false);
  const { signOut } = useAuth();

  async function handleLogout() {
    onCloseMobile?.();
    await signOut();
  }

  return (
    <>
      <aside
        className={`hidden shrink-0 border-r border-border/50 bg-surface/60 backdrop-blur transition-[width,background-color] duration-300 ease-out md:flex md:flex-col ${
          desktopExpanded ? 'w-64' : 'w-20'
        }`}
        onMouseEnter={() => setDesktopExpanded(true)}
        onMouseLeave={() => setDesktopExpanded(false)}
      >
        <nav className={`flex-1 ${desktopExpanded ? 'p-3 pt-4' : 'p-2 pt-4'}`}>
          <SidebarLinks
            alertCount={alertCount}
            stockBadgeCount={stockBadgeCount}
            expanded={desktopExpanded}
          />
        </nav>
        <div className={`${desktopExpanded ? 'p-3 pb-4' : 'p-2 pb-4'}`}>
          <div className="border-t border-border/40 pt-3">
            <LogoutButton expanded={desktopExpanded} onClick={handleLogout} />
          </div>
        </div>
      </aside>

      <div
        className={`fixed inset-0 z-40 bg-background/70 backdrop-blur-sm transition md:hidden ${
          mobileOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onCloseMobile}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[88vw] max-w-sm flex-col border-r border-border/50 bg-surface/95 shadow-2xl backdrop-blur transition-transform duration-300 md:hidden ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border/40 p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 ring-1 ring-accent/25">
              <span className="font-semibold text-accent">O2</span>
            </div>
            <div className="leading-tight">
              <div className="font-semibold text-text">OxyTrace</div>
              <div className="text-xs text-muted">Navigation</div>
            </div>
          </div>
          <button
            onClick={onCloseMobile}
            className="rounded-xl border border-border/50 bg-surface px-3 py-2 text-text transition hover:border-accent hover:text-accent"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3">
          <SidebarLinks
            alertCount={alertCount}
            stockBadgeCount={stockBadgeCount}
            onNavigate={onCloseMobile}
            expanded={true}
          />
        </nav>
        <div className="p-3 pt-0">
          <div className="border-t border-border/40 pt-3">
            <LogoutButton expanded={true} onClick={handleLogout} />
          </div>
        </div>
      </aside>
    </>
  );
}
