import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { supabaseAdmin } from '../services/supabaseAdmin.js';
import { analyzeStock, generateSupplierOrderEmail } from '../services/geminiService.js';
import { isMailConfigured, sendMail } from '../services/mailService.js';
import { getInventoryRow, updateInventoryBuckets } from '../utils/stockInventory.js';
import { resolveAiOptions } from '../utils/aiConfig.js';

const router = express.Router();
router.use(requireAuth);

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows, header) {
  const lines = [header.map(csvEscape).join(',')];
  for (const r of rows) lines.push(header.map((k) => csvEscape(r[k])).join(','));
  return lines.join('\n');
}

function isoDate(d) {
  if (!d) return null;
  if (typeof d === 'string') return d.slice(0, 10);
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function monthKey(d) {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

function buildGeneratedOrderNumber() {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const nonce = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `STK-${stamp}-${nonce}`;
}

function buildGeneratedInvoiceNumber() {
  const stamp = new Date().toISOString().replaceAll('-', '').replaceAll(':', '').replaceAll('T', '').replaceAll('Z', '').replaceAll('.', '').slice(0, 12);
  const nonce = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `INV-${stamp}-${nonce}`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function parseAiEmailJson(raw, fallback) {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return {
      subject: parsed.subject || fallback.subject,
      greeting: parsed.greeting || fallback.greeting,
      intro: parsed.intro || fallback.intro,
      closing: parsed.closing || fallback.closing
    };
  } catch {
    return fallback;
  }
}

function hospitalAddressLine(profile) {
  return [
    profile?.address_line_1,
    profile?.address_line_2,
    profile?.city,
    profile?.state,
    profile?.postal_code,
    profile?.country
  ]
    .filter(Boolean)
    .join(', ');
}

function buildOrderMailHtml({ mailContent, order, supplier, hospitalProfile }) {
  const rows = (order.items || [])
    .map(
      (item) => `
        <tr>
          <td style="padding:10px;border:1px solid #d7e3f4;">${escapeHtml(item.cylinder_size)}</td>
          <td style="padding:10px;border:1px solid #d7e3f4;">${escapeHtml(item.gas_type)}</td>
          <td style="padding:10px;border:1px solid #d7e3f4;text-align:right;">${escapeHtml(item.quantity_ordered)}</td>
        </tr>`
    )
    .join('');

  const fromBits = [
    hospitalProfile?.hospital_name,
    hospitalProfile?.contact_name,
    hospitalProfile?.email,
    hospitalProfile?.phone,
    hospitalAddressLine(hospitalProfile)
  ].filter(Boolean);

  return `
    <div style="font-family:Inter,Arial,sans-serif;color:#0f172a;line-height:1.6;">
      <p>${escapeHtml(mailContent.greeting)}</p>
      <p>${escapeHtml(mailContent.intro)}</p>
      <div style="margin:18px 0;padding:14px 16px;border:1px solid #d7e3f4;border-radius:14px;background:#f8fbff;">
        <div><strong>Order Number:</strong> ${escapeHtml(order.order_number)}</div>
        <div><strong>Invoice Number:</strong> ${escapeHtml(order.invoice_number)}</div>
        <div><strong>Expected Delivery Date:</strong> ${escapeHtml(order.expected_delivery_date || '-')}</div>
        <div><strong>Supplier:</strong> ${escapeHtml(supplier?.supplier_name || 'Supplier')}</div>
      </div>
      <table style="width:100%;border-collapse:collapse;margin:18px 0;">
        <thead>
          <tr style="background:#eaf4fb;">
            <th style="padding:10px;border:1px solid #d7e3f4;text-align:left;">Cylinder Size</th>
            <th style="padding:10px;border:1px solid #d7e3f4;text-align:left;">Gas Type</th>
            <th style="padding:10px;border:1px solid #d7e3f4;text-align:right;">Quantity</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p>${escapeHtml(mailContent.closing)}</p>
      <div style="margin-top:20px;padding-top:14px;border-top:1px solid #d7e3f4;">
        <div style="font-weight:700;">From:</div>
        ${fromBits.map((bit) => `<div>${escapeHtml(bit)}</div>`).join('')}
      </div>
    </div>
  `;
}

function buildOrderMailText({ mailContent, order, supplier, hospitalProfile }) {
  const itemLines = (order.items || [])
    .map((item) => `- ${item.cylinder_size} | ${item.gas_type} | Qty: ${item.quantity_ordered}`)
    .join('\n');

  return [
    mailContent.greeting,
    '',
    mailContent.intro,
    '',
    `Order Number: ${order.order_number}`,
    `Invoice Number: ${order.invoice_number}`,
    `Supplier: ${supplier?.supplier_name || 'Supplier'}`,
    `Expected Delivery Date: ${order.expected_delivery_date || '-'}`,
    '',
    'Ordered Items:',
    itemLines,
    '',
    mailContent.closing,
    '',
    'From:',
    hospitalProfile?.hospital_name || '',
    hospitalProfile?.contact_name || '',
    hospitalProfile?.email || '',
    hospitalProfile?.phone || '',
    hospitalAddressLine(hospitalProfile)
  ]
    .filter(Boolean)
    .join('\n');
}

function normalizeOrderItems(items) {
  const source = Array.isArray(items) ? items : [];
  return source.map((it) => {
    const quantity_ordered = Math.max(0, Number(it.quantity_ordered || 0));
    const quantity_received = Math.max(0, Number(it.quantity_received || 0));
    const unit_price = Math.max(0, Number(it.unit_price || 0));
    const total_price = Number((quantity_ordered * unit_price).toFixed(2));
    const stock_mode =
      String(it.stock_mode || 'replace_cylinder').trim() === 'new_cylinders'
        ? 'new_cylinders'
        : 'replace_cylinder';
    return {
      cylinder_size: String(it.cylinder_size || '').trim(),
      gas_type: String(it.gas_type || 'oxygen').trim(),
      quantity_ordered,
      quantity_received,
      stock_mode,
      unit_price,
      total_price,
      pressure_bar: it.pressure_bar != null && it.pressure_bar !== '' ? Number(it.pressure_bar) : null,
      batch_number: String(it.batch_number || '').trim() || null,
      expiry_date: isoDate(it.expiry_date),
      condition: String(it.condition || 'good')
    };
  });
}

function isMissingStockModeColumnError(error) {
  const message = String(error?.message || error || '');
  return (
    message.includes("'stock_mode'") &&
    message.includes("'stock_order_items'") &&
    message.toLowerCase().includes('schema cache')
  );
}

function omitStockMode(item) {
  if (!item || typeof item !== 'object') return item;
  const { stock_mode, ...rest } = item;
  return rest;
}

async function insertStockOrderItems(rows) {
  const payload = Array.isArray(rows) ? rows : [];
  let result = await supabaseAdmin.from('stock_order_items').insert(payload);
  if (!result.error || !isMissingStockModeColumnError(result.error)) return result;
  return supabaseAdmin.from('stock_order_items').insert(payload.map(omitStockMode));
}

async function updateStockOrderItemById(id, patch) {
  let result = await supabaseAdmin.from('stock_order_items').update(patch).eq('id', id);
  if (!result.error || !isMissingStockModeColumnError(result.error)) return result;
  return supabaseAdmin.from('stock_order_items').update(omitStockMode(patch)).eq('id', id);
}

async function fetchOrderWithRelations(id) {
  const { data, error } = await supabaseAdmin
    .from('stock_orders')
    .select('*, suppliers (id, supplier_name, supplier_type, email, contact_person), stock_order_items (*)')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);
  return mapOrderRow(data);
}

function mapOrderRow(r) {
  if (!r) return r;
  const { suppliers, stock_order_items, ...rest } = r;
  return {
    ...rest,
    supplier: suppliers || null,
    items: stock_order_items || []
  };
}

function derivePaymentStatus(totalAmount, paidAmount, fallback = 'unpaid') {
  const total = Math.max(0, Number(totalAmount || 0));
  const paid = Math.max(0, Number(paidAmount || 0));
  if (total <= 0) return fallback;
  if (paid >= total) return 'paid';
  if (paid > 0) return 'partial';
  return 'unpaid';
}

router.get('/overview', async (_req, res, next) => {
  try {
    const { data: inventory, error: invErr } = await supabaseAdmin
      .from('stock_inventory')
      .select('*')
      .order('cylinder_size', { ascending: true })
      .limit(5000);
    if (invErr) throw new Error(invErr.message);

    const lowStock = (inventory || []).filter(
      (i) => Number(i.quantity_full || 0) < Number(i.reorder_level || 0)
    );

    const { data: ordersAll, error: ordErr } = await supabaseAdmin
      .from('stock_orders')
      .select('id, order_number, supplier_id, order_date, expected_delivery_date, actual_delivery_date, status, total_cylinders_ordered, total_cylinders_received, total_amount, paid_amount, payment_status, created_at, suppliers (supplier_name)')
      .order('order_date', { ascending: false })
      .limit(2000);
    if (ordErr) throw new Error(ordErr.message);

    const pendingLike = (ordersAll || []).filter((o) => ['pending', 'in_transit'].includes(o.status));
    const inTransitCount = (ordersAll || []).filter((o) => o.status === 'in_transit').length;
    const upcomingDeliveries = pendingLike
      .slice()
      .sort((a, b) => String(a.expected_delivery_date || '').localeCompare(String(b.expected_delivery_date || '')))
      .slice(0, 10)
      .map((o) => ({
        ...o,
        supplier: o.suppliers || null
      }));

    const recentOrders = (ordersAll || []).slice(0, 5).map((o) => ({
      ...o,
      supplier: o.suppliers || null
    }));

    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    }

    const delivered = (ordersAll || []).filter((o) => ['delivered', 'partial'].includes(o.status));
    const monthlySpendMap = new Map();
    const monthlyCylinderMap = new Map();
    for (const o of delivered) {
      const k = monthKey(o.order_date);
      if (!k) continue;
      monthlySpendMap.set(k, (monthlySpendMap.get(k) || 0) + Number(o.total_amount || 0));
      monthlyCylinderMap.set(
        k,
        (monthlyCylinderMap.get(k) || 0) +
          Number(o.total_cylinders_received || o.total_cylinders_ordered || 0)
      );
    }
    const monthlySpend = months.map((m) => ({
      month: m,
      amount: Number(monthlySpendMap.get(m) || 0),
      cylinder_count: Number(monthlyCylinderMap.get(m) || 0)
    }));

    const supplierSpendMap = new Map();
    for (const o of delivered) {
      const sid = o.supplier_id || 'unknown';
      supplierSpendMap.set(sid, (supplierSpendMap.get(sid) || 0) + Number(o.total_amount || 0));
    }

    const supplierIds = Array.from(supplierSpendMap.keys()).filter((x) => x !== 'unknown');
    let suppliersMap = new Map();
    if (supplierIds.length) {
      const { data: suppliers } = await supabaseAdmin
        .from('suppliers')
        .select('id, supplier_name')
        .in('id', supplierIds);
      suppliersMap = new Map((suppliers || []).map((s) => [s.id, s]));
    }

    const supplierSpend = Array.from(supplierSpendMap.entries())
      .map(([supplier_id, amount]) => ({
        supplier_id,
        supplier_name:
          supplier_id === 'unknown' ? 'Unknown' : suppliersMap.get(supplier_id)?.supplier_name || 'Unknown',
        amount: Number(amount || 0)
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 12);

    const fullCount = (inventory || []).reduce((a, i) => a + Number(i.quantity_full || 0), 0);
    const stockValue = (inventory || []).reduce(
      (a, i) =>
        a + Number(i.unit_price || 0) * (Number(i.quantity_full || 0) + Number(i.quantity_in_use || 0)),
      0
    );

    const totalInvestment = (ordersAll || []).reduce((sum, o) => sum + Number(o.paid_amount || 0), 0);
    const totalUnpaid = (ordersAll || []).reduce((sum, o) => {
      const total = Number(o.total_amount || 0);
      const paid = Math.max(0, Number(o.paid_amount || 0));
      return sum + Math.max(0, total - paid);
    }, 0);

    const cylindersInUse = (inventory || []).reduce((a, i) => a + Number(i.quantity_in_use || 0), 0);
    const cylindersEmpty = (inventory || []).reduce((a, i) => a + Number(i.quantity_empty || 0), 0);
    const cylindersDamaged = (inventory || []).reduce((a, i) => a + Number(i.quantity_damaged || 0), 0);
    const cylindersTotal = fullCount + cylindersInUse + cylindersEmpty + cylindersDamaged;

    res.json({
      kpis: {
        total_stock_value: stockValue,
        cylinders_full: fullCount,
        pending_orders: pendingLike.length,
        low_stock_alerts: lowStock.length,
        in_transit_orders: inTransitCount,
        total_investment: totalInvestment,
        total_unpaid: totalUnpaid,
        cylinders_in_use: cylindersInUse,
        cylinders_empty: cylindersEmpty,
        cylinders_damaged: cylindersDamaged,
        cylinders_total: cylindersTotal
      },
      inventory: inventory || [],
      upcoming_deliveries: upcomingDeliveries,
      recent_orders: recentOrders,
      monthly_spend: monthlySpend,
      supplier_spend: supplierSpend
    });
  } catch (e) {
    next(e);
  }
});

router.get('/orders', async (req, res, next) => {
  try {
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(50, Math.max(5, Number(req.query.pageSize || 10)));
    const q = String(req.query.q || '').trim();
    const status = String(req.query.status || '').trim();
    const payment_status = String(req.query.payment_status || '').trim();
    const supplier_id = String(req.query.supplier_id || '').trim();
    const from = isoDate(req.query.from);
    const to = isoDate(req.query.to);

    let query = supabaseAdmin
      .from('stock_orders')
      .select(
        '*, suppliers (id, supplier_name, supplier_type), stock_order_items (*)',
        { count: 'exact' }
      )
      .order('order_date', { ascending: false });

    if (status) query = query.eq('status', status);
    if (payment_status) query = query.eq('payment_status', payment_status);
    if (supplier_id) query = query.eq('supplier_id', supplier_id);
    if (from) query = query.gte('order_date', from);
    if (to) query = query.lte('order_date', to);
    if (q) {
      const { data: matchedSuppliers } = await supabaseAdmin
        .from('suppliers')
        .select('id')
        .ilike('supplier_name', `%${q}%`)
        .limit(100);
      const supplierIds = (matchedSuppliers || []).map((row) => row.id).filter(Boolean);
      const parts = [
        `order_number.ilike.%${q}%`,
        `invoice_number.ilike.%${q}%`,
        `notes.ilike.%${q}%`
      ];
      if (supplierIds.length) parts.push(`supplier_id.in.(${supplierIds.join(',')})`);
      query = query.or(parts.join(','));
    }

    const fromIdx = (page - 1) * pageSize;
    const toIdx = fromIdx + pageSize - 1;
    const { data, error, count } = await query.range(fromIdx, toIdx);
    if (error) throw new Error(error.message);

    res.json({
      page,
      pageSize,
      total: Number(count || 0),
      orders: (data || []).map(mapOrderRow)
    });
  } catch (e) {
    next(e);
  }
});

router.post('/orders', async (req, res, next) => {
  try {
    const aiOptions = await resolveAiOptions(req);
    const body = req.body || {};
    const hospitalProfile = body.hospital_profile || {};
    const sendSupplierEmail = body.send_supplier_email !== false;
    const order = {
      order_number: String(body.order_number || '').trim() || buildGeneratedOrderNumber(),
      supplier_id: body.supplier_id || null,
      order_date: isoDate(body.order_date) || isoDate(new Date()),
      expected_delivery_date: isoDate(body.expected_delivery_date),
      status: String(body.status || 'pending'),
      invoice_number: String(body.invoice_number || '').trim() || buildGeneratedInvoiceNumber(),
      notes: String(body.notes || '').trim() || null,
      payment_status: 'unpaid',
      payment_method: body.payment_method || null,
      paid_amount: Math.max(0, Number(body.paid_amount || 0)),
      total_amount: 0,
      total_cylinders_ordered: 0,
      total_cylinders_received: 0
    };

    const items = Array.isArray(body.items) ? body.items : [];
    if (!order.order_date) return res.status(400).json({ error: 'Missing order_date' });
    if (!items.length) return res.status(400).json({ error: 'Missing items' });

    const calcItems = normalizeOrderItems(items);

    for (const it of calcItems) {
      if (!it.cylinder_size) return res.status(400).json({ error: 'Missing cylinder_size in items' });
      if (!Number.isFinite(it.quantity_ordered) || it.quantity_ordered <= 0) {
        return res.status(400).json({ error: 'Each item must include quantity_ordered > 0' });
      }
    }

    order.total_cylinders_ordered = calcItems.reduce((a, it) => a + Number(it.quantity_ordered || 0), 0);
    order.total_amount = calcItems.reduce((a, it) => a + Number(it.total_price || 0), 0);
    order.payment_status = derivePaymentStatus(order.total_amount, order.paid_amount, 'unpaid');

    const { data: created, error } = await supabaseAdmin.from('stock_orders').insert(order).select('*').single();
    if (error) throw new Error(error.message);

    const withOrder = calcItems.map((it) => ({ ...it, order_id: created.id }));
    const { error: itemsErr } = await insertStockOrderItems(withOrder);
    if (itemsErr) throw new Error(itemsErr.message);

    const out = await fetchOrderWithRelations(created.id);
    let emailStatus = { attempted: false, sent: false, reason: null };

    if (!sendSupplierEmail) {
      emailStatus.reason = 'email_disabled';
    } else if (out?.supplier?.email) {
      emailStatus.attempted = true;
      if (!isMailConfigured()) {
        emailStatus.reason = 'mail_not_configured';
      } else {
        try {
          const fallbackContent = {
            subject: 'Request Order',
            greeting: `Dear ${out.supplier.contact_person || out.supplier.supplier_name || 'Supplier Team'},`,
            intro: `We would like to place an oxygen cylinder order from ${hospitalProfile.hospital_name || 'our hospital'}. Please review the requested items below and arrange delivery by ${out.expected_delivery_date || 'the requested date'}.`,
            closing: 'Please confirm availability, pricing, and dispatch timeline at your earliest convenience.'
          };
          const aiRaw = await generateSupplierOrderEmail(
            {
              hospital: hospitalProfile,
              supplier: {
                supplier_name: out.supplier.supplier_name,
                contact_person: out.supplier.contact_person,
                email: out.supplier.email
              },
              order: {
                order_number: out.order_number,
                invoice_number: out.invoice_number,
                expected_delivery_date: out.expected_delivery_date,
                items: (out.items || []).map((item) => ({
                  cylinder_size: item.cylinder_size,
                  gas_type: item.gas_type,
                  quantity_ordered: item.quantity_ordered
                }))
              }
            },
            aiOptions
          );
          const mailContent = parseAiEmailJson(aiRaw, fallbackContent);
          await sendMail({
            to: out.supplier.email,
            subject: 'Request Order',
            html: buildOrderMailHtml({ mailContent, order: out, supplier: out.supplier, hospitalProfile }),
            text: buildOrderMailText({ mailContent, order: out, supplier: out.supplier, hospitalProfile }),
            replyTo: hospitalProfile?.email || undefined
          });
          emailStatus.sent = true;
        } catch (mailError) {
          emailStatus.reason = String(mailError?.message || mailError);
        }
      }
    } else {
      emailStatus.reason = 'supplier_email_missing';
    }

    res.status(201).json({ order: out, email: emailStatus });
  } catch (e) {
    next(e);
  }
});

router.get('/orders/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { data, error } = await supabaseAdmin
      .from('stock_orders')
      .select('*, suppliers (id, supplier_name, supplier_type), stock_order_items (*)')
      .eq('id', id)
      .single();
    if (error) throw new Error(error.message);
    res.json({ order: mapOrderRow(data) });
  } catch (e) {
    next(e);
  }
});

