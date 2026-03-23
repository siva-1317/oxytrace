import React from 'react';
import Skeleton from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';

function Skel(props) {
  return <Skeleton baseColor="var(--skel-base)" highlightColor="var(--skel-highlight)" {...props} />;
}

function CardShell({ className = '', children }) {
  return <div className={`rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur ${className}`}>{children}</div>;
}

function FilterBarShell() {
  return (
    <CardShell className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div className="space-y-2">
        <Skel height={22} width={180} />
        <Skel height={12} width={260} />
      </div>
      <div className="w-full md:w-72">
        <Skel height={42} />
      </div>
    </CardShell>
  );
}

function ToolbarShell() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Skel height={40} width={130} borderRadius={14} />
        <Skel height={40} width={120} borderRadius={14} />
        <Skel height={40} width={144} borderRadius={14} />
        <Skel height={40} width={128} borderRadius={14} />
      </div>
      <Skel height={42} width={152} borderRadius={14} />
    </div>
  );
}

function CylinderCardShell() {
  return (
    <CardShell>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skel height={20} width={150} />
          <div className="flex gap-2">
            <Skel height={22} width={72} borderRadius={999} />
            <Skel height={14} width={110} />
          </div>
        </div>
        <Skel height={30} width={88} borderRadius={999} />
      </div>
      <div className="mt-4">
        <Skel height={10} borderRadius={999} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="rounded-xl border border-border/50 bg-card/30 p-2">
            <Skel height={12} width="65%" />
            <div className="mt-2">
              <Skel height={18} width="80%" />
            </div>
          </div>
        ))}
      </div>
    </CardShell>
  );
}

function AnalyticsShell() {
  return (
    <div className="space-y-4">
      <CardShell className="flex flex-wrap items-end gap-3">
        <Skel height={16} width={90} />
        <Skel height={40} width={170} borderRadius={14} />
        <Skel height={40} width={170} borderRadius={14} />
        <div className="flex-1" />
        <Skel height={40} width={120} borderRadius={14} />
      </CardShell>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <CardShell key={index}>
            <Skel height={18} width={index === 5 ? 160 : 210} />
            <div className="mt-4 h-60 rounded-xl border border-border/40 bg-card/20 p-3">
              <div className="flex h-full items-end gap-2">
                {Array.from({ length: index === 4 ? 5 : 9 }).map((__, barIndex) => (
                  <Skel
                    key={barIndex}
                    height={index === 4 ? 96 + ((barIndex * 22) % 60) : 60 + ((barIndex * 19) % 120)}
                    width="100%"
                    containerClassName="flex-1 self-end"
                    borderRadius={12}
                  />
                ))}
              </div>
            </div>
          </CardShell>
        ))}
      </div>

      <CardShell>
        <div className="flex items-center justify-between gap-3">
          <Skel height={18} width={140} />
          <Skel height={42} width={160} borderRadius={14} />
        </div>
        <div className="mt-4 space-y-2">
          <Skel height={14} count={4} />
        </div>
      </CardShell>

      <CardShell className="overflow-hidden p-0">
        <div className="border-b border-border/40 px-5 py-4">
          <Skel height={14} width="100%" />
        </div>
        <div className="space-y-4 px-5 py-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skel key={index} height={18} />
          ))}
        </div>
      </CardShell>
    </div>
  );
}

function CylindersShell() {
  return (
    <div className="space-y-4">
      <FilterBarShell />
      <ToolbarShell />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <CylinderCardShell key={index} />
        ))}
      </div>
    </div>
  );
}

