import { apiJson, formatDateTime } from './api.js';
import { getHospitalAddressLines, loadHospitalProfile } from './hospitalProfile.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value, digits = 0) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num.toFixed(digits) : '0';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0));
}

function markdownToText(markdown = '') {
  return String(markdown)
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .trim();
}

function svgWrap(inner, width = 760, height = 240) {
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
}

function renderBarChart(items, { labelKey, valueKey, color = '#0077b6', title = '' }) {
  const data = (items || []).filter((item) => Number(item?.[valueKey] || 0) > 0).slice(0, 10);
  if (!data.length) return '<div class="chart-empty">No chart data available.</div>';
  const width = 760;
  const height = 240;
  const max = Math.max(...data.map((item) => Number(item[valueKey] || 0)), 1);
  const barWidth = Math.max(36, Math.floor((width - 80) / data.length) - 10);
  const gap = 10;
  const inner = data
    .map((item, index) => {
      const value = Number(item[valueKey] || 0);
      const label = String(item[labelKey] || '').slice(0, 12);
      const x = 40 + index * (barWidth + gap);
      const h = Math.max(12, (value / max) * 140);
      const y = 170 - h;
      return `
        <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" rx="10" fill="${color}" fill-opacity="0.82" />
        <text x="${x + barWidth / 2}" y="190" text-anchor="middle" font-size="11" fill="#516274">${escapeHtml(label)}</text>
        <text x="${x + barWidth / 2}" y="${y - 8}" text-anchor="middle" font-size="11" fill="#0f172a">${escapeHtml(formatNumber(value, value % 1 ? 1 : 0))}</text>
      `;
    })
    .join('');
  return `
    <div class="chart-card">
      <div class="section-subtitle">${escapeHtml(title)}</div>
      ${svgWrap(`<line x1="30" y1="170" x2="730" y2="170" stroke="#cfe0ef" stroke-width="1" />${inner}`, width, height)}
    </div>
  `;
}

function renderLineChart(items, { labelKey, valueKey, color = '#00b4d8', title = '' }) {
  const data = (items || []).filter((item) => item?.[valueKey] != null).slice(-12);
  if (!data.length) return '<div class="chart-empty">No chart data available.</div>';
  const width = 760;
  const height = 240;
  const values = data.map((item) => Number(item[valueKey] || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const spread = Math.max(1, max - min);
  const step = data.length > 1 ? 660 / (data.length - 1) : 0;
  const points = data
    .map((item, index) => {
      const x = 50 + index * step;
      const y = 170 - ((Number(item[valueKey] || 0) - min) / spread) * 120;
      return { x, y, label: String(item[labelKey] || '').slice(0, 12), value: Number(item[valueKey] || 0) };
    });
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
  const dots = points
    .map(
      (point) => `
        <circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}" />
        <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" font-size="10" fill="#0f172a">${escapeHtml(formatNumber(point.value, point.value % 1 ? 1 : 0))}</text>
        <text x="${point.x}" y="192" text-anchor="middle" font-size="10" fill="#516274">${escapeHtml(point.label)}</text>
      `
    )
    .join('');
  return `
    <div class="chart-card">
      <div class="section-subtitle">${escapeHtml(title)}</div>
      ${svgWrap(`
        <line x1="40" y1="170" x2="720" y2="170" stroke="#cfe0ef" stroke-width="1" />
        <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${dots}
      `, width, height)}
    </div>
  `;
}

function describeArc(cx, cy, radius, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
}

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180.0;
  return { x: cx + radius * Math.cos(angleRad), y: cy + radius * Math.sin(angleRad) };
}

function renderDonutChart(items, { labelKey, valueKey, title = '' }) {
  const palette = ['#0077b6', '#00b4d8', '#48cae4', '#90e0ef', '#ff9f1c', '#ff595e'];
  const data = (items || []).filter((item) => Number(item?.[valueKey] || 0) > 0).slice(0, 6);
  if (!data.length) return '<div class="chart-empty">No chart data available.</div>';
  const total = data.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0) || 1;
  let angle = 0;
  const slices = data
    .map((item, index) => {
      const next = angle + (Number(item[valueKey] || 0) / total) * 360;
      const path = describeArc(140, 120, 70, angle, next);
      const color = palette[index % palette.length];
      angle = next;
      return `<path d="${path}" stroke="${color}" stroke-width="34" fill="none" stroke-linecap="butt" />`;
    })
    .join('');
  const legend = data
    .map(
      (item, index) => `
        <div class="legend-row">
          <span class="legend-dot" style="background:${palette[index % palette.length]}"></span>
          <span>${escapeHtml(item[labelKey])}</span>
          <strong>${escapeHtml(formatNumber(item[valueKey], item[valueKey] % 1 ? 1 : 0))}</strong>
        </div>
      `
    )
    .join('');
  return `
    <div class="chart-card">
      <div class="section-subtitle">${escapeHtml(title)}</div>
      <div class="donut-wrap">
        ${svgWrap(`${slices}<circle cx="140" cy="120" r="48" fill="#ffffff" /><text x="140" y="116" text-anchor="middle" font-size="20" fill="#0f172a" font-weight="700">${escapeHtml(String(total))}</text><text x="140" y="134" text-anchor="middle" font-size="11" fill="#516274">total</text>`, 280, 240)}
        <div class="legend">${legend}</div>
      </div>
    </div>
  `;
}