router.patch('/orders/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const existing = await fetchOrderWithRelations(id);
    const allowed = [
      'supplier_id',
      'order_date',
      'expected_delivery_date',
      'actual_delivery_date',
      'status',
      'payment_status',
      'payment_method',
      'invoice_number',
      'invoice_url',
      'notes',
      'received_by',
      'total_amount',
      'paid_amount'
    ];
    const patch = {};
    for (const k of allowed) {
      if (!(k in body)) continue;
      if (k.endsWith('_date')) patch[k] = isoDate(body[k]);
      else patch[k] = body[k];
    }

    if (Array.isArray(body.items)) {
      if (['delivered', 'partial'].includes(existing.status)) {
        return res.status(400).json({ error: 'Delivered orders cannot have items edited' });
      }

      const nextItems = normalizeOrderItems(body.items);
      if (!nextItems.length) return res.status(400).json({ error: 'Missing items' });

      for (const it of nextItems) {
        if (!it.cylinder_size) return res.status(400).json({ error: 'Missing cylinder_size in items' });
        if (!Number.isFinite(it.quantity_ordered) || it.quantity_ordered <= 0) {
          return res.status(400).json({ error: 'Each item must include quantity_ordered > 0' });
        }
      }

      patch.total_cylinders_ordered = nextItems.reduce(
        (sum, item) => sum + Number(item.quantity_ordered || 0),
        0
      );
      patch.total_amount = nextItems.reduce((sum, item) => sum + Number(item.total_price || 0), 0);

      const { error: deleteErr } = await supabaseAdmin
        .from('stock_order_items')
        .delete()
        .eq('order_id', id);
      if (deleteErr) throw new Error(deleteErr.message);

      const insertRows = nextItems.map((item) => ({ ...item, order_id: id }));
      const { error: itemErr } = await insertStockOrderItems(insertRows);
      if (itemErr) throw new Error(itemErr.message);
    }

    if ('paid_amount' in patch || 'total_amount' in patch) {
      const nextTotal = 'total_amount' in patch ? Number(patch.total_amount || 0) : Number(existing.total_amount || 0);
      const nextPaid = 'paid_amount' in patch ? Number(patch.paid_amount || 0) : Number(existing.paid_amount || 0);
      patch.paid_amount = Math.max(0, nextPaid);
      patch.payment_status = derivePaymentStatus(nextTotal, nextPaid, existing.payment_status || 'unpaid');
    }

    if (Object.keys(patch).length) {
      const { error } = await supabaseAdmin.from('stock_orders').update(patch).eq('id', id);
      if (error) throw new Error(error.message);
    }

    const data = await fetchOrderWithRelations(id);
    res.json({ order: data });
  } catch (e) {
    next(e);
  }
});