function CylinderDetailShell() {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-6 xl:col-span-1">
        <CardShell className="bg-surface/80">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2">
              <Skel height={24} width={190} />
              <Skel height={12} width={220} />
            </div>
            <Skel height={40} width={110} borderRadius={14} />
          </div>
          <div className="mt-6 flex justify-center">
            <Skel circle height={170} width={170} />
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="rounded-xl border border-border/50 bg-card/30 p-2">
                <Skel height={12} width="70%" />
                <div className="mt-2">
                  <Skel height={18} width="75%" />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4">
            <Skel height={52} borderRadius={14} />
          </div>
        </CardShell>

        <CardShell>
          <div className="flex items-center justify-between">
            <Skel height={18} width={120} />
            <Skel height={40} width={100} borderRadius={14} />
          </div>
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skel key={index} height={18} />
            ))}
          </div>
        </CardShell>
      </div>

      <div className="space-y-6 xl:col-span-2">
        <CardShell>
          <div className="flex items-center justify-between gap-3">
            <Skel height={18} width={80} />
            <div className="flex gap-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skel key={index} height={32} width={46} borderRadius={10} />
              ))}
            </div>
          </div>
          <div className="mt-4 h-64 rounded-xl border border-border/40 bg-card/20 p-3">
            <div className="flex h-full items-end gap-2">
              {Array.from({ length: 11 }).map((_, index) => (
                <Skel key={index} height={72 + ((index * 17) % 130)} width="100%" containerClassName="flex-1 self-end" borderRadius={12} />
              ))}
            </div>
          </div>
        </CardShell>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <CardShell key={index}>
              <Skel height={18} width={index === 0 ? 120 : 100} />
              <div className="mt-4 h-56 rounded-xl border border-border/40 bg-card/20 p-3">
                <div className="flex h-full items-end gap-2">
                  {Array.from({ length: 8 }).map((__, barIndex) => (
                    <Skel key={barIndex} height={58 + ((barIndex * 21) % 110)} width="100%" containerClassName="flex-1 self-end" borderRadius={12} />
                  ))}
                </div>
              </div>
            </CardShell>
          ))}
        </div>
      </div>
    </div>
  );
}

function RefillsShell() {
  return (
    <div className="space-y-4">
      <CardShell className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-surface/80">
        <div className="space-y-2">
          <Skel height={24} width={180} />
          <Skel height={12} width={240} />
        </div>
        <div className="flex gap-2">
          <Skel height={42} width={120} borderRadius={14} />
          <Skel height={42} width={150} borderRadius={14} />
        </div>
      </CardShell>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardShell key={index} className={index === 2 || index === 3 ? 'md:col-span-2' : ''}>
            <Skel height={12} width={index > 1 ? '55%' : '45%'} />
            <div className="mt-3">
              <Skel height={28} width={index > 1 ? '70%' : '40%'} />
            </div>
          </CardShell>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CardShell>
          <Skel height={18} width={170} />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="grid grid-cols-3 gap-3">
                <Skel height={16} />
                <Skel height={16} />
                <Skel height={16} />
              </div>
            ))}
          </div>
        </CardShell>

        <CardShell>
          <Skel height={18} width={130} />
          <div className="mt-4 h-60 rounded-xl border border-border/40 bg-card/20 p-3">
            <div className="flex h-full items-end gap-2">
              {Array.from({ length: 10 }).map((_, index) => (
                <Skel key={index} height={72 + ((index * 13) % 100)} width="100%" containerClassName="flex-1 self-end" borderRadius={12} />
              ))}
            </div>
          </div>
        </CardShell>
      </div>

      <CardShell className="overflow-hidden p-0">
        <div className="border-b border-border/40 px-5 py-4">
          <Skel height={14} width="100%" />
        </div>
        <div className="space-y-4 px-5 py-5">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skel key={index} height={18} />
          ))}
        </div>
      </CardShell>
    </div>
  );
}

function StockOverviewShell() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <CardShell key={index}>
            <div className="flex items-center gap-3">
              <Skel circle height={40} width={40} />
              <div className="space-y-2">
                <Skel height={14} width={120} />
                <Skel height={24} width={90} />
              </div>
            </div>
          </CardShell>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Skel height={20} width={110} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <CardShell key={index} className="bg-surface/60">
                <div className="flex items-center justify-between">
                  <Skel height={18} width={120} />
                  <Skel height={18} width={52} borderRadius={8} />
                </div>
                <div className="mt-4">
                  <Skel height={12} borderRadius={999} />
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {Array.from({ length: 4 }).map((__, pillIndex) => (
                    <Skel key={pillIndex} height={12} />
                  ))}
                </div>
              </CardShell>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <CardShell key={index}>
                <Skel height={18} width={index === 0 ? 160 : 130} />
                <div className="mt-4 h-48 rounded-xl border border-border/40 bg-card/20 p-3">
                  <div className="flex h-full items-end gap-2">
                    {Array.from({ length: index === 0 ? 8 : 5 }).map((__, barIndex) => (
                      <Skel key={barIndex} height={64 + ((barIndex * 21) % 90)} width="100%" containerClassName="flex-1 self-end" borderRadius={12} />
                    ))}
                  </div>
                </div>
              </CardShell>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, index) => (
            <CardShell key={index}>
              <Skel height={18} width={index === 0 ? 130 : 120} />
              <div className="mt-4 space-y-3">
                {Array.from({ length: index === 0 ? 3 : 4 }).map((__, rowIndex) => (
                  <Skel key={rowIndex} height={16} />
                ))}
              </div>
            </CardShell>
          ))}
        </div>
      </div>
    </div>
  );
}

