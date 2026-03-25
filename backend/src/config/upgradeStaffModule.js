const db = require('./db');

const statements = [
    `ALTER TABLE staff
        MODIFY COLUMN type ENUM('Maid', 'Cook', 'Driver', 'Cleaner', 'Helper', 'Security', 'Electrician', 'Plumber', 'Other') NOT NULL`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS assignment_scope ENUM('SOCIETY', 'FLAT_SPECIFIC') DEFAULT 'FLAT_SPECIFIC' AFTER type`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS linked_user_id INT NULL AFTER assignment_scope`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(255) NULL AFTER phone`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS guard_login_phone VARCHAR(15) NULL AFTER phone`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS blacklist_reason TEXT NULL AFTER is_blacklisted`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_start_time TIME NULL AFTER shift_timing`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_end_time TIME NULL AFTER work_start_time`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS work_days JSON NULL AFTER work_end_time`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS allow_entry_without_approval BOOLEAN DEFAULT FALSE AFTER work_days`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS require_daily_approval BOOLEAN DEFAULT FALSE AFTER allow_entry_without_approval`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS auto_entry_enabled BOOLEAN DEFAULT FALSE AFTER require_daily_approval`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS validity_start_date DATE NULL AFTER auto_entry_enabled`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS validity_end_date DATE NULL AFTER validity_start_date`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS id_type ENUM('Aadhaar', 'PAN', 'Passport') NULL AFTER validity_end_date`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS id_number VARCHAR(100) NULL AFTER id_type`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS id_document_url VARCHAR(255) NULL AFTER id_number`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS emergency_name VARCHAR(100) NULL AFTER id_document_url`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS emergency_phone VARCHAR(20) NULL AFTER emergency_name`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS resident_entry_notification BOOLEAN DEFAULT TRUE AFTER emergency_phone`,
    `ALTER TABLE staff ADD COLUMN IF NOT EXISTS missed_visit_alerts BOOLEAN DEFAULT TRUE AFTER resident_entry_notification`,
    `CREATE TABLE IF NOT EXISTS staff_flats (
        staff_id INT NOT NULL,
        flat_id INT NOT NULL,
        PRIMARY KEY (staff_id, flat_id),
        CONSTRAINT fk_staff_flats_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
        CONSTRAINT fk_staff_flats_flat FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
    )`,
    `UPDATE staff
     SET assignment_scope = 'SOCIETY'
     WHERE assignment_scope IS NULL OR (
        assignment_scope = 'FLAT_SPECIFIC'
        AND type IN ('Security', 'Cleaner')
        AND id NOT IN (SELECT DISTINCT staff_id FROM staff_flats)
     )`,
    `UPDATE staff s
     INNER JOIN users u ON u.id = s.linked_user_id
     SET s.guard_login_phone = COALESCE(NULLIF(s.guard_login_phone, ''), u.phone_number)
     WHERE s.linked_user_id IS NOT NULL`,
];

async function upgradeStaffModule() {
    try {
        console.log('Applying GatePulse staff module upgrade...');
        for (const statement of statements) {
            await db.query(statement);
        }
        try {
            await db.query(`ALTER TABLE staff ADD CONSTRAINT fk_staff_linked_user FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL`);
        } catch (error) {
            if (!String(error.message || '').includes('Duplicate') && !String(error.message || '').includes('already exists')) {
                throw error;
            }
        }
        console.log('staff module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('staff module upgrade failed:', error);
        process.exit(1);
    }
}

upgradeStaffModule();