router.patch('/orders/:id/deliver', async (req, res, next) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const actual_delivery_date = isoDate(body.actual_delivery_date) || isoDate(new Date());
    const received_by = String(body.received_by || '').trim() || null;
    const items = Array.isArray(body.items) ? body.items : [];
    if (!items.length) return res.status(400).json({ error: 'Missing items' });

    const { data: order, error: ordErr } = await supabaseAdmin
      .from('stock_orders')
      .select('*, stock_order_items (*)')
      .eq('id', id)
      .single();
    if (ordErr) throw new Error(ordErr.message);

    const existingItems = order.stock_order_items || [];
    const existingMap = new Map(existingItems.map((it) => [String(it.id), it]));

    let touched = 0;
    for (const input of items) {
      const ex = existingMap.get(String(input.id));
      if (!ex) continue;
      const quantity_received = Math.max(
        0,
        Number(input.quantity_received ?? ex.quantity_received ?? 0)
      );
      const condition = String(input.condition || ex.condition || 'good');
      const stock_mode =
        String(input.stock_mode || ex.stock_mode || 'replace_cylinder') === 'new_cylinders'
          ? 'new_cylinders'
          : 'replace_cylinder';
      const previousQuantity = Math.max(0, Number(ex.quantity_received || 0));
      const previousCondition = String(ex.condition || 'good');
      const previousMode =
        String(ex.stock_mode || 'replace_cylinder') === 'new_cylinders'
          ? 'new_cylinders'
          : 'replace_cylinder';
      const deltaReceived = quantity_received - previousQuantity;

      if (deltaReceived === 0 && condition === previousCondition && stock_mode === previousMode) continue;
      touched += 1;

      const { error: upErr } = await updateStockOrderItemById(ex.id, {
        quantity_received,
        condition,
        stock_mode
      });
      if (upErr) throw new Error(upErr.message);

      const previousDelta =
        previousCondition === 'damaged'
          ? {
              quantity_full: 0,
              quantity_empty: previousMode === 'replace_cylinder' ? previousQuantity : 0,
              quantity_damaged: -previousQuantity
            }
          : {
              quantity_full: -previousQuantity,
              quantity_empty: previousMode === 'replace_cylinder' ? previousQuantity : 0,
              quantity_damaged: 0
            };
      const nextDelta =
        condition === 'damaged'
          ? {
              quantity_full: 0,
              quantity_empty: stock_mode === 'replace_cylinder' ? -quantity_received : 0,
              quantity_damaged: quantity_received
            }
          : {
              quantity_full: quantity_received,
              quantity_empty: stock_mode === 'replace_cylinder' ? -quantity_received : 0,
              quantity_damaged: 0
            };

      await updateInventoryBuckets(
        { cylinder_size: ex.cylinder_size, gas_type: ex.gas_type || 'oxygen' },
        {
          quantity_full:
            Number(previousDelta.quantity_full || 0) + Number(nextDelta.quantity_full || 0),
          quantity_empty:
            Number(previousDelta.quantity_empty || 0) + Number(nextDelta.quantity_empty || 0),
          quantity_damaged:
            Number(previousDelta.quantity_damaged || 0) + Number(nextDelta.quantity_damaged || 0)
        },
        { unit_price: ex.unit_price }
      );

      if (deltaReceived > 0) {
        await supabaseAdmin.from('stock_transactions').insert({
          transaction_type: 'received',
          cylinder_size: ex.cylinder_size,
          gas_type: ex.gas_type || 'oxygen',
          quantity: deltaReceived,
          reference_id: order.order_number,
          reference_type: 'order',
          performed_by: received_by || req.user?.email || null,
          notes: [
            `Stock mode: ${stock_mode}`,
            condition && condition !== 'good' ? `Condition: ${condition}` : null
          ]
            .filter(Boolean)
            .join(' | ')
        });
      }
    }

    if (!touched) return res.status(400).json({ error: 'No delivery changes were provided' });

    const { data: finalItems, error: finalErr } = await supabaseAdmin
      .from('stock_order_items')
      .select('*')
      .eq('order_id', id);
    if (finalErr) throw new Error(finalErr.message);

    const totalOrdered = (finalItems || []).reduce((a, it) => a + Number(it.quantity_ordered || 0), 0);
    const totalReceived = (finalItems || []).reduce((a, it) => a + Number(it.quantity_received || 0), 0);
    const isFull = totalOrdered > 0 && totalReceived >= totalOrdered;
    const status = isFull ? 'delivered' : 'partial';

    const { data: updatedOrder, error: updErr } = await supabaseAdmin
      .from('stock_orders')
      .update({
        status,
        actual_delivery_date,
        received_by,
        total_cylinders_received: totalReceived
      })
      .eq('id', id)
      .select('*')
      .single();
    if (updErr) throw new Error(updErr.message);

    res.json({ ok: true, order: updatedOrder });
  } catch (e) {
    next(e);
  }
});

