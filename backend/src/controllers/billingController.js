const db = require('../config/db');

const BILLING_TYPES = ['MonthlyMaintenance', 'QuarterlyMaintenance', 'YearlyMaintenance', 'OneTimeCharge', 'Penalty', 'Fine'];
const BILLING_FREQUENCIES = ['Monthly', 'Quarterly', 'Yearly', 'OneTime'];
const CALCULATION_METHODS = ['Equal', 'AreaBased', 'Custom', 'FlatType'];
const LATE_FEE_TYPES = ['None', 'FlatPerDay', 'FlatOnce', 'PercentOnce'];
const ADJUSTMENT_TYPES = ['Discount', 'Waiver', 'Credit'];
const ACTIVE_DUE_STATUSES = ['Unpaid', 'Overdue', 'PartiallyPaid'];
const DEFAULT_FLAT_TYPES = ['Studio', '1BHK', '2BHK', '3BHK', '4BHK', 'Villa', 'Other'];

const toNumber = (value) => Number(value || 0);

const formatDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
};

const formatDateTime = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
};

const normalizeOptionalString = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const normalizeJson = (value, fallback = []) => {
    if (!value) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }
    return value;
};

const buildInvoiceNumber = ({ monthYear, flatId, invoiceId }) => {
    const compactMonth = String(monthYear || '').replace(/[^0-9]/g, '').slice(0, 6) || new Date().toISOString().slice(0, 7).replace('-', '');
    return `INV-${compactMonth}-${String(flatId).padStart(4, '0')}-${String(invoiceId).padStart(5, '0')}`;
};

const normalizeBreakdown = (items) => {
    if (!Array.isArray(items)) return [];

    return items
        .map((item, index) => {
            const label = String(item?.label || '').trim();
            const amount = toNumber(item?.amount);
            const calculation = item?.calculation === 'per_sqft' ? 'per_sqft' : 'fixed';

            if (!label || amount <= 0) {
                return null;
            }

            return { label, amount, calculation, sort_order: index + 1 };
        })
        .filter(Boolean);
};

const normalizeFlatTypeAmounts = (value) => {
    const raw = normalizeJson(value, {});
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};

    return Object.entries(raw).reduce((acc, [flatType, amount]) => {
        const normalizedType = String(flatType || '').trim();
        const normalizedAmount = toNumber(amount);
        if (normalizedType && normalizedAmount > 0) {
            acc[normalizedType] = normalizedAmount;
        }
        return acc;
    }, {});
};

const calculateLateFee = ({ subtotalAmount, lateFeeType, lateFeeValue, dueDate, totalAmountBeforeLateFee }) => {
    if (!dueDate || lateFeeType === 'None' || toNumber(lateFeeValue) <= 0) {
        return { overdueDays: 0, penaltyAmount: 0 };
    }

    const due = new Date(`${formatDate(dueDate)}T00:00:00`);
    const today = new Date();
    const todayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    if (Number.isNaN(due.getTime()) || todayStart <= due) {
        return { overdueDays: 0, penaltyAmount: 0 };
    }

    const overdueDays = Math.floor((todayStart.getTime() - due.getTime()) / (24 * 60 * 60 * 1000));
    const lateValue = toNumber(lateFeeValue);

    if (lateFeeType === 'FlatPerDay') {
        return { overdueDays, penaltyAmount: overdueDays * lateValue };
    }
    if (lateFeeType === 'FlatOnce') {
        return { overdueDays, penaltyAmount: lateValue };
    }
    if (lateFeeType === 'PercentOnce') {
        return {
            overdueDays,
            penaltyAmount: Number(((toNumber(totalAmountBeforeLateFee || subtotalAmount) * lateValue) / 100).toFixed(2)),
        };
    }

    return { overdueDays: 0, penaltyAmount: 0 };
};

const computeInvoiceSnapshot = (invoice) => {
    const subtotalAmount = toNumber(invoice.subtotal_amount || invoice.amount);
    const paidAmount = toNumber(invoice.payment_total ?? invoice.paid_amount);
    const adjustmentAmount = toNumber(invoice.adjustment_total ?? invoice.adjustment_amount);
    const totalBeforeLateFee = Math.max(0, subtotalAmount - adjustmentAmount);
    const { overdueDays, penaltyAmount } = calculateLateFee({
        subtotalAmount,
        lateFeeType: invoice.late_fee_type || 'None',
        lateFeeValue: invoice.late_fee_value,
        dueDate: invoice.due_date,
        totalAmountBeforeLateFee: totalBeforeLateFee,
    });

    const totalAmount = Math.max(0, Number((subtotalAmount + penaltyAmount - adjustmentAmount).toFixed(2)));
    const balanceAmount = Math.max(0, Number((totalAmount - paidAmount).toFixed(2)));

    let status = 'Unpaid';
    if (balanceAmount <= 0 && paidAmount > 0) status = 'Paid';
    else if (balanceAmount <= 0 && adjustmentAmount >= subtotalAmount + penaltyAmount) status = 'Waived';
    else if (paidAmount > 0) status = 'PartiallyPaid';
    else if (overdueDays > 0) status = 'Overdue';

    return {
        subtotalAmount,
        adjustmentAmount,
        penaltyAmount,
        paidAmount,
        totalAmount,
        balanceAmount,
        overdueDays,
        status,
    };
};

