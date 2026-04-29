const crypto = require('crypto');
const db = require('../config/db');
const {
    GRACE_DAYS,
    TRIAL_DAYS,
    activatePaidSubscription,
    getSocietySubscriptionSnapshot,
} = require('../services/subscriptionService');
const { getFlatQuotaSnapshot } = require('../services/flatQuotaService');

const UNIT_PRICE_PAISE_PER_MONTH = Number(process.env.SUBSCRIPTION_PRICE_PER_UNIT_PAISE || 1000);

function getPlanCatalog() {
    return {
        trial: {
            code: 'TRIAL',
            name: 'Free Trial',
            price_paise: 0,
            currency: 'INR',
            trial_days: TRIAL_DAYS,
            grace_days: GRACE_DAYS,
            full_access: true,
        },
        paid: [
            {
                code: 'PRO_MONTHLY',
                name: 'Pro Monthly',
                price_paise: null,
                currency: 'INR',
                billing_cycle: 'monthly',
                duration_months: 1,
            },
            {
                code: 'PRO_YEARLY',
                name: 'Pro Yearly',
                price_paise: null,
                currency: 'INR',
                billing_cycle: 'yearly',
                duration_months: 12,
            },
        ],
    };
}

function findPaidPlan(planCode) {
    const catalog = getPlanCatalog();
    return catalog.paid.find((plan) => plan.code === planCode) || null;
}

function requireRazorpayConfig() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
    }
    return { keyId, keySecret };
}

async function createRazorpayOrder({ amountPaise, receipt, notes }) {
    const { keyId, keySecret } = requireRazorpayConfig();
    const response = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            amount: amountPaise,
            currency: 'INR',
            receipt,
            notes: notes || {},
        }),
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error?.description || payload.error?.code || 'Unable to create Razorpay order');
    }
    return payload;
}

function verifyRazorpayPaymentSignature({ orderId, paymentId, signature }) {
    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const expected = crypto
        .createHmac('sha256', secret)
        .update(`${orderId}|${paymentId}`)
        .digest('hex');
    return expected === signature;
}

async function getDeclaredUnits(societyId, connection = db) {
    const [[row]] = await connection.query(
        'SELECT total_flats FROM societies WHERE id = ? LIMIT 1',
        [societyId]
    );
    return Number(row?.total_flats || 0);
}

exports.getPlans = async (req, res) => {
    const perUnitMonthly = UNIT_PRICE_PAISE_PER_MONTH;
    return res.status(200).json({
        success: true,
        pricing_model: {
            per_unit_monthly_paise: perUnitMonthly,
            per_unit_monthly_inr: perUnitMonthly / 100,
            annual_multiplier_months: 12,
        },
        plans: getPlanCatalog(),
    });
};

exports.getMySubscription = async (req, res) => {
    try {
        const snapshot = await getSocietySubscriptionSnapshot(req.user.society_id);
        const unitQuota = await getFlatQuotaSnapshot({ societyId: req.user.society_id });
        return res.status(200).json({
            success: true,
            subscription: snapshot,
            unit_quota: unitQuota,
        });
    } catch (error) {
        console.error('getMySubscription error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching subscription status' });
    }
};

exports.createOrder = async (req, res) => {
    try {
        const role = req.user.role;
        if (!['ADMIN', 'MANAGER', 'SUPERADMIN'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Only admins can create subscription orders' });
        }

        const planCode = String(req.body.plan_code || '').trim().toUpperCase();
        const plan = findPaidPlan(planCode);
        if (!plan) {
            return res.status(400).json({ success: false, message: 'Invalid paid plan selected' });
        }

        const declaredUnits = await getDeclaredUnits(req.user.society_id);
        if (declaredUnits <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Declared units/flats are missing. Please set total units before payment.',
            });
        }

        const amountPaise = declaredUnits * UNIT_PRICE_PAISE_PER_MONTH * plan.duration_months;

        const receipt = `soc-${req.user.society_id}-${Date.now()}`;
        const order = await createRazorpayOrder({
            amountPaise,
            receipt,
            notes: {
                society_id: String(req.user.society_id),
                plan_code: plan.code,
                declared_units: String(declaredUnits),
            },
        });

        await db.query(
            `INSERT INTO society_subscription_payments (
                society_id, provider, plan_code, provider_order_id, amount_paise, currency, status, metadata_json
            ) VALUES (?, 'RAZORPAY', ?, ?, ?, 'INR', 'created', ?)`,
            [req.user.society_id, plan.code, order.id, amountPaise, JSON.stringify({ receipt, created_by: req.user.id, declared_units: declaredUnits })]
        );

        return res.status(201).json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
            },
            plan: {
                ...plan,
                declared_units: declaredUnits,
                amount_paise: amountPaise,
                amount_inr: amountPaise / 100,
                per_unit_monthly_inr: UNIT_PRICE_PAISE_PER_MONTH / 100,
            },
            razorpay_key_id: process.env.RAZORPAY_KEY_ID || '',
        });
    } catch (error) {
        console.error('createOrder error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Unable to create payment order' });
    }
};

exports.confirmPayment = async (req, res) => {
    let connection;
    try {
        const role = req.user.role;
        if (!['ADMIN', 'MANAGER', 'SUPERADMIN'].includes(role)) {
            return res.status(403).json({ success: false, message: 'Only admins can confirm payment' });
        }

        const planCode = String(req.body.plan_code || '').trim().toUpperCase();
        const plan = findPaidPlan(planCode);
        if (!plan) {
            return res.status(400).json({ success: false, message: 'Invalid paid plan selected' });
        }

        const orderId = String(req.body.razorpay_order_id || '').trim();
        const paymentId = String(req.body.razorpay_payment_id || '').trim();
        const signature = String(req.body.razorpay_signature || '').trim();

        if (!orderId || !paymentId || !signature) {
            return res.status(400).json({
                success: false,
                message: 'razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
            });
        }

        if (!verifyRazorpayPaymentSignature({ orderId, paymentId, signature })) {
            return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        await connection.query(
            `UPDATE society_subscription_payments
             SET provider_payment_id = ?, provider_signature = ?, status = 'captured', paid_at = NOW()
             WHERE society_id = ? AND provider_order_id = ?`,
            [paymentId, signature, req.user.society_id, orderId]
        );

        const snapshot = await activatePaidSubscription({
            societyId: req.user.society_id,
            planCode: plan.code,
            durationMonths: plan.duration_months,
            paymentProvider: 'RAZORPAY',
            paymentReference: paymentId,
            connection,
        });

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Subscription activated successfully',
            subscription: snapshot,
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('confirmPayment error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Unable to confirm payment' });
    } finally {
        if (connection) connection.release();
    }
};