router.delete('/orders/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const order = await fetchOrderWithRelations(id);

    if (['delivered', 'partial'].includes(order.status)) {
      for (const item of order.items || []) {
        const receivedQty = Math.max(0, Number(item.quantity_received || 0));
        if (!receivedQty) continue;

        const delta =
          String(item.condition || 'good') === 'damaged'
            ? {
                quantity_damaged: -receivedQty,
                quantity_empty:
                  String(item.stock_mode || 'replace_cylinder') === 'replace_cylinder'
                    ? receivedQty
                    : 0
              }
            : {
                quantity_full: -receivedQty,
                quantity_empty:
                  String(item.stock_mode || 'replace_cylinder') === 'replace_cylinder'
                    ? receivedQty
                    : 0
              };

        await updateInventoryBuckets(
          { cylinder_size: item.cylinder_size, gas_type: item.gas_type || 'oxygen' },
          delta,
          { unit_price: item.unit_price }
        );
      }

      await supabaseAdmin
        .from('stock_transactions')
        .delete()
        .eq('reference_id', order.order_number)
        .eq('reference_type', 'order');
    }

    const { error } = await supabaseAdmin.from('stock_orders').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/suppliers', async (_req, res, next) => {
  try {
    const { data: suppliers, error } = await supabaseAdmin
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) throw new Error(error.message);

    const { data: orders } = await supabaseAdmin
      .from('stock_orders')
      .select(
        'supplier_id, total_amount, total_cylinders_ordered, total_cylinders_received, order_date, expected_delivery_date, actual_delivery_date, status'
      )
      .limit(5000);

    const stats = new Map();
    for (const o of orders || []) {
      if (!o.supplier_id) continue;
      if (!stats.has(o.supplier_id)) {
        stats.set(o.supplier_id, {
          total_orders: 0,
          total_spend: 0,
          last_order_date: null,
          total_cylinders_delivered: 0,
          on_time_total: 0,
          on_time_hits: 0,
          delivered_order_count: 0
        });
      }
      const s = stats.get(o.supplier_id);
      s.total_orders += 1;
      if (['delivered', 'partial'].includes(o.status)) {
        s.total_spend += Number(o.total_amount || 0);
        s.total_cylinders_delivered += Number(
          o.total_cylinders_received || o.total_cylinders_ordered || 0
        );
        s.delivered_order_count += 1;
      }
      if (o.expected_delivery_date && o.actual_delivery_date && ['delivered', 'partial'].includes(o.status)) {
        s.on_time_total += 1;
        if (String(o.actual_delivery_date) <= String(o.expected_delivery_date)) s.on_time_hits += 1;
      }
      if (!s.last_order_date || String(o.order_date) > String(s.last_order_date)) s.last_order_date = o.order_date;
    }

    res.json({
      suppliers: (suppliers || []).map((s) => ({
        ...s,
        stats: (() => {
          const base = stats.get(s.id) || {
            total_orders: 0,
            total_spend: 0,
            last_order_date: null,
            total_cylinders_delivered: 0,
            on_time_total: 0,
            on_time_hits: 0,
            delivered_order_count: 0
          };
          return {
            total_orders: base.total_orders,
            total_spend: base.total_spend,
            last_order_date: base.last_order_date,
            total_cylinders_delivered: base.total_cylinders_delivered,
            on_time_delivery_pct:
              base.on_time_total > 0 ? (base.on_time_hits / base.on_time_total) * 100 : 0,
            average_price_per_cylinder:
              base.total_cylinders_delivered > 0
                ? base.total_spend / base.total_cylinders_delivered
                : 0
          };
        })()
      }))
    });
  } catch (e) {
    next(e);
  }
});