const syncInvoiceFinancials = async (invoiceRows) => {
    for (const row of invoiceRows) {
        const snapshot = computeInvoiceSnapshot(row);
        const nextInvoiceNumber = row.invoice_number || buildInvoiceNumber({
            monthYear: row.month_year,
            flatId: row.flat_id,
            invoiceId: row.id,
        });

        if (
            row.invoice_number !== nextInvoiceNumber ||
            row.status !== snapshot.status ||
            toNumber(row.penalty_amount) !== snapshot.penaltyAmount ||
            toNumber(row.adjustment_amount) !== snapshot.adjustmentAmount ||
            toNumber(row.paid_amount) !== snapshot.paidAmount ||
            toNumber(row.total_amount) !== snapshot.totalAmount ||
            toNumber(row.balance_amount) !== snapshot.balanceAmount ||
            toNumber(row.amount) !== snapshot.totalAmount
        ) {
            await db.query(
                `UPDATE invoices
                 SET invoice_number = ?, status = ?, penalty_amount = ?, adjustment_amount = ?, paid_amount = ?,
                     total_amount = ?, balance_amount = ?, amount = ?,
                     paid_at = CASE WHEN ? = 'Paid' THEN COALESCE(paid_at, NOW()) ELSE paid_at END
                 WHERE id = ?`,
                [
                    nextInvoiceNumber,
                    snapshot.status,
                    snapshot.penaltyAmount,
                    snapshot.adjustmentAmount,
                    snapshot.paidAmount,
                    snapshot.totalAmount,
                    snapshot.balanceAmount,
                    snapshot.totalAmount,
                    snapshot.status,
                    row.id,
                ]
            );
        }

        Object.assign(row, {
            invoice_number: nextInvoiceNumber,
            status: snapshot.status,
            penalty_amount: snapshot.penaltyAmount,
            adjustment_amount: snapshot.adjustmentAmount,
            paid_amount: snapshot.paidAmount,
            total_amount: snapshot.totalAmount,
            balance_amount: snapshot.balanceAmount,
            amount: snapshot.totalAmount,
            overdue_days: snapshot.overdueDays,
            is_overdue: snapshot.overdueDays > 0 && snapshot.balanceAmount > 0,
        });
    }

    return invoiceRows;
};

const fetchInvoiceRows = async ({ societyId, role, userId, filters = {}, invoiceId = null }) => {
    const whereClauses = ['i.society_id = ?'];
    const params = [societyId];

    if (role === 'RESIDENT') {
        whereClauses.push('uf.user_id = ?');
        params.push(userId);
    }
    if (invoiceId) {
        whereClauses.push('i.id = ?');
        params.push(invoiceId);
    }
    if (filters.status) {
        whereClauses.push('i.status = ?');
        params.push(filters.status);
    }
    if (filters.month_year) {
        whereClauses.push('i.month_year = ?');
        params.push(filters.month_year);
    }
    if (filters.flat_id) {
        whereClauses.push('i.flat_id = ?');
        params.push(Number(filters.flat_id));
    }

    const [rows] = await db.query(
        `SELECT
            i.*,
            f.block_name,
            f.flat_number,
            f.flat_type,
            f.area_sqft,
            f.billing_custom_amount,
            bc.title AS config_title,
            COALESCE(payments.payment_total, 0) AS payment_total,
            COALESCE(adjustments.adjustment_total, 0) AS adjustment_total
         FROM invoices i
         INNER JOIN flats f ON f.id = i.flat_id
         ${role === 'RESIDENT' ? 'INNER JOIN user_flats uf ON uf.flat_id = f.id' : 'LEFT JOIN user_flats uf ON uf.flat_id = f.id'}
         LEFT JOIN billing_configs bc ON bc.id = i.billing_config_id
         LEFT JOIN (
            SELECT invoice_id, SUM(CASE WHEN status = 'Completed' THEN amount ELSE 0 END) AS payment_total
            FROM invoice_payments GROUP BY invoice_id
         ) payments ON payments.invoice_id = i.id
         LEFT JOIN (
            SELECT invoice_id, SUM(amount) AS adjustment_total
            FROM invoice_adjustments GROUP BY invoice_id
         ) adjustments ON adjustments.invoice_id = i.id
         WHERE ${whereClauses.join(' AND ')}
         GROUP BY i.id
         ORDER BY i.month_year DESC, i.id DESC`,
        params
    );

    return syncInvoiceFinancials(rows);
};

