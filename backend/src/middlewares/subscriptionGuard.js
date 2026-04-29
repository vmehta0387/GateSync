const jwt = require('jsonwebtoken');
const { getSocietySubscriptionSnapshot } = require('../services/subscriptionService');

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const ALLOWED_WHEN_LOCKED_PREFIXES = [
    '/api/v1/subscriptions',
    '/api/v1/auth/push-token',
];

function isAllowedWhenLocked(url) {
    return ALLOWED_WHEN_LOCKED_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function tryDecodeToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) return null;
    try {
        return jwt.verify(token, process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token');
    } catch (error) {
        return null;
    }
}

exports.enforceSubscriptionGuard = async (req, res, next) => {
    try {
        if (!WRITE_METHODS.has(req.method)) {
            return next();
        }

        const path = req.originalUrl || req.url || '';
        if (isAllowedWhenLocked(path)) {
            return next();
        }

        const decoded = tryDecodeToken(req.headers.authorization || '');
        if (!decoded || !decoded.society_id) {
            return next();
        }

        const snapshot = await getSocietySubscriptionSnapshot(decoded.society_id);
        if (!snapshot || !snapshot.is_locked) {
            return next();
        }

        return res.status(402).json({
            success: false,
            code: 'SUBSCRIPTION_LOCKED',
            message: 'Your free trial has ended. Please upgrade to unlock and continue using GateSync.',
            subscription: {
                state: snapshot.state,
                plan_code: snapshot.plan_code,
                trial_expires_at: snapshot.trial_expires_at,
                grace_ends_at: snapshot.grace_ends_at,
            },
            action: {
                cta: 'Unlock Now',
                billing_path: '/billing/upgrade',
            },
        });
    } catch (error) {
        console.error('subscription guard error:', error);
        return next();
    }
};