router.post('/suppliers', async (req, res, next) => {
  try {
    const body = req.body || {};
    const payload = {
      supplier_name: String(body.supplier_name || '').trim(),
      contact_person: body.contact_person || null,
      phone: body.phone || null,
      email: body.email || null,
      address: body.address || null,
      city: body.city || null,
      gstin: body.gstin || null,
      supplier_type: body.supplier_type || 'dealer',
      is_active: body.is_active != null ? Boolean(body.is_active) : true,
      rating: body.rating != null ? Number(body.rating || 0) : 0,
      notes: body.notes || null
    };
    if (!payload.supplier_name) return res.status(400).json({ error: 'Missing supplier_name' });

    const { data, error } = await supabaseAdmin.from('suppliers').insert(payload).select('*').single();
    if (error) throw new Error(error.message);
    res.status(201).json({ supplier: data });
  } catch (e) {
    next(e);
  }
});

router.patch('/suppliers/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const allowed = [
      'supplier_name',
      'contact_person',
      'phone',
      'email',
      'address',
      'city',
      'gstin',
      'supplier_type',
      'is_active',
      'rating',
      'notes'
    ];
    const patch = {};
    for (const k of allowed) {
      if (k in (req.body || {})) patch[k] = req.body[k];
    }
    const { data, error } = await supabaseAdmin.from('suppliers').update(patch).eq('id', id).select('*').single();
    if (error) throw new Error(error.message);
    res.json({ supplier: data });
  } catch (e) {
    next(e);
  }
});