const hydrateInvoices = async (invoiceRows) => {
    if (!invoiceRows.length) return [];

    const invoiceIds = invoiceRows.map((row) => row.id);
    const placeholders = invoiceIds.map(() => '?').join(', ');

    const [[lineItems], [payments], [adjustments]] = await Promise.all([
        db.query(`SELECT id, invoice_id, label, amount, calculation_mode, sort_order FROM invoice_line_items WHERE invoice_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`, invoiceIds),
        db.query(`SELECT id, invoice_id, amount, payment_method, payment_gateway, payment_reference, status, paid_at, notes FROM invoice_payments WHERE invoice_id IN (${placeholders}) ORDER BY paid_at DESC, id DESC`, invoiceIds),
        db.query(`SELECT id, invoice_id, adjustment_type, amount, reason, created_at FROM invoice_adjustments WHERE invoice_id IN (${placeholders}) ORDER BY created_at DESC, id DESC`, invoiceIds),
    ]);

    const itemMap = new Map();
    lineItems.forEach((item) => {
        const current = itemMap.get(item.invoice_id) || [];
        current.push({ id: item.id, label: item.label, amount: toNumber(item.amount), calculation_mode: item.calculation_mode, sort_order: item.sort_order });
        itemMap.set(item.invoice_id, current);
    });

    const paymentMap = new Map();
    payments.forEach((payment) => {
        const current = paymentMap.get(payment.invoice_id) || [];
        current.push({
            id: payment.id,
            amount: toNumber(payment.amount),
            payment_method: payment.payment_method || '',
            payment_gateway: payment.payment_gateway || '',
            payment_reference: payment.payment_reference || '',
            status: payment.status,
            paid_at: formatDateTime(payment.paid_at),
            notes: payment.notes || '',
        });
        paymentMap.set(payment.invoice_id, current);
    });

    const adjustmentMap = new Map();
    adjustments.forEach((adjustment) => {
        const current = adjustmentMap.get(adjustment.invoice_id) || [];
        current.push({
            id: adjustment.id,
            adjustment_type: adjustment.adjustment_type,
            amount: toNumber(adjustment.amount),
            reason: adjustment.reason || '',
            created_at: formatDateTime(adjustment.created_at),
        });
        adjustmentMap.set(adjustment.invoice_id, current);
    });

    return invoiceRows.map((row) => ({
        id: row.id,
        invoice_number: row.invoice_number,
        billing_config_id: row.billing_config_id,
        config_title: row.config_title || '',
        billing_type: row.billing_type,
        billing_frequency: row.billing_frequency,
        calculation_method: row.calculation_method,
        flat_id: row.flat_id,
        block_name: row.block_name,
        flat_number: row.flat_number,
        area_sqft: row.area_sqft !== null ? toNumber(row.area_sqft) : null,
        flat_type: row.flat_type || '',
        billing_custom_amount: row.billing_custom_amount !== null ? toNumber(row.billing_custom_amount) : null,
        month_year: row.month_year,
        status: row.status,
        due_date: formatDate(row.due_date),
        invoice_date: formatDate(row.invoice_date),
        generated_at: formatDateTime(row.generated_at),
        paid_at: formatDateTime(row.paid_at),
        amount: toNumber(row.amount),
        subtotal_amount: toNumber(row.subtotal_amount || row.amount),
        penalty_amount: toNumber(row.penalty_amount),
        adjustment_amount: toNumber(row.adjustment_amount),
        total_amount: toNumber(row.total_amount || row.amount),
        balance_amount: toNumber(row.balance_amount),
        paid_amount: toNumber(row.paid_amount),
        late_fee_type: row.late_fee_type || 'None',
        late_fee_value: toNumber(row.late_fee_value),
        overdue_days: toNumber(row.overdue_days),
        is_overdue: Boolean(row.is_overdue),
        payment_method: row.payment_method || '',
        payment_reference: row.payment_reference || '',
        notes: row.notes || '',
        pdf_url: row.pdf_url || '',
        line_items: itemMap.get(row.id) || [],
        payments: paymentMap.get(row.id) || [],
        adjustments: adjustmentMap.get(row.id) || [],
    }));
};

