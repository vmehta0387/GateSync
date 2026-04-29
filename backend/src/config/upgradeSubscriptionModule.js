const db = require('./db');

const TRIAL_DAYS = Number(process.env.SUBSCRIPTION_TRIAL_DAYS || 60);
const GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS || 7);

async function columnExists(tableName, columnName) {
    const [rows] = await db.query(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [tableName, columnName]
    );
    return rows.length > 0;
}

async function addColumnIfMissing(tableName, definition) {
    const [columnName] = definition.trim().split(/\s+/);
    const exists = await columnExists(tableName, columnName);
    if (!exists) {
        await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
    }
}

async function runUpgrade() {
    try {
        console.log('Applying GateSync subscription module upgrade...');

        await db.query(`
            CREATE TABLE IF NOT EXISTS society_subscriptions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                society_id INT NOT NULL UNIQUE,
                plan_code ENUM('TRIAL', 'PRO_MONTHLY', 'PRO_YEARLY', 'ENTERPRISE') NOT NULL DEFAULT 'TRIAL',
                state ENUM('TRIAL_ACTIVE', 'ACTIVE', 'GRACE', 'LOCKED', 'CANCELLED') NOT NULL DEFAULT 'TRIAL_ACTIVE',
                trial_started_at DATETIME NULL,
                trial_expires_at DATETIME NULL,
                grace_ends_at DATETIME NULL,
                activated_at DATETIME NULL,
                current_period_start DATETIME NULL,
                current_period_end DATETIME NULL,
                locked_at DATETIME NULL,
                payment_provider ENUM('NONE', 'RAZORPAY', 'MANUAL') NOT NULL DEFAULT 'NONE',
                last_payment_reference VARCHAR(120) NULL,
                last_payment_at DATETIME NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS society_subscription_payments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                society_id INT NOT NULL,
                provider ENUM('RAZORPAY', 'MANUAL') NOT NULL DEFAULT 'RAZORPAY',
                plan_code ENUM('PRO_MONTHLY', 'PRO_YEARLY', 'ENTERPRISE') NOT NULL DEFAULT 'PRO_MONTHLY',
                provider_order_id VARCHAR(120) NULL,
                provider_payment_id VARCHAR(120) NULL,
                provider_signature VARCHAR(255) NULL,
                amount_paise INT NOT NULL,
                currency VARCHAR(10) NOT NULL DEFAULT 'INR',
                status ENUM('created', 'authorized', 'captured', 'failed', 'refunded') NOT NULL DEFAULT 'created',
                paid_at DATETIME NULL,
                metadata_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_subscription_payments_society (society_id),
                INDEX idx_subscription_payments_order (provider_order_id),
                FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
            )
        `);

        await db.query(`
            CREATE TABLE IF NOT EXISTS society_subscription_reminders (
                id INT AUTO_INCREMENT PRIMARY KEY,
                society_id INT NOT NULL,
                trigger_code VARCHAR(50) NOT NULL,
                channel ENUM('SMS', 'PUSH', 'EMAIL', 'WHATSAPP') NOT NULL DEFAULT 'SMS',
                delivered_to VARCHAR(30) NULL,
                message TEXT NOT NULL,
                sent_at DATETIME NOT NULL DEFAULT NOW(),
                status ENUM('sent', 'failed') NOT NULL DEFAULT 'sent',
                provider_response_json JSON NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE KEY uniq_subscription_reminder (society_id, trigger_code, channel, delivered_to),
                FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
            )
        `);

        await addColumnIfMissing('societies', "subscription_plan ENUM('Free', 'Pro', 'Enterprise') DEFAULT 'Free'");

        await db.query(
            `INSERT INTO society_subscriptions (
                society_id, plan_code, state, trial_started_at, trial_expires_at, grace_ends_at, current_period_start, current_period_end
            )
            SELECT s.id, 'TRIAL', 'TRIAL_ACTIVE', s.created_at,
                   DATE_ADD(s.created_at, INTERVAL ? DAY),
                   DATE_ADD(s.created_at, INTERVAL ? DAY),
                   s.created_at,
                   DATE_ADD(s.created_at, INTERVAL ? DAY)
            FROM societies s
            LEFT JOIN society_subscriptions ss ON ss.society_id = s.id
            WHERE ss.id IS NULL`,
            [TRIAL_DAYS, TRIAL_DAYS + GRACE_DAYS, TRIAL_DAYS]
        );

        await db.query(`
            UPDATE society_subscriptions
            SET state = CASE
                WHEN state = 'ACTIVE' AND current_period_end IS NOT NULL AND NOW() > current_period_end AND (grace_ends_at IS NULL OR NOW() > grace_ends_at) THEN 'LOCKED'
                WHEN state = 'ACTIVE' AND current_period_end IS NOT NULL AND NOW() > current_period_end AND grace_ends_at IS NOT NULL AND NOW() <= grace_ends_at THEN 'GRACE'
                WHEN state = 'TRIAL_ACTIVE' AND trial_expires_at IS NOT NULL AND NOW() > trial_expires_at AND (grace_ends_at IS NULL OR NOW() > grace_ends_at) THEN 'LOCKED'
                WHEN state = 'TRIAL_ACTIVE' AND trial_expires_at IS NOT NULL AND NOW() > trial_expires_at AND grace_ends_at IS NOT NULL AND NOW() <= grace_ends_at THEN 'GRACE'
                WHEN state = 'GRACE' AND grace_ends_at IS NOT NULL AND NOW() > grace_ends_at THEN 'LOCKED'
                ELSE state
            END
        `);

        console.log('Subscription module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Subscription module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
