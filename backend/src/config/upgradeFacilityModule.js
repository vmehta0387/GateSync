const db = require('./db');

const statements = [
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER type`,
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS capacity INT DEFAULT 1 AFTER description`,
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS max_booking_hours INT DEFAULT 2 AFTER rules`,
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS advance_booking_days INT DEFAULT 7 AFTER max_booking_hours`,
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS cancellation_hours INT DEFAULT 6 AFTER advance_booking_days`,
    `ALTER TABLE facilities MODIFY COLUMN pricing DECIMAL(10,2) DEFAULT 0.00`,
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE AFTER pricing`,
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER is_paid`,
    `ALTER TABLE facilities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS society_id INT NULL AFTER id`,
    `ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS guest_count INT DEFAULT 1 AFTER user_id`,
    `ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0.00 AFTER guest_count`,
    `ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS payment_status ENUM('NotRequired', 'Pending', 'Paid', 'Failed') DEFAULT 'NotRequired' AFTER total_amount`,
    `ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER payment_status`,
    `ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER status`,
    `ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `CREATE TABLE IF NOT EXISTS facility_maintenance_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        reason TEXT NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    )`,
];

async function runUpgrade() {
    try {
        console.log('Applying GatePulse facilities module upgrade...');

        for (const statement of statements) {
            await db.query(statement);
        }

        await db.query(
            `UPDATE facility_bookings fb
             INNER JOIN facilities f ON f.id = fb.facility_id
             SET fb.society_id = f.society_id
             WHERE fb.society_id IS NULL`
        );

        await db.query(`UPDATE facility_bookings SET status = 'Confirmed' WHERE status IN ('Pending', 'Approved')`);
        await db.query(`ALTER TABLE facility_bookings MODIFY COLUMN status ENUM('Confirmed', 'Cancelled', 'Rejected', 'Completed') DEFAULT 'Confirmed'`);
        await db.query(`UPDATE facility_bookings SET payment_status = 'NotRequired' WHERE payment_status IS NULL`);
        await db.query(`UPDATE facility_bookings SET guest_count = 1 WHERE guest_count IS NULL OR guest_count <= 0`);
        await db.query(`UPDATE facilities SET capacity = 1 WHERE capacity IS NULL OR capacity <= 0`);
        await db.query(`UPDATE facilities SET max_booking_hours = 2 WHERE max_booking_hours IS NULL OR max_booking_hours <= 0`);
        await db.query(`UPDATE facilities SET advance_booking_days = 7 WHERE advance_booking_days IS NULL OR advance_booking_days <= 0`);
        await db.query(`UPDATE facilities SET cancellation_hours = 6 WHERE cancellation_hours IS NULL OR cancellation_hours < 0`);

        console.log('facilities module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('facilities module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