const normalizeBillingConfigPayload = (payload) => {
    const title = String(payload.title || '').trim();
    const billingType = String(payload.billing_type || 'MonthlyMaintenance').trim();
    const frequency = String(payload.frequency || 'Monthly').trim();
    const calculationMethod = String(payload.calculation_method || 'Equal').trim();
    const lateFeeType = String(payload.late_fee_type || 'None').trim();
    const baseAmount = toNumber(payload.base_amount);
    const dueDay = payload.due_day === '' || payload.due_day === null || payload.due_day === undefined ? null : Number(payload.due_day);
    const lateFeeValue = toNumber(payload.late_fee_value);
    const breakdown = normalizeBreakdown(payload.breakdown);
    const flatTypeAmounts = normalizeFlatTypeAmounts(payload.flat_type_amounts);
    const reminderDays = Array.isArray(payload.reminder_days) ? payload.reminder_days.map(Number).filter(Number.isFinite) : [3, 0, -3];

    if (!title) return { error: 'Billing rule title is required' };
    if (!BILLING_TYPES.includes(billingType) || !BILLING_FREQUENCIES.includes(frequency) || !CALCULATION_METHODS.includes(calculationMethod)) {
        return { error: 'Invalid billing rule settings' };
    }
    if (!LATE_FEE_TYPES.includes(lateFeeType)) return { error: 'Invalid late fee rule' };
    if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) {
        return { error: 'Due day must be between 1 and 31' };
    }

    return {
        value: {
            title,
            description: normalizeOptionalString(payload.description),
            billing_type: billingType,
            frequency,
            calculation_method: calculationMethod,
            base_amount: baseAmount,
            due_day: dueDay,
            auto_generate: Boolean(payload.auto_generate),
            late_fee_type: lateFeeType,
            late_fee_value: lateFeeValue,
            breakdown,
            flat_type_amounts: flatTypeAmounts,
            reminder_days: reminderDays,
            is_active: payload.is_active === undefined ? true : Boolean(payload.is_active),
        },
    };
};

const buildLineItemsForInvoice = ({ config, flat, manualBreakdown = [], manualAmount = null, manualTitle = 'Charge' }) => {
    const breakdown = manualBreakdown.length ? manualBreakdown : normalizeJson(config?.breakdown_json, []);
    const calculationMethod = config?.calculation_method || 'Equal';
    const areaSqft = toNumber(flat.area_sqft);
    const flatTypeAmounts = normalizeFlatTypeAmounts(config?.flat_type_amounts_json);
    const flatTypeAmount = flat.flat_type ? toNumber(flatTypeAmounts[flat.flat_type]) : 0;
    const calculatedTitle = config?.title || manualTitle;
    let calculatedAmount = toNumber(manualAmount);

    if (!calculatedAmount) {
        if (calculationMethod === 'AreaBased') calculatedAmount = Number((toNumber(config?.base_amount) * areaSqft).toFixed(2));
        else if (calculationMethod === 'FlatType') calculatedAmount = flatTypeAmount || toNumber(config?.base_amount);
        else if (calculationMethod === 'Custom') calculatedAmount = toNumber(flat.billing_custom_amount || config?.base_amount);
        else calculatedAmount = toNumber(config?.base_amount);
    }

    if (breakdown.length) {
        const items = breakdown
            .map((item, index) => ({
                label: item.label,
                amount: item.calculation === 'per_sqft' ? Number((toNumber(item.amount) * areaSqft).toFixed(2)) : toNumber(item.amount),
                calculation_mode: item.calculation || 'fixed',
                sort_order: index + 2,
            }))
            .filter((item) => item.amount > 0);

        if (items.length) {
            const shouldIncludeCalculatedBase = calculatedAmount > 0;
            if (shouldIncludeCalculatedBase) {
                return [
                    {
                        label: calculatedTitle,
                        amount: calculatedAmount,
                        calculation_mode: calculationMethod === 'AreaBased' ? 'per_sqft' : 'fixed',
                        sort_order: 1,
                    },
                    ...items,
                ];
            }
            return items;
        }
    }

    return calculatedAmount > 0
        ? [{ label: calculatedTitle, amount: calculatedAmount, calculation_mode: calculationMethod === 'AreaBased' ? 'per_sqft' : 'fixed', sort_order: 1 }]
        : [];
};

const insertInvoiceWithItems = async ({ societyId, flat, monthYear, dueDate, notes, config = null, lineItems }) => {
    const subtotalAmount = Number(lineItems.reduce((sum, item) => sum + toNumber(item.amount), 0).toFixed(2));
    if (subtotalAmount <= 0) return null;

    const [result] = await db.query(
        `INSERT INTO invoices (
            society_id, flat_id, billing_config_id, amount, month_year, status, due_date, late_fee, payment_method,
            invoice_number, billing_type, billing_frequency, calculation_method, invoice_date, generated_at,
            subtotal_amount, penalty_amount, adjustment_amount, total_amount, balance_amount, paid_amount,
            late_fee_type, late_fee_value, notes
         ) VALUES (?, ?, ?, ?, ?, 'Unpaid', ?, 0, NULL, '', ?, ?, ?, CURDATE(), NOW(), ?, 0, 0, ?, ?, 0, ?, ?, ?)`,
        [
            societyId,
            flat.id,
            config?.id || null,
            subtotalAmount,
            monthYear,
            dueDate,
            config?.billing_type || 'OneTimeCharge',
            config?.frequency || 'OneTime',
            config?.calculation_method || 'Equal',
            subtotalAmount,
            subtotalAmount,
            subtotalAmount,
            config?.late_fee_type || 'None',
            toNumber(config?.late_fee_value),
            notes || null,
        ]
    );

    const invoiceId = result.insertId;
    const invoiceNumber = buildInvoiceNumber({ monthYear, flatId: flat.id, invoiceId });
    await db.query(`UPDATE invoices SET invoice_number = ? WHERE id = ?`, [invoiceNumber, invoiceId]);

    if (lineItems.length) {
        await db.query(
            `INSERT INTO invoice_line_items (invoice_id, label, amount, calculation_mode, sort_order) VALUES ?`,
            [lineItems.map((item) => [invoiceId, item.label, item.amount, item.calculation_mode, item.sort_order])]
        );
    }

    return invoiceId;
};

