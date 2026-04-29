const db = require('../config/db');
const jwt = require('jsonwebtoken');
const { ensureSocietySubscription, activatePaidSubscription } = require('../services/subscriptionService');

const PREMIUM_PLAN_CODES = new Set(['PRO_MONTHLY', 'PRO_YEARLY']);
const PREMIUM_DURATION_MONTHS = {
    PRO_MONTHLY: 1,
    PRO_YEARLY: 12,
};
const UNIT_PRICE_PAISE_PER_MONTH = Number(process.env.SUBSCRIPTION_PRICE_PER_UNIT_PAISE || 1000);

function verifyPaymentProofToken(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token');
        if (decoded?.purpose !== 'PUBLIC_ONBOARDING_PAYMENT_PROOF') return null;
        return decoded;
    } catch (error) {
        return null;
    }
}

exports.createSociety = async (req, res) => {
    let connection;
    try {
        const {
            name, address, society_type, towers_count, floors_per_tower, total_flats,
            amenities, config_settings, subscription_plan,
            premium_plan_code,
            payment_proof_token,
            admin,
            gates,
        } = req.body;

        if (!name || !admin || !admin.phone) {
            return res.status(400).json({ success: false, message: 'Society name and admin phone are required' });
        }

        if (!/^\d{10}$/.test(String(admin.phone || '').trim())) {
            return res.status(400).json({ success: false, message: 'Admin phone number must be exactly 10 digits' });
        }

        if (!Number(total_flats) || Number(total_flats) <= 0) {
            return res.status(400).json({ success: false, message: 'Declared units/flats must be greater than 0' });
        }

        const [existingAdmins] = await db.query(
            'SELECT id FROM users WHERE phone_number = ? LIMIT 1',
            [String(admin.phone).trim()]
        );
        if (existingAdmins.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'This admin phone number is already mapped to an account. Please use a different number or contact support.',
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [societyResult] = await connection.query(
            `INSERT INTO societies
            (name, address, society_type, towers_count, floors_per_tower, total_flats, amenities, config_settings, subscription_plan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                address || '',
                society_type || 'Apartment',
                Number(towers_count || 0),
                Number(floors_per_tower || 0),
                Number(total_flats || 0),
                JSON.stringify(amenities || []),
                JSON.stringify(config_settings || {}),
                subscription_plan || 'Free',
            ]
        );

        const societyId = societyResult.insertId;

        await connection.query(
            `INSERT INTO users (society_id, name, email, phone_number, role, status)
             VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE')`,
            [societyId, admin.name || '', admin.email || '', String(admin.phone).trim()]
        );

        if (Array.isArray(gates) && gates.length > 0) {
            const gateValues = gates
                .filter((gate) => gate && String(gate.name || '').trim())
                .map((gate) => [societyId, String(gate.name).trim(), gate.gate_type || 'Main']);
            if (gateValues.length > 0) {
                await connection.query(
                    'INSERT INTO gates (society_id, name, gate_type) VALUES ?',
                    [gateValues]
                );
            }
        }

        await ensureSocietySubscription(societyId, connection);

        const normalizedPremiumPlanCode = PREMIUM_PLAN_CODES.has(String(premium_plan_code || '').trim().toUpperCase())
            ? String(premium_plan_code || '').trim().toUpperCase()
            : 'PRO_MONTHLY';
        const isPremiumFlow = String(subscription_plan || '').trim().toLowerCase() === 'pro';

        if (isPremiumFlow) {
            const decodedPaymentProof = verifyPaymentProofToken(String(payment_proof_token || '').trim());
            if (!decodedPaymentProof) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Premium payment proof is missing or expired. Please complete payment again.',
                });
            }

            if (decodedPaymentProof.plan_code !== normalizedPremiumPlanCode) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Selected premium plan does not match verified payment.',
                });
            }

            if (Number(decodedPaymentProof.total_flats || 0) !== Number(total_flats || 0)) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Declared units do not match verified payment. Please pay again for updated units.',
                });
            }

            const expectedAmountPaise =
                Number(total_flats || 0) *
                UNIT_PRICE_PAISE_PER_MONTH *
                Number(PREMIUM_DURATION_MONTHS[normalizedPremiumPlanCode] || 1);

            if (Number(decodedPaymentProof.amount_paise || 0) !== Number(expectedAmountPaise || 0)) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'Payment amount mismatch. Please complete premium payment again.',
                });
            }

            const [existingPaymentRows] = await connection.query(
                `SELECT id FROM society_subscription_payments
                 WHERE provider = 'RAZORPAY' AND provider_payment_id = ?
                 LIMIT 1`,
                [String(decodedPaymentProof.payment_id || '').trim()]
            );
            if (existingPaymentRows.length > 0) {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: 'This payment is already linked to another onboarding session.',
                });
            }

            await connection.query(
                `INSERT INTO society_subscription_payments (
                    society_id, provider, plan_code, provider_order_id, provider_payment_id, provider_signature,
                    amount_paise, currency, status, paid_at, metadata_json
                ) VALUES (?, 'RAZORPAY', ?, ?, ?, ?, ?, 'INR', 'captured', NOW(), ?)`,
                [
                    societyId,
                    normalizedPremiumPlanCode,
                    String(decodedPaymentProof.order_id || '').trim() || null,
                    String(decodedPaymentProof.payment_id || '').trim() || null,
                    String(decodedPaymentProof.signature || '').trim() || null,
                    expectedAmountPaise,
                    JSON.stringify({
                        source: 'PUBLIC_ONBOARDING_PREPAY',
                        declared_units: Number(total_flats || 0),
                    }),
                ]
            );

            await activatePaidSubscription({
                societyId,
                planCode: normalizedPremiumPlanCode,
                durationMonths: Number(PREMIUM_DURATION_MONTHS[normalizedPremiumPlanCode] || 1),
                paymentProvider: 'RAZORPAY',
                paymentReference: String(decodedPaymentProof.payment_id || '').trim() || null,
                connection,
            });
        }

        const onboardingToken = jwt.sign(
            {
                purpose: 'PUBLIC_ONBOARDING',
                society_id: societyId,
                plan_code: normalizedPremiumPlanCode,
            },
            process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token',
            { expiresIn: '2h' }
        );

        await connection.commit();
        return res.status(201).json({
            success: true,
            message: 'Society onboarding started successfully. Admin can now login using OTP.',
            societyId,
            onboarding_token: onboardingToken,
            payment_required: false,
            premium_plan_code: isPremiumFlow ? normalizedPremiumPlanCode : null,
            next_step: {
                login_phone: String(admin.phone).trim(),
                login_path: '/',
            },
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('public createSociety error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating society onboarding request' });
    } finally {
        if (connection) connection.release();
    }
};