router.delete('/suppliers/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const { error } = await supabaseAdmin.from('suppliers').delete().eq('id', id);
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

router.get('/inventory', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('stock_inventory')
      .select('*')
      .order('cylinder_size', { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);

    const inventory = data || [];
    const { data: orderItems } = await supabaseAdmin
      .from('stock_order_items')
      .select('cylinder_size, gas_type, unit_price, order_id, stock_orders!inner(order_date, supplier_id, status), stock_orders!inner(suppliers!inner(supplier_name))')
      .order('order_id', { ascending: false })
      .limit(5000);

    const latestSupplierByKey = new Map();
    for (const item of orderItems || []) {
      const order = Array.isArray(item.stock_orders) ? item.stock_orders[0] : item.stock_orders;
      if (!order || !['partial', 'delivered', 'pending', 'in_transit'].includes(order.status)) continue;
      const supplier = Array.isArray(order.suppliers) ? order.suppliers[0] : order.suppliers;
      const key = `${item.cylinder_size}::${item.gas_type || 'oxygen'}`;
      if (latestSupplierByKey.has(key)) continue;
      latestSupplierByKey.set(key, {
        supplier_id: order.supplier_id || null,
        supplier_name: supplier?.supplier_name || null,
        latest_order_date: order.order_date || null,
        latest_unit_price: item.unit_price != null ? Number(item.unit_price) : null
      });
    }

    res.json({
      inventory: inventory.map((row) => {
        const key = `${row.cylinder_size}::${row.gas_type || 'oxygen'}`;
        const supplierMeta = latestSupplierByKey.get(key) || {};
        return {
          ...row,
          supplier_id: supplierMeta.supplier_id || null,
          supplier_name: supplierMeta.supplier_name || null,
          latest_order_date: supplierMeta.latest_order_date || null,
          latest_unit_price:
            supplierMeta.latest_unit_price != null ? supplierMeta.latest_unit_price : Number(row.unit_price || 0)
        };
      })
    });
  } catch (e) {
    next(e);
  }
});

