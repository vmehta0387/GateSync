const db = require('./db');
const { sendSms } = require('../services/smsService');
const { getSocietySubscriptionSnapshot } = require('../services/subscriptionService');

function getReminderTriggerCodes(snapshot) {
    const triggers = [];
    const trialDays = Number(snapshot.trial_days_left || 0);
    const graceDays = Number(snapshot.grace_days_left || 0);

    if (snapshot.state === 'TRIAL_ACTIVE' && [15, 7, 3, 1].includes(trialDays)) {
        triggers.push(`TRIAL_D_MINUS_${trialDays}`);
    }

    if (snapshot.state === 'GRACE' && [7, 3, 1].includes(graceDays)) {
        triggers.push(`GRACE_D_MINUS_${graceDays}`);
    }

    if (snapshot.state === 'LOCKED') {
        triggers.push('LOCKED_UPGRADE_REQUIRED');
    }

    return triggers;
}

function buildReminderMessage({ societyName, snapshot }) {
    if (snapshot.state === 'LOCKED') {
        return `${societyName}: Your GateSync trial has ended and account is locked. Upgrade now to unlock all operations.`;
    }

    if (snapshot.state === 'GRACE') {
        return `${societyName}: Trial ended. ${snapshot.grace_days_left} day(s) grace left. Upgrade to avoid account lock.`;
    }

    return `${societyName}: Your free trial ends in ${snapshot.trial_days_left} day(s). Upgrade to Premium and continue without interruption.`;
}

async function wasAlreadySent({ societyId, triggerCode, phone }) {
    const [rows] = await db.query(
        `SELECT id FROM society_subscription_reminders
         WHERE society_id = ? AND trigger_code = ? AND channel = 'SMS' AND delivered_to = ?
         LIMIT 1`,
        [societyId, triggerCode, phone]
    );
    return rows.length > 0;
}

async function logReminder({ societyId, triggerCode, phone, message, status, providerResponse }) {
    await db.query(
        `INSERT INTO society_subscription_reminders (
            society_id, trigger_code, channel, delivered_to, message, status, provider_response_json
        ) VALUES (?, ?, 'SMS', ?, ?, ?, ?)`,
        [
            societyId,
            triggerCode,
            phone,
            message,
            status,
            providerResponse ? JSON.stringify(providerResponse) : null,
        ]
    );
}

async function run() {
    try {
        console.log('Sending subscription reminders...');

        const [societies] = await db.query(
            `SELECT id, name
             FROM societies
             WHERE status = 'ACTIVE'
             ORDER BY id ASC`
        );

        let sentCount = 0;

        for (const society of societies) {
            const snapshot = await getSocietySubscriptionSnapshot(society.id);
            if (!snapshot) continue;

            const triggerCodes = getReminderTriggerCodes(snapshot);
            if (triggerCodes.length === 0) continue;

            const [admins] = await db.query(
                `SELECT phone_number
                 FROM users
                 WHERE society_id = ? AND role IN ('ADMIN', 'MANAGER') AND status = 'ACTIVE'`,
                [society.id]
            );

            if (!admins.length) continue;
            const message = buildReminderMessage({ societyName: society.name, snapshot });

            for (const admin of admins) {
                const phone = String(admin.phone_number || '').trim();
                if (!phone) continue;

                for (const triggerCode of triggerCodes) {
                    if (await wasAlreadySent({ societyId: society.id, triggerCode, phone })) {
                        continue;
                    }

                    const smsResult = await sendSms({ to: phone, body: message });
                    await logReminder({
                        societyId: society.id,
                        triggerCode,
                        phone,
                        message,
                        status: smsResult.success ? 'sent' : 'failed',
                        providerResponse: smsResult,
                    });
                    if (smsResult.success) sentCount += 1;
                }
            }
        }

        console.log(`Subscription reminders processed. Sent: ${sentCount}`);
        process.exit(0);
    } catch (error) {
        console.error('sendSubscriptionReminders failed:', error);
        process.exit(1);
    }
}

run();
