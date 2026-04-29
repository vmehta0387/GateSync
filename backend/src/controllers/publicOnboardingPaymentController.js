const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { activatePaidSubscription } = require('../services/subscriptionService');

const UNIT_PRICE_PAISE_PER_MONTH = Number(process.env.SUBSCRIPTION_PRICE_PER_UNIT_PAISE || 1000);

const PLAN_CONFIG = {
    PRO_MONTHLY: { durationMonths: 1 },
    PRO_YEARLY: { durationMonths: 12 },
};

function signJwt(payload, expiresIn = '2h') {
    return jwt.sign(
        payload,
        process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token',
        { expiresIn }
    );
}

function getAmountPaise({ planCode, totalFlats }) {
    const plan = PLAN_CONFIG[planCode];
    const units = Number(totalFlats || 0);
    if (!plan || units <= 0) return 0;
    return units * UNIT_PRICE_PAISE_PER_MONTH * plan.durationMonths;
}

function getOnboardingToken(req) {
    const headerToken = String(req.headers['x-onboarding-token'] || '').trim();
    if (headerToken) return headerToken;

    const authHeader = String(req.headers.authorization || '').trim();
    if (authHeader.startsWith('Bearer ')) return authHeader.slice('Bearer '.length).trim();
    return '';
}

function verifyOnboardingToken(req) {
    const token = getOnboardingToken(req);
    if (!token) {
        const error = new Error('Onboarding token is required');
        error.statusCode = 401;
        throw error;
    }

    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token');
    } catch (error) {
        const authError = new Error('Invalid or expired onboarding token');
        authError.statusCode = 401;
        throw authError;
    }

    if (decoded?.purpose !== 'PUBLIC_ONBOARDING' || !decoded?.society_id) {
        const authError = new Error('Invalid onboarding token payload');
        authError.statusCode = 401;
        throw authError;
    }

    return decoded;
}

async function createRazorpayOrder({ amountPaise, receipt, notes }) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
    }

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

async function fetchRazorpayPayment(paymentId) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new Error('Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET');
    }

    const response = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
        method: 'GET',
        headers: {
            Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
            'Content-Type': 'application/json',
        },
    });

    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error?.description || payload.error?.code || 'Unable to verify Razorpay payment status');
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
        'SELECT total_flats, name FROM societies WHERE id = ? LIMIT 1',
        [societyId]
    );
    if (!row) return null;
    return { total_flats: Number(row.total_flats || 0), name: row.name || 'GateSync' };
}

exports.createOrder = async (req, res) => {
    try {
        const tokenPayload = verifyOnboardingToken(req);
        const requestedPlan = String(req.body.plan_code || tokenPayload.plan_code || '').trim().toUpperCase();
        const plan = PLAN_CONFIG[requestedPlan];

        if (!plan) {
            return res.status(400).json({ success: false, message: 'Invalid premium plan selected' });
        }

        const declared = await getDeclaredUnits(tokenPayload.society_id);
        if (!declared || declared.total_flats <= 0) {
            return res.status(400).json({ success: false, message: 'Declared units are missing for this society' });
        }

        const amountPaise = declared.total_flats * UNIT_PRICE_PAISE_PER_MONTH * plan.durationMonths;
        const receipt = `public-soc-${tokenPayload.society_id}-${Date.now()}`;

        const order = await createRazorpayOrder({
            amountPaise,
            receipt,
            notes: {
                society_id: String(tokenPayload.society_id),
                plan_code: requestedPlan,
                declared_units: String(declared.total_flats),
            },
        });

        await db.query(
            `INSERT INTO society_subscription_payments (
                society_id, provider, plan_code, provider_order_id, amount_paise, currency, status, metadata_json
            ) VALUES (?, 'RAZORPAY', ?, ?, ?, 'INR', 'created', ?)`,
            [
                tokenPayload.society_id,
                requestedPlan,
                order.id,
                amountPaise,
                JSON.stringify({ receipt, source: 'PUBLIC_ONBOARDING', declared_units: declared.total_flats }),
            ]
        );

        return res.status(201).json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
            },
            pricing: {
                declared_units: declared.total_flats,
                per_unit_monthly_inr: UNIT_PRICE_PAISE_PER_MONTH / 100,
                amount_inr: amountPaise / 100,
            },
            razorpay_key_id: process.env.RAZORPAY_KEY_ID || '',
            society: { name: declared.name },
        });
    } catch (error) {
        console.error('public onboarding createOrder error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Unable to create payment order' });
    }
};