router.post('/inventory/adjust', async (req, res, next) => {
  try {
    const body = req.body || {};
    const cylinder_size = String(body.cylinder_size || '').trim();
    const gas_type = String(body.gas_type || 'oxygen').trim();
    const bucket = String(body.bucket || 'full');
    const mode = String(body.mode || 'add');
    const quantity = Math.max(0, Number(body.quantity || 0));
    const performed_by = String(body.performed_by || '').trim() || req.user?.email || null;
    const notes = String(body.notes || '').trim() || null;

    if (!cylinder_size) return res.status(400).json({ error: 'Missing cylinder_size' });
    if (!['full', 'in_use', 'empty', 'damaged'].includes(bucket))
      return res.status(400).json({ error: 'Invalid bucket' });
    if (!['add', 'subtract', 'set'].includes(mode)) return res.status(400).json({ error: 'Invalid mode' });

    const row = await getInventoryRow(cylinder_size, gas_type);
    const current = {
      full: Number(row.quantity_full || 0),
      empty: Number(row.quantity_empty || 0),
      in_use: Number(row.quantity_in_use || 0),
      damaged: Number(row.quantity_damaged || 0)
    };

    const keyMap = {
      full: 'quantity_full',
      empty: 'quantity_empty',
      in_use: 'quantity_in_use',
      damaged: 'quantity_damaged'
    };

    const nextVal =
      mode === 'set'
        ? quantity
        : mode === 'subtract'
          ? Math.max(0, current[bucket] - quantity)
          : current[bucket] + quantity;

    const patch = {
      [keyMap[bucket]]: nextVal,
      last_updated: new Date().toISOString()
    };

    const { data: updated, error } = await supabaseAdmin
      .from('stock_inventory')
      .update(patch)
      .eq('id', row.id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from('stock_transactions').insert({
      transaction_type: 'adjusted',
      cylinder_size,
      gas_type,
      quantity,
      reference_id: bucket,
      reference_type: 'manual',
      performed_by,
      notes: notes || `${mode} ${quantity} (${bucket})`
    });

    res.json({ inventory: updated });
  } catch (e) {
    next(e);
  }
});

router.patch('/inventory/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const patch = {};
    if ('reorder_level' in (req.body || {})) patch.reorder_level = Math.max(0, Number(req.body.reorder_level || 0));
    if ('unit_price' in (req.body || {})) patch.unit_price = Math.max(0, Number(req.body.unit_price || 0));
    if (!Object.keys(patch).length) return res.status(400).json({ error: 'No inventory fields to update' });

    const { data, error } = await supabaseAdmin
      .from('stock_inventory')
      .update({
        ...patch,
        last_updated: new Date().toISOString()
      })
      .eq('id', id)
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    const refreshed = await updateInventoryBuckets(
      { cylinder_size: data.cylinder_size, gas_type: data.gas_type || 'oxygen' },
      {},
      { unit_price: data.unit_price }
    );

    res.json({ inventory: refreshed });
  } catch (e) {
    next(e);
  }
});

router.post('/inventory/issue', async (req, res, next) => {
  try {
    const body = req.body || {};
    const cylinder_size = String(body.cylinder_size || '').trim();
    const gas_type = String(body.gas_type || 'oxygen').trim();
    const ward = String(body.ward || '').trim();
    const quantity = Math.max(1, Number(body.quantity || 0));
    const assignment_mode = String(body.assignment_mode || 'not_in_use').trim() || 'not_in_use';
    const cylinder_id = body.cylinder_id ? String(body.cylinder_id).trim() : null;
    const performed_by = String(body.performed_by || '').trim() || req.user?.email || null;
    const notes = String(body.notes || '').trim() || null;
    if (!cylinder_size || !ward) return res.status(400).json({ error: 'Missing cylinder_size/ward' });
    if (!['not_in_use', 'map_device', 'replace_device'].includes(assignment_mode)) {
      return res.status(400).json({ error: 'Invalid assignment_mode' });
    }

    const row = await getInventoryRow(cylinder_size, gas_type);
    if (Number(row.quantity_full || 0) < quantity) {
      return res.status(400).json({ error: 'Not enough full cylinders in stock' });
    }

    const updated = await updateInventoryBuckets(
      { cylinder_size, gas_type },
      { quantity_full: -quantity, quantity_in_use: quantity }
    );

    await supabaseAdmin.from('stock_transactions').insert({
      transaction_type: 'issued',
      cylinder_size,
      gas_type,
      quantity,
      reference_id: ward,
      reference_type: 'ward_issue',
      ward,
      performed_by,
      notes: [notes, cylinder_id ? `Cylinder ID: ${cylinder_id}` : null, `Usage mode: ${assignment_mode}`]
        .filter(Boolean)
        .join(' | ')
    });

    res.json({ ok: true, inventory: updated });
  } catch (e) {
    next(e);
  }
});

