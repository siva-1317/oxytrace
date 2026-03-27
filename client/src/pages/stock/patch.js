import fs from 'fs';

const path = 'd:/oxytrace/client/src/pages/stock/OverviewTab.jsx';
let content = fs.readFileSync(path, 'utf8');

const replacement = `      {/* Financial KPIs */}
      <h2 className="text-lg font-semibold text-text mt-6 mb-3">Financial Summary</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
              <Wallet size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Total Investments</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.total_investment || 0} prefix="₹" separator="," decimals={2} />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-warning">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-warning/10 text-warning">
              <Banknote size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Outstanding Payment</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.total_unpaid || 0} prefix="₹" separator="," decimals={2} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Operational KPIs */}
      <h2 className="text-lg font-semibold text-text mt-8 mb-3">Cylinder Status & Operations</h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-accent">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
              <Package size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Total Owned Cylinders</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.cylinders_total || 0} />
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-success">
          <div className="flex pl-1 pr-3 flex-col justify-center">
            <div className="text-xs font-semibold text-success uppercase tracking-wider mb-1">Stock Full</div>
            <div className="text-xl font-bold text-text">
              <CountUp end={kpis?.cylinders_full || 0} />
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-warning">
          <div className="flex pl-1 pr-3 flex-col justify-center">
            <div className="text-xs font-semibold text-warning uppercase tracking-wider mb-1">In Use & Empty</div>
            <div className="text-xl font-bold text-text">
              <CountUp end={(kpis?.cylinders_in_use || 0) + (kpis?.cylinders_empty || 0)} />
              <span className="text-xs font-normal text-muted ml-2">({kpis?.cylinders_in_use || 0} in-use)</span>
            </div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/50 bg-surface/70 p-4 shadow-sm backdrop-blur transition hover:border-danger">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger/10 text-danger">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="text-sm font-medium text-muted">Damaged</div>
              <div className="text-xl font-bold text-text">
                <CountUp end={kpis?.cylinders_damaged || 0} />
              </div>
            </div>
          </div>
        </div>
      </div>`;

// Regex to replace the KPI block exactly
// Starts with {/* KPIs */}
// Ends gracefully right before `<div className="grid grid-cols-1 gap-6 xl:grid-cols-3">`

const matchStart = '{/* KPIs */}';
const matchEnd = '<div className="grid grid-cols-1 gap-6 xl:grid-cols-3">';

const startIndex = content.indexOf(matchStart);
const endIndex = content.indexOf(matchEnd);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.slice(0, startIndex) + replacement + '\\n\\n      ' + content.slice(endIndex);
  fs.writeFileSync(path, content, 'utf8');
  console.log("Success");
} else {
  console.log("Failed to find bounds");
  console.log(startIndex, endIndex);
}