exports.confirmPayment = async (req, res) => {
    let connection;
    try {
        const tokenPayload = verifyOnboardingToken(req);

        const planCode = String(req.body.plan_code || tokenPayload.plan_code || '').trim().toUpperCase();
        const plan = PLAN_CONFIG[planCode];
        if (!plan) {
            return res.status(400).json({ success: false, message: 'Invalid premium plan selected' });
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
            [paymentId, signature, tokenPayload.society_id, orderId]
        );

        const snapshot = await activatePaidSubscription({
            societyId: tokenPayload.society_id,
            planCode,
            durationMonths: plan.durationMonths,
            paymentProvider: 'RAZORPAY',
            paymentReference: paymentId,
            connection,
        });

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Premium subscription activated successfully',
            subscription: snapshot,
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('public onboarding confirmPayment error:', error);
        return res.status(error.statusCode || 500).json({ success: false, message: error.message || 'Unable to confirm payment' });
    } finally {
        if (connection) connection.release();
    }
};

exports.createPreOrder = async (req, res) => {
    try {
        const planCode = String(req.body.plan_code || '').trim().toUpperCase();
        const totalFlats = Number(req.body.total_flats || 0);

        if (!PLAN_CONFIG[planCode]) {
            return res.status(400).json({ success: false, message: 'Invalid premium plan selected' });
        }
        if (!totalFlats || totalFlats <= 0) {
            return res.status(400).json({ success: false, message: 'Declared units/flats must be greater than 0' });
        }

        const amountPaise = getAmountPaise({ planCode, totalFlats });
        const receipt = `public-prepay-${Date.now()}`;
        const order = await createRazorpayOrder({
            amountPaise,
            receipt,
            notes: {
                source: 'PUBLIC_ONBOARDING_PREPAY',
                plan_code: planCode,
                declared_units: String(totalFlats),
            },
        });

        const preOrderToken = signJwt(
            {
                purpose: 'PUBLIC_ONBOARDING_PREPAY_ORDER',
                order_id: order.id,
                plan_code: planCode,
                total_flats: totalFlats,
                amount_paise: amountPaise,
            },
            '30m'
        );

        return res.status(201).json({
            success: true,
            order: {
                id: order.id,
                amount: order.amount,
                currency: order.currency,
            },
            pricing: {
                declared_units: totalFlats,
                per_unit_monthly_inr: UNIT_PRICE_PAISE_PER_MONTH / 100,
                amount_inr: amountPaise / 100,
            },
            pre_order_token: preOrderToken,
            razorpay_key_id: process.env.RAZORPAY_KEY_ID || '',
        });
    } catch (error) {
        console.error('public onboarding createPreOrder error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Unable to create pre-payment order' });
    }
};

exports.confirmPrePayment = async (req, res) => {
    try {
        const preOrderToken = String(req.body.pre_order_token || '').trim();
        const orderId = String(req.body.razorpay_order_id || '').trim();
        const paymentId = String(req.body.razorpay_payment_id || '').trim();
        const signature = String(req.body.razorpay_signature || '').trim();

        if (!preOrderToken || !orderId || !paymentId || !signature) {
            return res.status(400).json({
                success: false,
                message: 'pre_order_token, razorpay_order_id, razorpay_payment_id and razorpay_signature are required',
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(preOrderToken, process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token');
        } catch (error) {
            return res.status(401).json({ success: false, message: 'Invalid or expired pre-payment token' });
        }

        if (decoded?.purpose !== 'PUBLIC_ONBOARDING_PREPAY_ORDER') {
            return res.status(401).json({ success: false, message: 'Invalid pre-payment token payload' });
        }

        if (decoded.order_id !== orderId) {
            return res.status(400).json({ success: false, message: 'Payment order mismatch' });
        }

        if (!verifyRazorpayPaymentSignature({ orderId, paymentId, signature })) {
            return res.status(400).json({ success: false, message: 'Payment signature verification failed' });
        }

        const payment = await fetchRazorpayPayment(paymentId);
        const expectedAmount = getAmountPaise({
            planCode: String(decoded.plan_code || '').toUpperCase(),
            totalFlats: Number(decoded.total_flats || 0),
        });

        if (String(payment.order_id || '') !== orderId) {
            return res.status(400).json({ success: false, message: 'Payment does not belong to this order' });
        }

        if (Number(payment.amount || 0) !== Number(expectedAmount || 0)) {
            return res.status(400).json({ success: false, message: 'Payment amount mismatch' });
        }

        if (!['authorized', 'captured'].includes(String(payment.status || '').toLowerCase())) {
            return res.status(400).json({ success: false, message: 'Payment is not completed yet' });
        }

        const paymentProofToken = signJwt(
            {
                purpose: 'PUBLIC_ONBOARDING_PAYMENT_PROOF',
                order_id: orderId,
                payment_id: paymentId,
                signature,
                plan_code: String(decoded.plan_code || '').toUpperCase(),
                total_flats: Number(decoded.total_flats || 0),
                amount_paise: expectedAmount,
            },
            '2h'
        );

        return res.status(200).json({
            success: true,
            message: 'Payment verified successfully',
            payment_proof_token: paymentProofToken,
            payment: {
                order_id: orderId,
                payment_id: paymentId,
                status: payment.status,
                amount_inr: expectedAmount / 100,
            },
        });
    } catch (error) {
        console.error('public onboarding confirmPrePayment error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Unable to verify payment' });
    }
};
