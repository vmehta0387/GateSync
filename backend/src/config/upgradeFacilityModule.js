const db = require('./db');

const statements = [
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER type`,
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS capacity INT DEFAULT 1 AFTER description`,
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS max_booking_hours INT DEFAULT 2 AFTER rules`,
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS advance_booking_days INT DEFAULT 7 AFTER max_booking_hours`,
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS cancellation_hours INT DEFAULT 6 AFTER advance_booking_days`,
    `ALTER TABLE Facilities MODIFY COLUMN pricing DECIMAL(10,2) DEFAULT 0.00`,
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT FALSE AFTER pricing`,
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE AFTER is_paid`,
    `ALTER TABLE Facilities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `ALTER TABLE Facility_Bookings ADD COLUMN IF NOT EXISTS society_id INT NULL AFTER id`,
    `ALTER TABLE Facility_Bookings ADD COLUMN IF NOT EXISTS guest_count INT DEFAULT 1 AFTER user_id`,
    `ALTER TABLE Facility_Bookings ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) DEFAULT 0.00 AFTER guest_count`,
    `ALTER TABLE Facility_Bookings ADD COLUMN IF NOT EXISTS payment_status ENUM('NotRequired', 'Pending', 'Paid', 'Failed') DEFAULT 'NotRequired' AFTER total_amount`,
    `ALTER TABLE Facility_Bookings ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER payment_status`,
    `ALTER TABLE Facility_Bookings ADD COLUMN IF NOT EXISTS cancelled_at DATETIME NULL AFTER status`,
    `ALTER TABLE Facility_Bookings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
    `CREATE TABLE IF NOT EXISTS Facility_Maintenance_Blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        facility_id INT NOT NULL,
        start_time DATETIME NOT NULL,
        end_time DATETIME NOT NULL,
        reason TEXT NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (facility_id) REFERENCES Facilities(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
];

async function runUpgrade() {
    try {
        console.log('Applying GatePulse facilities module upgrade...');

        for (const statement of statements) {
            await db.query(statement);
        }

        await db.query(
            `UPDATE Facility_Bookings fb
             INNER JOIN Facilities f ON f.id = fb.facility_id
             SET fb.society_id = f.society_id
             WHERE fb.society_id IS NULL`
        );

        await db.query(`UPDATE Facility_Bookings SET status = 'Confirmed' WHERE status IN ('Pending', 'Approved')`);
        await db.query(`ALTER TABLE Facility_Bookings MODIFY COLUMN status ENUM('Confirmed', 'Cancelled', 'Rejected', 'Completed') DEFAULT 'Confirmed'`);
        await db.query(`UPDATE Facility_Bookings SET payment_status = 'NotRequired' WHERE payment_status IS NULL`);
        await db.query(`UPDATE Facility_Bookings SET guest_count = 1 WHERE guest_count IS NULL OR guest_count <= 0`);
        await db.query(`UPDATE Facilities SET capacity = 1 WHERE capacity IS NULL OR capacity <= 0`);
        await db.query(`UPDATE Facilities SET max_booking_hours = 2 WHERE max_booking_hours IS NULL OR max_booking_hours <= 0`);
        await db.query(`UPDATE Facilities SET advance_booking_days = 7 WHERE advance_booking_days IS NULL OR advance_booking_days <= 0`);
        await db.query(`UPDATE Facilities SET cancellation_hours = 6 WHERE cancellation_hours IS NULL OR cancellation_hours < 0`);

        console.log('Facilities module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Facilities module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
