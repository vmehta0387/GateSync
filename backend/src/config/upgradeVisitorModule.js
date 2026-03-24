const db = require('./db');

const statements = [
    `ALTER TABLE Visitors ADD COLUMN IF NOT EXISTS is_watchlisted BOOLEAN DEFAULT FALSE AFTER is_blacklisted`,
    `ALTER TABLE Visitors ADD COLUMN IF NOT EXISTS watchlist_reason TEXT NULL AFTER is_watchlisted`,
    `ALTER TABLE Visitor_Logs
        MODIFY COLUMN purpose ENUM('Guest', 'Delivery', 'Cab', 'Service', 'Unknown') NOT NULL`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS entry_method ENUM('PreApproved', 'WalkIn', 'DeliveryAuto') DEFAULT 'WalkIn' AFTER approval_type`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS delivery_company VARCHAR(100) NULL AFTER entry_method`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS vehicle_number VARCHAR(30) NULL AFTER delivery_company`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS visitor_photo_url VARCHAR(255) NULL AFTER vehicle_number`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS exit_photo_url VARCHAR(255) NULL AFTER visitor_photo_url`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS contactless_delivery BOOLEAN DEFAULT FALSE AFTER exit_photo_url`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS requested_by_user_id INT NULL AFTER contactless_delivery`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS approval_requested_at DATETIME NULL AFTER requested_by_user_id`,
    `ALTER TABLE Visitor_Logs ADD COLUMN IF NOT EXISTS approval_decision_at DATETIME NULL AFTER approval_requested_at`,
    `ALTER TABLE Visitor_Logs
        ADD CONSTRAINT fk_visitor_logs_requested_by
        FOREIGN KEY (requested_by_user_id) REFERENCES Users(id) ON DELETE SET NULL`,
    `UPDATE Visitor_Logs SET entry_method = 'PreApproved' WHERE status IN ('Approved', 'CheckedIn', 'CheckedOut') AND passcode IS NOT NULL`,
];

async function runUpgrade() {
    try {
        console.log('Applying GatePulse visitor module upgrade...');

        for (const statement of statements) {
            try {
                await db.query(statement);
            } catch (error) {
                const duplicateKeyMessage = String(error.message || '').toLowerCase();
                if (duplicateKeyMessage.includes('duplicate') || duplicateKeyMessage.includes('already exists')) {
                    continue;
                }
                throw error;
            }
        }

        console.log('Visitor module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Visitor module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