function renderTable(columns, rows) {
  if (!rows?.length) return '<div class="chart-empty">No table rows available.</div>';
  const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
  const body = rows
    .map((row) => {
      const tds = columns
        .map((column) => `<td>${escapeHtml(typeof column.render === 'function' ? column.render(row) : row[column.key])}</td>`)
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function openPrintableReport({ title, subtitle, stats = [], sections = [] }) {
  const hospitalProfile = loadHospitalProfile();
  const addressLines = getHospitalAddressLines(hospitalProfile);
  const contactBits = [hospitalProfile.contact_name, hospitalProfile.email, hospitalProfile.phone].filter(Boolean);
  const win = window.open('', '_blank', 'width=1180,height=900');
  if (!win) throw new Error('Popup blocked. Please allow popups to generate the PDF report.');
  const statsHtml = stats
    .map(
      (stat) => `
        <div class="stat-card">
          <div class="stat-label">${escapeHtml(stat.label)}</div>
          <div class="stat-value">${escapeHtml(stat.value)}</div>
        </div>
      `
    )
    .join('');
  const sectionsHtml = sections
    .map(
      (section) => `
        <section class="report-section">
          <div class="section-title">${escapeHtml(section.title)}</div>
          ${section.body}
        </section>
      `
    )
    .join('');
  win.document.write(`<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(title)}</title>
      <style>
        @page { size: A4; margin: 18mm; }
        * { box-sizing: border-box; }
        body { font-family: Inter, Arial, sans-serif; margin: 0; color: #0f172a; background: #eef7ff; }
        body::before {
          content: "OxyTrace";
          position: fixed;
          inset: 35% 0 auto 0;
          text-align: center;
          font-size: 92px;
          font-weight: 800;
          letter-spacing: 0.12em;
          color: rgba(0, 119, 182, 0.07);
          transform: rotate(-24deg);
          pointer-events: none;
        }
        .page { position: relative; }
        .hero {
          border: 1px solid rgba(0, 119, 182, 0.15);
          background: linear-gradient(135deg, rgba(0, 180, 216, 0.10), rgba(255, 255, 255, 0.88));
          border-radius: 24px;
          padding: 22px 24px;
          margin-bottom: 18px;
        }
        .eyebrow { color: #0077b6; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        h1 { margin: 8px 0 6px; font-size: 28px; }
        .subtitle { color: #516274; font-size: 13px; }
        .meta { margin-top: 10px; color: #516274; font-size: 12px; }
        .hero-grid { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
        .hospital-card { min-width: 280px; max-width: 340px; border: 1px solid rgba(0, 119, 182, 0.12); background: rgba(255,255,255,0.72); border-radius: 18px; padding: 14px 16px; }
        .hospital-name { font-size: 18px; font-weight: 800; color: #0f172a; }
        .hospital-line { margin-top: 6px; color: #516274; font-size: 12px; line-height: 1.6; }
        .stats-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
        .stat-card, .report-section {
          border: 1px solid rgba(15, 23, 42, 0.08);
          background: rgba(255, 255, 255, 0.9);
          border-radius: 18px;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
        }
        .stat-card { padding: 14px 16px; }
        .stat-label { color: #516274; font-size: 12px; margin-bottom: 6px; }
        .stat-value { font-size: 22px; font-weight: 700; }
        .report-section { padding: 16px 18px; margin-bottom: 16px; }
        .section-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; color: #0f172a; }
        .section-subtitle { font-size: 12px; font-weight: 700; color: #516274; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
        .copy { color: #334155; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
        .chart-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
        .chart-card { border: 1px solid rgba(15, 23, 42, 0.06); border-radius: 16px; padding: 12px; background: rgba(240, 249, 255, 0.55); }
        .chart-empty { border: 1px dashed rgba(81, 98, 116, 0.35); border-radius: 16px; padding: 20px; color: #516274; font-size: 13px; text-align: center; }
        .donut-wrap { display: flex; align-items: center; gap: 18px; }
        .legend { flex: 1; display: grid; gap: 8px; }
        .legend-row { display: flex; align-items: center; gap: 10px; justify-content: space-between; font-size: 12px; color: #334155; }
        .legend-dot { width: 10px; height: 10px; border-radius: 999px; display: inline-block; margin-right: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th { text-align: left; padding: 10px 12px; background: rgba(0, 119, 182, 0.08); color: #334155; font-weight: 700; }
        td { padding: 10px 12px; border-top: 1px solid rgba(15, 23, 42, 0.07); color: #334155; vertical-align: top; }
        .two-up { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media print {
          body { background: white; }
          .hero, .stat-card, .report-section { box-shadow: none; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <div class="hero">
          <div class="hero-grid">
            <div>
              <div class="eyebrow">OxyTrace Report</div>
              <h1>${escapeHtml(title)}</h1>
              <div class="subtitle">${escapeHtml(subtitle)}</div>
              <div class="meta">Generated on ${escapeHtml(formatDateTime(new Date().toISOString()))}</div>
            </div>
            <div class="hospital-card">
              <div class="hospital-name">${escapeHtml(hospitalProfile.hospital_name || 'Hospital')}</div>
              ${addressLines.map((line) => `<div class="hospital-line">${escapeHtml(line)}</div>`).join('')}
              ${contactBits.length ? `<div class="hospital-line">${escapeHtml(contactBits.join(' | '))}</div>` : ''}
            </div>
          </div>
        </div>
        ${stats.length ? `<div class="stats-grid">${statsHtml}</div>` : ''}
        ${sectionsHtml}
      </div>
    </body>
  </html>`);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 450);
}

export function downloadAnalyticsReportPdf({ from, to, data, aiReport }) {
  const statusDist = data?.statusDist || [];
  openPrintableReport({
    title: 'Analytics Report',
    subtitle: `Hospital oxygen analytics from ${from} to ${to}`,
    stats: [
      { label: 'Total Consumption', value: `${formatNumber(data?.stats?.totalKg, 2)} kg` },
      { label: 'Tracked Wards', value: String(data?.stats?.wardCount || 0) },
      { label: 'Series Days', value: String(data?.totalSeries?.length || 0) },
      { label: 'Critical + Low', value: String(statusDist.filter((item) => item.name !== 'OK').reduce((sum, item) => sum + Number(item.value || 0), 0)) }
    ],
    sections: [
      {
        title: 'Executive Summary',
        body: `<div class="copy">${escapeHtml(markdownToText(aiReport) || 'Structured analytics summary generated from current dashboard data, including usage trends, anomalies, and refill planning signals.')}</div>`
      },
      {
        title: 'Charts',
        body: `<div class="chart-grid">
          ${renderLineChart(data?.totalSeries || [], { labelKey: 'day', valueKey: 'kg', title: 'Hospital-wide Consumption' })}
          <div class="two-up">
            ${renderBarChart(data?.byWard || [], { labelKey: 'ward', valueKey: 'kg', title: 'Consumption by Ward' })}
            ${renderDonutChart(statusDist, { labelKey: 'name', valueKey: 'value', title: 'Status Distribution' })}
          </div>
        </div>`
      },
      {
        title: 'Cylinder Performance Table',
        body: renderTable(
          [
            { label: 'Cylinder', key: 'cylinder_name' },
            { label: 'Ward', key: 'ward' },
            { label: 'Avg Gas %', render: (row) => formatNumber(row.avg_gas_level_pct, 1) },
            { label: 'Avg Leakage ppm', render: (row) => formatNumber(row.avg_leakage_ppm, 0) },
            { label: 'Avg Daily Use kg', render: (row) => formatNumber(row.avg_daily_use_kg, 2) }
          ],
          (data?.table || []).slice(0, 12)
        )
      }
    ]
  });
}

export function downloadRefillsReportPdf({ history, upcoming, stats, perCylinder }) {
  openPrintableReport({
    title: 'Refill Operations Report',
    subtitle: 'Refill history, projected needs, and batch activity snapshot',
    stats: [
      { label: 'Refills This Month', value: String(stats?.count || 0) },
      { label: 'Total Refilled', value: `${formatNumber(stats?.totalKg, 1)} kg` },
      { label: 'Most Refilled Cylinder', value: stats?.most || '-' },
      { label: 'History Rows', value: String(history?.length || 0) }
    ],
    sections: [
      {
        title: 'Refill Demand Overview',
        body: `<div class="two-up">
          ${renderBarChart(perCylinder || [], { labelKey: 'name', valueKey: 'count', title: 'Refills per Cylinder' })}
          ${renderTable(
            [
              { label: 'Cylinder', key: 'name' },
              { label: 'Ward', key: 'ward' },
              { label: 'Gas %', render: (row) => formatNumber(row.pct, 1) }
            ],
            (upcoming || []).slice(0, 8)
          )}
        </div>`
      },
      {
        title: 'Refill History',
        body: renderTable(
          [
            { label: 'Cylinder', render: (row) => row.cylinder?.cylinder_name || row.cylinder_name || '-' },
            { label: 'Ward', render: (row) => row.cylinder?.ward || row.ward || '-' },
            { label: 'Date', render: (row) => formatDateTime(row.refill_date) },
            { label: 'Prev kg', render: (row) => formatNumber(row.previous_weight_kg, 1) },
            { label: 'New kg', render: (row) => formatNumber(row.new_weight_kg, 1) },
            { label: 'By', key: 'refilled_by' }
          ],
          (history || []).slice(0, 15)
        )
      }
    ]
  });
}

export function downloadAlertsReportPdf({ alerts, filtered, stats, tab }) {
  const severityRows = [
    { name: 'Critical', value: (alerts || []).filter((row) => row.severity === 'critical').length },
    { name: 'Warning', value: (alerts || []).filter((row) => row.severity === 'warning').length },
    { name: 'Info', value: (alerts || []).filter((row) => row.severity === 'info').length }
  ];
  openPrintableReport({
    title: 'Active Alerts Report',
    subtitle: `Current alert status for ${tab === 'all' ? 'all severities' : tab}`,
    stats: [
      { label: 'Active Alerts', value: String(stats?.total || 0) },
      { label: 'Critical Alerts', value: String(stats?.critical || 0) },
      { label: 'Most Affected Ward', value: stats?.most || '-' },
      { label: 'Visible Rows', value: String(filtered?.length || 0) }
    ],
    sections: [
      {
        title: 'Severity Snapshot',
        body: `<div class="two-up">
          ${renderDonutChart(severityRows, { labelKey: 'name', valueKey: 'value', title: 'Severity Mix' })}
          ${renderTable(
            [
              { label: 'Cylinder', render: (row) => row.cylinder?.cylinder_name || row.cylinder_name || row.esp32_device_id },
              { label: 'Ward', render: (row) => row.cylinder?.ward || row.ward || '-' },
              { label: 'Type', key: 'alert_type' },
              { label: 'Severity', key: 'severity' }
            ],
            (filtered || []).slice(0, 10)
          )}
        </div>`
      },
      {
        title: 'Alert Detail Log',
        body: renderTable(
          [
            { label: 'Time', render: (row) => formatDateTime(row.created_at) },
            { label: 'Cylinder', render: (row) => row.cylinder?.cylinder_name || row.cylinder_name || row.esp32_device_id },
            { label: 'Message', key: 'message' },
            { label: 'Severity', key: 'severity' }
          ],
          (filtered || []).slice(0, 16)
        )
      }
    ]
  });
}

export function downloadCylindersReportPdf({ cylinders, filters }) {
  const wardCounts = Array.from(
    (cylinders || []).reduce((map, cylinder) => {
      const ward = cylinder.ward || 'Unknown';
      map.set(ward, (map.get(ward) || 0) + 1);
      return map;
    }, new Map()).entries()
  ).map(([ward, count]) => ({ ward, count }));
  const gasBands = [
    { name: 'Healthy', value: (cylinders || []).filter((row) => Number(row.latest_reading?.gas_level_pct ?? 0) >= 30).length },
    { name: 'Low', value: (cylinders || []).filter((row) => {
      const pct = Number(row.latest_reading?.gas_level_pct ?? 0);
      return pct >= 20 && pct < 30;
    }).length },
    { name: 'Critical', value: (cylinders || []).filter((row) => Number(row.latest_reading?.gas_level_pct ?? 0) < 20).length }
  ];
  openPrintableReport({
    title: 'Cylinder Fleet Report',
    subtitle: `Filtered fleet snapshot${filters?.ward && filters.ward !== 'all' ? ` for ward ${filters.ward}` : ''}`,
    stats: [
      { label: 'Visible Cylinders', value: String(cylinders?.length || 0) },
      { label: 'Active', value: String((cylinders || []).filter((row) => row.is_active).length) },
      { label: 'Low / Critical', value: String(gasBands[1].value + gasBands[2].value) },
      { label: 'Sort', value: filters?.sortBy || 'name' }
    ],
    sections: [
      {
        title: 'Fleet Distribution',
        body: `<div class="two-up">
          ${renderBarChart(wardCounts, { labelKey: 'ward', valueKey: 'count', title: 'Cylinders by Ward' })}
          ${renderDonutChart(gasBands, { labelKey: 'name', valueKey: 'value', title: 'Gas Level Bands' })}
        </div>`
      },
      {
        title: 'Cylinder Table',
        body: renderTable(
          [
            { label: 'Cylinder', key: 'cylinder_name' },
            { label: 'Ward', key: 'ward' },
            { label: 'Location', key: 'location' },
            { label: 'Gas %', render: (row) => formatNumber(row.latest_reading?.gas_level_pct, 1) },
            { label: 'Weight kg', render: (row) => formatNumber(row.latest_reading?.gas_weight_kg, 1) },
            { label: 'Leakage ppm', render: (row) => formatNumber(row.latest_reading?.leakage_ppm, 0) }
          ],
          (cylinders || []).slice(0, 18)
        )
      }
    ]
  });
}

export function downloadCylinderDetailReportPdf({ detail, refills, lineSeries, dailyUsage, range }) {
  openPrintableReport({
    title: `Cylinder Report - ${detail?.cylinder_name || 'Cylinder'}`,
    subtitle: `Detailed telemetry and refill view for range ${range}`,
    stats: [
      { label: 'Ward', value: detail?.ward || '-' },
      { label: 'Location', value: detail?.location || '-' },
      { label: 'Gas %', value: `${formatNumber(detail?.latest_reading?.gas_level_pct, 1)}%` },
      { label: 'Leakage ppm', value: formatNumber(detail?.latest_reading?.leakage_ppm, 0) }
    ],
    sections: [
      {
        title: 'Telemetry Trends',
        body: `<div class="chart-grid">
          ${renderLineChart(lineSeries || [], { labelKey: 't', valueKey: 'pct', title: 'Gas Percentage Trend' })}
          ${renderBarChart(dailyUsage || [], { labelKey: 'day', valueKey: 'kg', title: 'Daily Usage (kg/day)' })}
        </div>`
      },
      {
        title: 'Refill History',
        body: renderTable(
          [
            { label: 'Date', render: (row) => formatDateTime(row.refill_date) },
            { label: 'Prev kg', render: (row) => formatNumber(row.previous_weight_kg, 1) },
            { label: 'New kg', render: (row) => formatNumber(row.new_weight_kg, 1) },
            { label: 'By', key: 'refilled_by' },
            { label: 'Notes', key: 'notes' }
          ],
          (refills || []).slice(0, 12)
        )
      }
    ]
  });
}

export async function downloadStockReportPdf({ token, activeTab }) {
  const tab = activeTab || 'overview';
  if (tab === 'overview') {
    const data = await apiJson('/api/stock/overview', { token });
    openPrintableReport({
      title: 'Stock Report - Overview',
      subtitle: 'Procurement overview, supplier mix, and inventory status',
      stats: [
        { label: 'Total Stock Value', value: formatCurrency(data?.kpis?.total_stock_value) },
        { label: 'Cylinders Full', value: String(data?.kpis?.cylinders_full || 0) },
        { label: 'Pending Orders', value: String(data?.kpis?.pending_orders || 0) },
        { label: 'Low Stock Alerts', value: String(data?.kpis?.low_stock_alerts || 0) }
      ],
      sections: [
        {
          title: 'Overview Charts',
          body: `<div class="two-up">
            ${renderLineChart(data?.monthly_spend || [], { labelKey: 'month', valueKey: 'amount', title: 'Monthly Spend' })}
            ${renderDonutChart(data?.supplier_spend || [], { labelKey: 'supplier_name', valueKey: 'amount', title: 'Supplier Spend Mix' })}
          </div>`
        },
        {
          title: 'Inventory Summary',
          body: renderTable(
            [
              { label: 'Cylinder Size', key: 'cylinder_size' },
              { label: 'Gas', key: 'gas_type' },
              { label: 'Full', render: (row) => formatNumber(row.quantity_full, 0) },
              { label: 'In Use', render: (row) => formatNumber(row.quantity_in_use, 0) },
              { label: 'Empty', render: (row) => formatNumber(row.quantity_empty, 0) },
              { label: 'Damaged', render: (row) => formatNumber(row.quantity_damaged, 0) }
            ],
            (data?.inventory || []).slice(0, 12)
          )
        }
      ]
    });
    return;
  }

  if (tab === 'orders') {
    const data = await apiJson('/api/stock/orders?page=1&pageSize=50', { token });
    const statusSummary = ['pending', 'in_transit', 'partial', 'delivered', 'cancelled'].map((status) => ({
      name: status,
      value: (data?.orders || []).filter((row) => row.status === status).length
    }));
    openPrintableReport({
      title: 'Stock Report - Orders',
      subtitle: 'Order pipeline and procurement delivery status',
      stats: [
        { label: 'Orders', value: String(data?.orders?.length || 0) },
        { label: 'Delivered', value: String((data?.orders || []).filter((row) => row.status === 'delivered').length) },
        { label: 'In Transit', value: String((data?.orders || []).filter((row) => row.status === 'in_transit').length) },
        { label: 'Paid', value: String((data?.orders || []).filter((row) => row.payment_status === 'paid').length) }
      ],
      sections: [
        { title: 'Order Status Mix', body: renderDonutChart(statusSummary, { labelKey: 'name', valueKey: 'value', title: 'Order Status Distribution' }) },
        {
          title: 'Orders Table',
          body: renderTable(
            [
              { label: 'Order No.', key: 'order_number' },
              { label: 'Supplier', render: (row) => row.supplier?.supplier_name || '-' },
              { label: 'Status', key: 'status' },
              { label: 'Ordered', render: (row) => formatNumber(row.total_cylinders_ordered, 0) },
              { label: 'Received', render: (row) => formatNumber(row.total_cylinders_received, 0) },
              { label: 'Amount', render: (row) => formatCurrency(row.total_amount) }
            ],
            (data?.orders || []).slice(0, 16)
          )
        }
      ]
    });
    return;
  }

  if (tab === 'inventory') {
    const data = await apiJson('/api/stock/inventory', { token });
    const totals = (data?.inventory || []).reduce(
      (acc, row) => {
        acc[0].value += Number(row.quantity_full || 0);
        acc[1].value += Number(row.quantity_in_use || 0);
        acc[2].value += Number(row.quantity_empty || 0);
        acc[3].value += Number(row.quantity_damaged || 0);
        return acc;
      },
      [
        { name: 'Full', value: 0 },
        { name: 'In Use', value: 0 },
        { name: 'Empty', value: 0 },
        { name: 'Damaged', value: 0 }
      ]
    );
    openPrintableReport({
      title: 'Stock Report - Inventory',
      subtitle: 'Current stock buckets across all cylinder types',
      stats: [
        { label: 'Inventory Rows', value: String(data?.inventory?.length || 0) },
        { label: 'Full Cylinders', value: String(totals[0].value) },
        { label: 'In Use', value: String(totals[1].value) },
        { label: 'Damaged', value: String(totals[3].value) }
      ],
      sections: [
        { title: 'Inventory Bucket Mix', body: renderBarChart(totals, { labelKey: 'name', valueKey: 'value', title: 'Bucket Totals' }) },
        {
          title: 'Inventory Table',
          body: renderTable(
            [
              { label: 'Cylinder Type', key: 'cylinder_size' },
              { label: 'Gas', key: 'gas_type' },
              { label: 'Full', render: (row) => formatNumber(row.quantity_full, 0) },
              { label: 'In Use', render: (row) => formatNumber(row.quantity_in_use, 0) },
              { label: 'Empty', render: (row) => formatNumber(row.quantity_empty, 0) },
              { label: 'Damaged', render: (row) => formatNumber(row.quantity_damaged, 0) }
            ],
            (data?.inventory || []).slice(0, 16)
          )
        }
      ]
    });
    return;
  }

  if (tab === 'suppliers') {
    const data = await apiJson('/api/stock/suppliers', { token });
    const supplierTypes = Array.from(
      (data?.suppliers || []).reduce((map, row) => {
        const type = row.supplier_type || 'unknown';
        map.set(type, (map.get(type) || 0) + 1);
        return map;
      }, new Map()).entries()
    ).map(([name, value]) => ({ name, value }));
    openPrintableReport({
      title: 'Stock Report - Suppliers',
      subtitle: 'Supplier directory with delivery and spend performance',
      stats: [
        { label: 'Suppliers', value: String(data?.suppliers?.length || 0) },
        { label: 'Active', value: String((data?.suppliers || []).filter((row) => row.is_active).length) },
        { label: 'Top Spend', value: formatCurrency(Math.max(...(data?.suppliers || []).map((row) => Number(row.stats?.total_spend || 0)), 0)) },
        { label: 'Avg Rating', value: formatNumber((data?.suppliers || []).reduce((sum, row) => sum + Number(row.rating || 0), 0) / Math.max(1, data?.suppliers?.length || 0), 1) }
      ],
      sections: [
        { title: 'Supplier Type Mix', body: renderDonutChart(supplierTypes, { labelKey: 'name', valueKey: 'value', title: 'Supplier Types' }) },
        {
          title: 'Supplier Table',
          body: renderTable(
            [
              { label: 'Supplier', key: 'supplier_name' },
              { label: 'Type', key: 'supplier_type' },
              { label: 'Orders', render: (row) => formatNumber(row.stats?.total_orders, 0) },
              { label: 'Spend', render: (row) => formatCurrency(row.stats?.total_spend) },
              { label: 'On Time %', render: (row) => formatNumber(row.stats?.on_time_delivery_pct, 0) }
            ],
            (data?.suppliers || []).slice(0, 14)
          )
        }
      ]
    });
    return;
  }

  const data = await apiJson('/api/stock/transactions?page=1&pageSize=100', { token });
  const typeSummary = Array.from(
    (data?.transactions || []).reduce((map, row) => {
      const type = row.transaction_type || 'other';
      map.set(type, (map.get(type) || 0) + 1);
      return map;
    }, new Map()).entries()
  ).map(([name, value]) => ({ name, value }));
  openPrintableReport({
    title: 'Stock Report - Transactions',
    subtitle: 'Audit log and movement summary',
    stats: [
      { label: 'Transactions', value: String(data?.transactions?.length || 0) },
      { label: 'Received', value: String((data?.transactions || []).filter((row) => row.transaction_type === 'received').length) },
      { label: 'Issued', value: String((data?.transactions || []).filter((row) => row.transaction_type === 'issued').length) },
      { label: 'Damaged', value: String((data?.transactions || []).filter((row) => row.transaction_type === 'damaged').length) }
    ],
    sections: [
      { title: 'Movement Summary', body: renderBarChart(typeSummary, { labelKey: 'name', valueKey: 'value', title: 'Transactions by Type' }) },
      {
        title: 'Transaction Table',
        body: renderTable(
          [
            { label: 'Date', render: (row) => formatDateTime(row.created_at) },
            { label: 'Type', key: 'transaction_type' },
            { label: 'Cylinder', key: 'cylinder_size' },
            { label: 'Gas', key: 'gas_type' },
            { label: 'Qty', render: (row) => formatNumber(row.quantity, 0) },
            { label: 'By', key: 'performed_by' }
          ],
          (data?.transactions || []).slice(0, 18)
        )
      }
    ]
  });
}