function StockTableShell({ rows = 5, columns = 1, header = true, topbar = true }) {
  return (
    <div className="space-y-4">
      {topbar ? (
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <Skel height={42} width={260} borderRadius={14} />
          <div className="flex gap-3">
            <Skel height={42} width={120} borderRadius={14} />
            <Skel height={42} width={130} borderRadius={14} />
          </div>
        </div>
      ) : null}

      <CardShell className="overflow-hidden p-0">
        {header ? (
          <div className="border-b border-border/40 px-5 py-4">
            <Skel height={14} width="100%" />
          </div>
        ) : null}
        <div className="space-y-4 px-5 py-5">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <div key={rowIndex} className={`grid gap-3`} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
              {Array.from({ length: columns }).map((__, colIndex) => (
                <Skel key={colIndex} height={18} />
              ))}
            </div>
          ))}
        </div>
      </CardShell>
    </div>
  );
}

function StockSuppliersShell() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Skel height={22} width={150} />
        <Skel height={42} width={132} borderRadius={14} />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <CardShell key={index} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <Skel circle height={40} width={40} />
                <div className="space-y-2">
                  <Skel height={18} width={140} />
                  <Skel height={14} width={70} borderRadius={8} />
                </div>
              </div>
              <Skel height={26} width={42} borderRadius={10} />
            </div>
            <div className="mt-4 space-y-2">
              <Skel height={14} />
              <Skel height={14} width="80%" />
              <Skel height={14} width="60%" />
            </div>
            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border/40 pt-4">
              {Array.from({ length: 3 }).map((__, statIndex) => (
                <div key={statIndex} className="space-y-1 text-center">
                  <Skel height={12} />
                  <Skel height={16} />
                </div>
              ))}
            </div>
          </CardShell>
        ))}
      </div>
    </div>
  );
}

function StockTransactionsShell() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <CardShell className="md:col-span-2 p-5">
          <div className="flex items-center justify-between">
            <Skel height={18} width={150} />
            <Skel height={30} width={72} borderRadius={10} />
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Skel height={42} borderRadius={14} containerClassName="flex-1" />
            <Skel height={42} width={110} borderRadius={14} />
          </div>
        </CardShell>
        <CardShell className="h-48 p-5">
          <Skel height={16} width={120} />
          <div className="mt-4 h-28 rounded-xl border border-border/40 bg-card/20 p-3">
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skel height={12} width={60} />
                  <Skel height={14} borderRadius={999} containerClassName="flex-1" />
                </div>
              ))}
            </div>
          </div>
        </CardShell>
      </div>

      <StockTableShell rows={6} columns={6} topbar={false} />
    </div>
  );
}

export default function DashboardPageLoader({ variant = 'analytics' }) {
  const content =
    variant === 'cylinders'
      ? <CylindersShell />
      : variant === 'cylinder-detail'
        ? <CylinderDetailShell />
        : variant === 'refills'
          ? <RefillsShell />
          : <AnalyticsShell />;

  return (
    <div className="relative overflow-hidden rounded-[28px]">
      <div className="mesh-bg" />
      <div className="relative z-10">{content}</div>
    </div>
  );
}

export { CardShell, CylindersShell, RefillsShell, Skel, StockOverviewShell, StockSuppliersShell, StockTableShell, StockTransactionsShell };