exports.getInvoices = async (req, res) => {
    try {
        const rows = await fetchInvoiceRows({
            societyId: req.user.society_id,
            role: req.user.role,
            userId: req.user.id,
            filters: req.query,
        });
        const invoices = await hydrateInvoices(rows);
        return res.status(200).json({ success: true, invoices });
    } catch (error) {
        console.error('getInvoices error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving invoices' });
    }
};

exports.getBillingSummary = async (req, res) => {
    try {
        const rows = await fetchInvoiceRows({
            societyId: req.user.society_id,
            role: req.user.role,
            userId: req.user.id,
        });

        const totalInvoiced = rows.reduce((sum, row) => sum + toNumber(row.total_amount), 0);
        const totalCollected = rows.reduce((sum, row) => sum + toNumber(row.paid_amount), 0);
        const pendingAmount = rows.filter((row) => ACTIVE_DUE_STATUSES.includes(row.status)).reduce((sum, row) => sum + toNumber(row.balance_amount), 0);
        const overdueAmount = rows.filter((row) => row.status === 'Overdue').reduce((sum, row) => sum + toNumber(row.balance_amount), 0);
        const penaltiesApplied = rows.reduce((sum, row) => sum + toNumber(row.penalty_amount), 0);

        let defaulters = [];
        let monthlyRevenue = [];

        if (req.user.role !== 'RESIDENT') {
            const [[defaulterRows], [monthlyRows]] = await Promise.all([
                db.query(
                    `SELECT f.id AS flat_id, f.block_name, f.flat_number,
                            COALESCE(SUM(i.balance_amount), 0) AS outstanding_amount,
                            COUNT(i.id) AS invoice_count
                     FROM invoices i
                     INNER JOIN flats f ON f.id = i.flat_id
                     WHERE i.society_id = ? AND i.status IN ('Unpaid', 'Overdue', 'PartiallyPaid')
                     GROUP BY f.id, f.block_name, f.flat_number
                     HAVING outstanding_amount > 0
                     ORDER BY outstanding_amount DESC, invoice_count DESC
                     LIMIT 8`,
                    [req.user.society_id]
                ),
                db.query(
                    `SELECT month_year, COALESCE(SUM(paid_amount), 0) AS collected_amount, COALESCE(SUM(total_amount), 0) AS invoiced_amount
                     FROM invoices
                     WHERE society_id = ?
                     GROUP BY month_year
                     ORDER BY month_year DESC
                     LIMIT 12`,
                    [req.user.society_id]
                ),
            ]);

            defaulters = defaulterRows.map((row) => ({
                flat_id: row.flat_id,
                block_name: row.block_name,
                flat_number: row.flat_number,
                outstanding_amount: toNumber(row.outstanding_amount),
                invoice_count: toNumber(row.invoice_count),
            }));

            monthlyRevenue = monthlyRows.reverse().map((row) => ({
                month_year: row.month_year,
                collected_amount: toNumber(row.collected_amount),
                invoiced_amount: toNumber(row.invoiced_amount),
            }));
        }

        return res.status(200).json({
            success: true,
            summary: {
                total_invoiced: Number(totalInvoiced.toFixed(2)),
                total_collected: Number(totalCollected.toFixed(2)),
                pending_amount: Number(pendingAmount.toFixed(2)),
                overdue_amount: Number(overdueAmount.toFixed(2)),
                penalties_applied: Number(penaltiesApplied.toFixed(2)),
                collection_rate: totalInvoiced > 0 ? Number(((totalCollected / totalInvoiced) * 100).toFixed(1)) : 0,
                paid_invoices: rows.filter((row) => row.status === 'Paid').length,
                unpaid_invoices: rows.filter((row) => ACTIVE_DUE_STATUSES.includes(row.status)).length,
                overdue_invoices: rows.filter((row) => row.status === 'Overdue').length,
                defaulters,
                monthly_revenue: monthlyRevenue,
            },
        });
    } catch (error) {
        console.error('getBillingSummary error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving billing summary' });
    }
};

