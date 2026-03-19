import React from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Droplets,
  LayoutDashboard,
  PackageOpen,
  Settings
} from 'lucide-react';
import { NavLink } from 'react-router-dom';

const items = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/cylinders', label: 'Cylinders', icon: Droplets },
  { to: '/alerts', label: 'Alerts', icon: AlertTriangle },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/refills', label: 'Refills', icon: Activity },
  { to: '/stock', label: 'Stock', icon: PackageOpen },
  { to: '/settings', label: 'Settings', icon: Settings }
];

export default function Sidebar({ alertCount = 0, stockBadgeCount = 0 }) {
  return (
    <div className="hidden w-64 shrink-0 border-r border-border/50 bg-surface/60 backdrop-blur md:block">
      <nav className="p-3">
        <div className="space-y-1">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <NavLink
                key={it.to}
                to={it.to}
                className={({ isActive }) =>
                  [
                    'flex items-center justify-between rounded-xl px-3 py-2 text-sm transition',
                    isActive
                      ? 'bg-accent/10 text-accent ring-1 ring-accent/20'
                      : 'text-text hover:bg-card/30'
                  ].join(' ')
                }
              >
                <span className="flex items-center gap-2">
                  <Icon size={16} />
                  {it.label}
                </span>
                {it.to === '/alerts' && alertCount > 0 ? (
                  <span className="rounded-full bg-danger px-2 py-0.5 text-xs font-semibold text-white">
                    {alertCount}
                  </span>
                ) : it.to === '/stock' && stockBadgeCount > 0 ? (
                  <span className="rounded-full bg-warning px-2 py-0.5 text-xs font-semibold text-white">
                    {stockBadgeCount}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