router.post('/inventory/return', async (req, res, next) => {
  try {
    const body = req.body || {};
    const cylinder_size = String(body.cylinder_size || '').trim();
    const gas_type = String(body.gas_type || 'oxygen').trim();
    const ward = String(body.ward || '').trim();
    const quantity = Math.max(1, Number(body.quantity || 0));
    const condition = String(body.condition || 'good');
    const performed_by = String(body.performed_by || '').trim() || req.user?.email || null;
    if (!cylinder_size || !ward) return res.status(400).json({ error: 'Missing cylinder_size/ward' });

    const row = await getInventoryRow(cylinder_size, gas_type);
    if (Number(row.quantity_in_use || 0) < quantity) {
      return res.status(400).json({ error: 'Return quantity exceeds cylinders currently in use' });
    }

    const delta =
      condition === 'damaged'
        ? { quantity_in_use: -quantity, quantity_damaged: quantity }
        : { quantity_in_use: -quantity, quantity_empty: quantity };

    const updated = await updateInventoryBuckets({ cylinder_size, gas_type }, delta);

    await supabaseAdmin.from('stock_transactions').insert({
      transaction_type: condition === 'damaged' ? 'damaged' : 'returned',
      cylinder_size,
      gas_type,
      quantity,
      reference_id: ward,
      reference_type: 'return',
      ward,
      performed_by,
      notes: condition && condition !== 'good' ? `Condition: ${condition}` : null
    });

    res.json({ ok: true, inventory: updated });
  } catch (e) {
    next(e);
  }
});

router.get('/transactions', async (req, res, next) => {
  try {
    const limit = Math.min(5000, Math.max(50, Number(req.query.limit || 500)));
    const type = String(req.query.type || '').trim();
    const cylinder_size = String(req.query.cylinder_size || '').trim();
    const ward = String(req.query.ward || '').trim();
    const performed_by = String(req.query.performed_by || '').trim();
    const parseIso = (v) => {
      if (!v) return null;
      const d = new Date(String(v));
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString();
    };
    const from = parseIso(req.query.from);
    const to = parseIso(req.query.to);

    let query = supabaseAdmin.from('stock_transactions').select('*').order('created_at', { ascending: false }).limit(limit);
    if (type) query = query.eq('transaction_type', type);
    if (cylinder_size) query = query.eq('cylinder_size', cylinder_size);
    if (ward) query = query.eq('ward', ward);
    if (performed_by) query = query.ilike('performed_by', `%${performed_by}%`);
    if (from) query = query.gte('created_at', from);
    if (to) query = query.lte('created_at', to);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    res.json({ transactions: data || [] });
  } catch (e) {
    next(e);
  }
});

router.get('/export/orders', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('stock_orders')
      .select('order_number, order_date, status, total_cylinders_ordered, total_cylinders_received, total_amount, payment_status, invoice_number, received_by')
      .order('order_date', { ascending: false })
      .limit(5000);
    if (error) throw new Error(error.message);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(
      toCsv(data || [], [
        'order_number',
        'order_date',
        'status',
        'total_cylinders_ordered',
        'total_cylinders_received',
        'total_amount',
        'payment_status',
        'invoice_number',
        'received_by'
      ])
    );
  } catch (e) {
    next(e);
  }
});

router.get('/export/transactions', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('stock_transactions')
      .select('created_at, transaction_type, cylinder_size, gas_type, quantity, reference_id, reference_type, ward, performed_by, notes')
      .order('created_at', { ascending: false })
      .limit(10000);
    if (error) throw new Error(error.message);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(
      toCsv(data || [], [
        'created_at',
        'transaction_type',
        'cylinder_size',
        'gas_type',
        'quantity',
        'reference_id',
        'reference_type',
        'ward',
        'performed_by',
        'notes'
      ])
    );
  } catch (e) {
    next(e);
  }
});

router.get('/export/inventory', async (_req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('stock_inventory')
      .select('cylinder_size, gas_type, quantity_full, quantity_in_use, quantity_empty, quantity_damaged, reorder_level, unit_price, last_updated')
      .order('cylinder_size', { ascending: true })
      .limit(5000);
    if (error) throw new Error(error.message);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.send(
      toCsv(data || [], [
        'cylinder_size',
        'gas_type',
        'quantity_full',
        'quantity_in_use',
        'quantity_empty',
        'quantity_damaged',
        'reorder_level',
        'unit_price',
        'last_updated'
      ])
    );
  } catch (e) {
    next(e);
  }
});

router.post('/ai-analysis', async (req, res, next) => {
  try {
    const aiOptions = await resolveAiOptions(req);
    const { data: inventory } = await supabaseAdmin.from('stock_inventory').select('*').limit(5000);
    const { data: orders } = await supabaseAdmin
      .from('stock_orders')
      .select('order_number, supplier_id, order_date, expected_delivery_date, actual_delivery_date, status, total_amount, payment_status, suppliers (supplier_name)')
      .order('order_date', { ascending: false })
      .limit(200);
    const { data: suppliers } = await supabaseAdmin.from('suppliers').select('*').limit(2000);

    const stockData = {
      now: new Date().toISOString(),
      inventory: inventory || [],
      orders: (orders || []).map((o) => ({ ...o, supplier: o.suppliers || null })),
      suppliers: suppliers || []
    };

    const markdown = await analyzeStock(stockData, aiOptions);
    res.json({ markdown, generated_at: new Date().toISOString() });
  } catch (e) {
    next(e);
  }
});

export default router;