exports.getBillingConfigs = async (req, res) => {
    try {
        const [[configs], [flats]] = await Promise.all([
            db.query(`SELECT * FROM billing_configs WHERE society_id = ? ORDER BY is_active DESC, title ASC`, [req.user.society_id]),
            db.query(`SELECT id, block_name, flat_number, flat_type, area_sqft, billing_custom_amount FROM flats WHERE society_id = ? ORDER BY block_name ASC, flat_number ASC`, [req.user.society_id]),
        ]);

        return res.status(200).json({
            success: true,
            configs: configs.map((config) => ({
                id: config.id,
                title: config.title,
                description: config.description || '',
                billing_type: config.billing_type,
                frequency: config.frequency,
                calculation_method: config.calculation_method,
                base_amount: toNumber(config.base_amount),
                due_day: config.due_day,
                auto_generate: Boolean(config.auto_generate),
                late_fee_type: config.late_fee_type,
                late_fee_value: toNumber(config.late_fee_value),
                breakdown: normalizeJson(config.breakdown_json, []),
                flat_type_amounts: normalizeFlatTypeAmounts(config.flat_type_amounts_json),
                reminder_days: normalizeJson(config.reminder_days_json, [3, 0, -3]),
                is_active: Boolean(config.is_active),
            })),
            flats: flats.map((flat) => ({
                id: flat.id,
                block_name: flat.block_name,
                flat_number: flat.flat_number,
                label: `${flat.block_name}-${flat.flat_number}`,
                flat_type: flat.flat_type || '',
                area_sqft: flat.area_sqft !== null ? toNumber(flat.area_sqft) : null,
                billing_custom_amount: flat.billing_custom_amount !== null ? toNumber(flat.billing_custom_amount) : null,
            })),
            meta: {
                billing_types: BILLING_TYPES,
                frequencies: BILLING_FREQUENCIES,
                calculation_methods: CALCULATION_METHODS,
                late_fee_types: LATE_FEE_TYPES,
                flat_types: DEFAULT_FLAT_TYPES,
            },
        });
    } catch (error) {
        console.error('getBillingConfigs error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving billing configuration' });
    }
};

