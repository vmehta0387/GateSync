const db = require('../config/db');

const TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || 60);
const GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);

function addDays(date, days) {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + Number(days || 0));
    return copy;
}

function diffInWholeDays(targetDate, now) {
    const diffMs = new Date(targetDate).getTime() - new Date(now).getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function toIsoOrNull(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
}

async function ensureSocietySubscription(societyId, connection = db) {
    if (!societyId) return null;

    let rows;
    try {
        [rows] = await connection.query(
            'SELECT * FROM society_subscriptions WHERE society_id = ? LIMIT 1',
            [societyId]
        );
    } catch (error) {
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return null;
        }
        throw error;
    }
    if (rows.length > 0) return rows[0];

    const now = new Date();
    const trialExpiresAt = addDays(now, TRIAL_DAYS);
    const graceEndsAt = addDays(trialExpiresAt, GRACE_DAYS);

    try {
        await connection.query(
            `INSERT INTO society_subscriptions (
                society_id, plan_code, state, trial_started_at, trial_expires_at, grace_ends_at, current_period_start, current_period_end
            ) VALUES (?, 'TRIAL', 'TRIAL_ACTIVE', ?, ?, ?, ?, ?)`,
            [societyId, now, trialExpiresAt, graceEndsAt, now, trialExpiresAt]
        );
    } catch (error) {
        if (error && error.code === 'ER_NO_SUCH_TABLE') {
            return null;
        }
        throw error;
    }

    let freshRows;
    [freshRows] = await connection.query(
        'SELECT * FROM society_subscriptions WHERE society_id = ? LIMIT 1',
        [societyId]
    );
    return freshRows[0] || null;
}

function evaluateSubscriptionState(row, now = new Date()) {
    if (!row) {
        return {
            state: 'TRIAL_ACTIVE',
            is_locked: false,
            is_trial: true,
            is_paid: false,
            trial_days_left: TRIAL_DAYS,
            grace_days_left: 0,
            current_period_end: null,
            trial_expires_at: null,
            grace_ends_at: null,
        };
    }

    const trialExpiresAt = row.trial_expires_at ? new Date(row.trial_expires_at) : null;
    const graceEndsAt = row.grace_ends_at ? new Date(row.grace_ends_at) : null;
    const currentPeriodEnd = row.current_period_end ? new Date(row.current_period_end) : null;

    let derivedState = row.state || 'TRIAL_ACTIVE';

    if (derivedState === 'TRIAL_ACTIVE') {
        if (trialExpiresAt && now > trialExpiresAt) {
            derivedState = graceEndsAt && now <= graceEndsAt ? 'GRACE' : 'LOCKED';
        }
    } else if (derivedState === 'ACTIVE') {
        if (currentPeriodEnd && now > currentPeriodEnd) {
            derivedState = graceEndsAt && now <= graceEndsAt ? 'GRACE' : 'LOCKED';
        }
    } else if (derivedState === 'GRACE') {
        if (!graceEndsAt || now > graceEndsAt) {
            derivedState = 'LOCKED';
        }
    }

    return {
        state: derivedState,
        is_locked: derivedState === 'LOCKED' || derivedState === 'CANCELLED',
        is_trial: row.plan_code === 'TRIAL' || derivedState === 'TRIAL_ACTIVE',
        is_paid: row.plan_code !== 'TRIAL' && (derivedState === 'ACTIVE' || derivedState === 'GRACE'),
        trial_days_left: trialExpiresAt ? Math.max(0, diffInWholeDays(trialExpiresAt, now)) : 0,
        grace_days_left: graceEndsAt ? Math.max(0, diffInWholeDays(graceEndsAt, now)) : 0,
        current_period_end: toIsoOrNull(currentPeriodEnd),
        trial_expires_at: toIsoOrNull(trialExpiresAt),
        grace_ends_at: toIsoOrNull(graceEndsAt),
    };
}

async function refreshSubscriptionState(societyId, connection = db) {
    if (!societyId) return null;

    const row = await ensureSocietySubscription(societyId, connection);
    if (!row) return null;

    const snapshot = evaluateSubscriptionState(row);
    if (snapshot.state !== row.state) {
        await connection.query(
            `UPDATE society_subscriptions
             SET state = ?,
                 locked_at = CASE WHEN ? = 'LOCKED' AND locked_at IS NULL THEN NOW() ELSE locked_at END
             WHERE society_id = ?`,
            [snapshot.state, snapshot.state, societyId]
        );
    }

    return { ...row, ...snapshot };
}

async function getSocietySubscriptionSnapshot(societyId, connection = db) {
    if (!societyId) return null;

    const row = await ensureSocietySubscription(societyId, connection);
    if (!row) return null;

    const snapshot = evaluateSubscriptionState(row);
    if (snapshot.state !== row.state) {
        await connection.query(
            `UPDATE society_subscriptions
             SET state = ?,
                 locked_at = CASE WHEN ? = 'LOCKED' AND locked_at IS NULL THEN NOW() ELSE locked_at END
             WHERE society_id = ?`,
            [snapshot.state, snapshot.state, societyId]
        );
    }

    const [rows] = await connection.query(
        `SELECT id, society_id, plan_code, state, trial_started_at, trial_expires_at, grace_ends_at,
                current_period_start, current_period_end, activated_at, locked_at, payment_provider,
                last_payment_reference, last_payment_at, created_at, updated_at
         FROM society_subscriptions
         WHERE society_id = ?
         LIMIT 1`,
        [societyId]
    );

    if (rows.length === 0) return null;
    const current = rows[0];
    return {
        ...current,
        ...evaluateSubscriptionState(current),
    };
}

async function activatePaidSubscription({
    societyId,
    planCode,
    durationMonths,
    paymentProvider = 'RAZORPAY',
    paymentReference = null,
    connection = db,
}) {
    const row = await ensureSocietySubscription(societyId, connection);
    if (!row) return null;

    const now = new Date();
    const months = Math.max(1, Number(durationMonths || 1));
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + months);
    const graceEndsAt = addDays(periodEnd, GRACE_DAYS);

    await connection.query(
        `UPDATE society_subscriptions
         SET plan_code = ?,
             state = 'ACTIVE',
             trial_started_at = COALESCE(trial_started_at, ?),
             activated_at = COALESCE(activated_at, ?),
             current_period_start = ?,
             current_period_end = ?,
             grace_ends_at = ?,
             locked_at = NULL,
             payment_provider = ?,
             last_payment_reference = ?,
             last_payment_at = ?
         WHERE society_id = ?`,
        [
            planCode,
            now,
            now,
            now,
            periodEnd,
            graceEndsAt,
            paymentProvider,
            paymentReference,
            now,
            societyId,
        ]
    );

    return getSocietySubscriptionSnapshot(societyId, connection);
}

module.exports = {
    TRIAL_DAYS,
    GRACE_DAYS,
    ensureSocietySubscription,
    evaluateSubscriptionState,
    refreshSubscriptionState,
    getSocietySubscriptionSnapshot,
    activatePaidSubscription,
};
