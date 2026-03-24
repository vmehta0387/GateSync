const db = require('./db');

const statements = [
    `CREATE TABLE IF NOT EXISTS Guard_Shifts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        society_id INT NOT NULL,
        security_staff_id INT NULL,
        guard_user_id INT NULL,
        shift_label VARCHAR(100) NOT NULL,
        scheduled_start DATETIME NOT NULL,
        scheduled_end DATETIME NOT NULL,
        actual_start DATETIME NULL,
        actual_end DATETIME NULL,
        status ENUM('Scheduled', 'OnDuty', 'Completed', 'Missed', 'Cancelled') DEFAULT 'Scheduled',
        notes TEXT NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE,
        FOREIGN KEY (security_staff_id) REFERENCES Staff(id) ON DELETE SET NULL,
        FOREIGN KEY (guard_user_id) REFERENCES Users(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Security_Incidents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        society_id INT NOT NULL,
        reported_by_user_id INT NULL,
        assigned_guard_user_id INT NULL,
        title VARCHAR(255) NOT NULL,
        category ENUM('Access', 'Visitor', 'Patrol', 'Safety', 'Equipment', 'Emergency', 'Other') DEFAULT 'Other',
        severity ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
        status ENUM('Open', 'InReview', 'Resolved', 'Closed') DEFAULT 'Open',
        location VARCHAR(255) NULL,
        description TEXT NOT NULL,
        attachments_json JSON NULL,
        resolution_note TEXT NULL,
        related_visitor_log_id INT NULL,
        occurred_at DATETIME NOT NULL,
        resolved_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE,
        FOREIGN KEY (reported_by_user_id) REFERENCES Users(id) ON DELETE SET NULL,
        FOREIGN KEY (assigned_guard_user_id) REFERENCES Users(id) ON DELETE SET NULL,
        FOREIGN KEY (related_visitor_log_id) REFERENCES Visitor_Logs(id) ON DELETE SET NULL
    )`,
    `ALTER TABLE Guard_Shifts MODIFY COLUMN guard_user_id INT NULL`,
    `ALTER TABLE Guard_Shifts ADD COLUMN IF NOT EXISTS security_staff_id INT NULL AFTER society_id`,
];

async function runUpgrade() {
    try {
        console.log('Applying GatePulse security module upgrade...');

        for (const statement of statements) {
            await db.query(statement);
        }

        try {
            await db.query(`ALTER TABLE Guard_Shifts ADD CONSTRAINT fk_guard_shifts_staff FOREIGN KEY (security_staff_id) REFERENCES Staff(id) ON DELETE SET NULL`);
        } catch (error) {
            if (!String(error.message || '').includes('Duplicate') && !String(error.message || '').includes('already exists')) {
                throw error;
            }
        }

        await db.query(
            `UPDATE Guard_Shifts gs
             LEFT JOIN Staff s ON s.linked_user_id = gs.guard_user_id
             SET gs.security_staff_id = COALESCE(gs.security_staff_id, s.id)
             WHERE gs.security_staff_id IS NULL`
        );

        console.log('Security module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Security module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