exports.saveBillingConfig = async (req, res) => {
    try {
        const validation = normalizeBillingConfigPayload(req.body);
        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }

        const value = validation.value;
        const configId = req.params.id ? Number(req.params.id) : null;

        if (configId) {
            await db.query(
                `UPDATE billing_configs
                 SET title = ?, description = ?, billing_type = ?, frequency = ?, calculation_method = ?, base_amount = ?,
                     due_day = ?, auto_generate = ?, late_fee_type = ?, late_fee_value = ?, breakdown_json = ?, flat_type_amounts_json = ?,
                     reminder_days_json = ?, is_active = ?, updated_at = NOW()
                 WHERE id = ? AND society_id = ?`,
                [value.title, value.description, value.billing_type, value.frequency, value.calculation_method, value.base_amount, value.due_day, value.auto_generate, value.late_fee_type, value.late_fee_value, JSON.stringify(value.breakdown), JSON.stringify(value.flat_type_amounts), JSON.stringify(value.reminder_days), value.is_active, configId, req.user.society_id]
            );
            return res.status(200).json({ success: true, message: 'Billing rule updated successfully' });
        }

        await db.query(
            `INSERT INTO billing_configs (
                society_id, title, description, billing_type, frequency, calculation_method, base_amount,
                due_day, auto_generate, late_fee_type, late_fee_value, breakdown_json, flat_type_amounts_json, reminder_days_json, is_active, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.society_id, value.title, value.description, value.billing_type, value.frequency, value.calculation_method, value.base_amount, value.due_day, value.auto_generate, value.late_fee_type, value.late_fee_value, JSON.stringify(value.breakdown), JSON.stringify(value.flat_type_amounts), JSON.stringify(value.reminder_days), value.is_active, req.user.id]
        );

        return res.status(201).json({ success: true, message: 'Billing rule created successfully' });
    } catch (error) {
        console.error('saveBillingConfig error:', error);
        return res.status(500).json({ success: false, message: 'Server error saving billing rule' });
    }
};

exports.updateFlatBillingMeta = async (req, res) => {
    try {
        const flatId = Number(req.params.id);
        const areaSqft = req.body.area_sqft === '' || req.body.area_sqft === null || req.body.area_sqft === undefined ? null : toNumber(req.body.area_sqft);
        const customAmount = req.body.billing_custom_amount === '' || req.body.billing_custom_amount === null || req.body.billing_custom_amount === undefined ? null : toNumber(req.body.billing_custom_amount);
        const flatType = normalizeOptionalString(req.body.flat_type);

        await db.query(
            `UPDATE flats SET flat_type = ?, area_sqft = ?, billing_custom_amount = ? WHERE id = ? AND society_id = ?`,
            [flatType, areaSqft, customAmount, flatId, req.user.society_id]
        );

        return res.status(200).json({ success: true, message: 'Flat billing details updated' });
    } catch (error) {
        console.error('updateFlatBillingMeta error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating flat billing details' });
    }
};

exports.generateInvoice = async (req, res) => {
    try {
        const configId = req.body.config_id ? Number(req.body.config_id) : null;

        if (configId) {
            const [configs] = await db.query(`SELECT * FROM billing_configs WHERE id = ? AND society_id = ?`, [configId, req.user.society_id]);
            const config = configs[0];
            if (!config) return res.status(404).json({ success: false, message: 'Billing rule not found' });

            const monthYear = String(req.body.month_year || '').trim();
            if (!/^\d{4}-\d{2}$/.test(monthYear)) {
                return res.status(400).json({ success: false, message: 'Month must be in YYYY-MM format' });
            }

            const [flats] = await db.query(`SELECT id, block_name, flat_number, flat_type, area_sqft, billing_custom_amount FROM flats WHERE society_id = ? ORDER BY block_name ASC, flat_number ASC`, [req.user.society_id]);
            const dueDate = req.body.due_date ? formatDate(req.body.due_date) : `${monthYear}-${String(config.due_day || 10).padStart(2, '0')}`;

            let generated = 0;
            let skipped = 0;
            const skippedFlats = [];

            for (const flat of flats) {
                const [existing] = await db.query(`SELECT id FROM invoices WHERE society_id = ? AND flat_id = ? AND month_year = ? AND billing_config_id = ? LIMIT 1`, [req.user.society_id, flat.id, monthYear, config.id]);
                if (existing.length) {
                    skipped += 1;
                    skippedFlats.push(`${flat.block_name}-${flat.flat_number} (already generated)`);
                    continue;
                }

                const lineItems = buildLineItemsForInvoice({ config, flat });
                if (!lineItems.length) {
                    skipped += 1;
                    skippedFlats.push(`${flat.block_name}-${flat.flat_number} (missing area/custom/BHK charge)`);
                    continue;
                }

                const invoiceId = await insertInvoiceWithItems({
                    societyId: req.user.society_id,
                    flat,
                    monthYear,
                    dueDate,
                    notes: config.description || null,
                    config,
                    lineItems,
                });

                if (invoiceId) generated += 1;
            }

            return res.status(201).json({
                success: true,
                message: generated > 0 ? `Generated ${generated} invoice(s) for ${monthYear}` : 'No invoices generated for the selected rule',
                generated,
                skipped,
                skipped_flats: skippedFlats.slice(0, 12),
            });
        }

        const flatId = Number(req.body.flat_id);
        const amount = toNumber(req.body.amount);
        const monthYear = String(req.body.month_year || '').trim();
        const dueDate = formatDate(req.body.due_date);
        const billingType = String(req.body.billing_type || 'OneTimeCharge').trim();

        if (!flatId || amount <= 0 || !monthYear || !dueDate || !BILLING_TYPES.includes(billingType)) {
            return res.status(400).json({ success: false, message: 'Flat, amount, month, due date, and valid billing type are required' });
        }

        const [flats] = await db.query(`SELECT id, block_name, flat_number, flat_type, area_sqft, billing_custom_amount FROM flats WHERE id = ? AND society_id = ?`, [flatId, req.user.society_id]);
        const flat = flats[0];
        if (!flat) return res.status(404).json({ success: false, message: 'Flat not found' });

        const lineItems = buildLineItemsForInvoice({
            flat,
            manualAmount: amount,
            manualTitle: req.body.title || billingType,
            manualBreakdown: normalizeBreakdown(req.body.breakdown),
        });

        const invoiceId = await insertInvoiceWithItems({
            societyId: req.user.society_id,
            flat,
            monthYear,
            dueDate,
            notes: normalizeOptionalString(req.body.notes),
            config: {
                billing_type: billingType,
                frequency: String(req.body.frequency || 'OneTime'),
                calculation_method: 'Equal',
                late_fee_type: String(req.body.late_fee_type || 'None'),
                late_fee_value: toNumber(req.body.late_fee_value),
                title: req.body.title || billingType,
            },
            lineItems,
        });

        return res.status(201).json({ success: true, message: 'Invoice generated successfully', invoice_id: invoiceId });
    } catch (error) {
        console.error('generateInvoice error:', error);
        return res.status(500).json({ success: false, message: 'Server error generating invoice' });
    }
};

exports.payInvoice = async (req, res) => {
    try {
        const invoiceId = Number(req.params.id);
        const rows = await fetchInvoiceRows({ societyId: req.user.society_id, role: 'ADMIN', userId: req.user.id, invoiceId });
        const invoice = rows[0];
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

        if (req.user.role === 'RESIDENT') {
            const [allowed] = await db.query(`SELECT 1 FROM user_flats WHERE user_id = ? AND flat_id = ? LIMIT 1`, [req.user.id, invoice.flat_id]);
            if (!allowed.length) {
                return res.status(403).json({ success: false, message: 'You can only pay invoices for your own flat' });
            }
        }

        if (toNumber(invoice.balance_amount) <= 0) {
            return res.status(400).json({ success: false, message: 'This invoice is already settled' });
        }

        const paymentReference = normalizeOptionalString(req.body.payment_reference) || `PAY-${Date.now()}`;
        const paymentAmount = req.body.amount ? Math.min(toNumber(req.body.amount), toNumber(invoice.balance_amount)) : toNumber(invoice.balance_amount);
        if (paymentAmount <= 0) return res.status(400).json({ success: false, message: 'A valid payment amount is required' });

        await db.query(
            `INSERT INTO invoice_payments (invoice_id, amount, payment_method, payment_gateway, payment_reference, paid_by_user_id, status, paid_at, notes)
             VALUES (?, ?, ?, ?, ?, ?, 'Completed', NOW(), ?)`,
            [invoiceId, paymentAmount, normalizeOptionalString(req.body.payment_method) || 'Online', normalizeOptionalString(req.body.payment_gateway) || 'MockGateway', paymentReference, req.user.id, normalizeOptionalString(req.body.notes)]
        );
        await db.query(`UPDATE invoices SET payment_method = ?, payment_reference = ? WHERE id = ?`, [normalizeOptionalString(req.body.payment_method) || 'Online', paymentReference, invoiceId]);
        await fetchInvoiceRows({ societyId: req.user.society_id, role: 'ADMIN', userId: req.user.id, invoiceId });

        return res.status(200).json({ success: true, message: 'Payment recorded successfully' });
    } catch (error) {
        console.error('payInvoice error:', error);
        return res.status(500).json({ success: false, message: 'Server error processing payment' });
    }
};

exports.adjustInvoice = async (req, res) => {
    try {
        const invoiceId = Number(req.params.id);
        const adjustmentType = String(req.body.adjustment_type || 'Discount').trim();
        if (!ADJUSTMENT_TYPES.includes(adjustmentType)) return res.status(400).json({ success: false, message: 'Invalid adjustment type' });

        const rows = await fetchInvoiceRows({ societyId: req.user.society_id, role: 'ADMIN', userId: req.user.id, invoiceId });
        const invoice = rows[0];
        if (!invoice) return res.status(404).json({ success: false, message: 'Invoice not found' });

        let amount = req.body.amount ? toNumber(req.body.amount) : 0;
        if (adjustmentType === 'Waiver' && amount <= 0) amount = toNumber(invoice.balance_amount);
        if (amount <= 0) return res.status(400).json({ success: false, message: 'Adjustment amount must be greater than zero' });

        await db.query(
            `INSERT INTO invoice_adjustments (invoice_id, adjustment_type, amount, reason, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [invoiceId, adjustmentType, amount, normalizeOptionalString(req.body.reason), req.user.id]
        );
        await fetchInvoiceRows({ societyId: req.user.society_id, role: 'ADMIN', userId: req.user.id, invoiceId });

        return res.status(200).json({ success: true, message: `${adjustmentType} applied successfully` });
    } catch (error) {
        console.error('adjustInvoice error:', error);
        return res.status(500).json({ success: false, message: 'Server error adjusting invoice' });
    }
};

exports.getBillingReports = async (req, res) => {
    try {
        const rows = await fetchInvoiceRows({ societyId: req.user.society_id, role: req.user.role, userId: req.user.id });
        const collectionMap = new Map();

        rows.forEach((row) => {
            const entry = collectionMap.get(row.month_year) || { month_year: row.month_year, invoiced_amount: 0, collected_amount: 0, pending_amount: 0 };
            entry.invoiced_amount += toNumber(row.total_amount);
            entry.collected_amount += toNumber(row.paid_amount);
            entry.pending_amount += toNumber(row.balance_amount);
            collectionMap.set(row.month_year, entry);
        });

        const [flatDues] = await db.query(
            `SELECT f.id AS flat_id, f.block_name, f.flat_number, COALESCE(SUM(i.balance_amount), 0) AS pending_amount,
                    COUNT(CASE WHEN i.status = 'Overdue' THEN 1 END) AS overdue_count
             FROM invoices i
             INNER JOIN flats f ON f.id = i.flat_id
             WHERE i.society_id = ? AND i.status IN ('Unpaid', 'Overdue', 'PartiallyPaid')
             GROUP BY f.id, f.block_name, f.flat_number
             ORDER BY pending_amount DESC, overdue_count DESC`,
            [req.user.society_id]
        );

        return res.status(200).json({
            success: true,
            reports: {
                collection_report: [...collectionMap.values()].sort((a, b) => a.month_year.localeCompare(b.month_year)).map((row) => ({
                    month_year: row.month_year,
                    invoiced_amount: Number(row.invoiced_amount.toFixed(2)),
                    collected_amount: Number(row.collected_amount.toFixed(2)),
                    pending_amount: Number(row.pending_amount.toFixed(2)),
                })),
                flat_wise_dues: flatDues.map((row) => ({
                    flat_id: row.flat_id,
                    block_name: row.block_name,
                    flat_number: row.flat_number,
                    pending_amount: toNumber(row.pending_amount),
                    overdue_count: toNumber(row.overdue_count),
                })),
            },
        });
    } catch (error) {
        console.error('getBillingReports error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving billing reports' });
    }
};
