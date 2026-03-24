const db = require('./db');

const statements = [
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS notice_type ENUM('General', 'Urgent', 'Event', 'Maintenance', 'Emergency') DEFAULT 'General' AFTER content`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS audience_type ENUM('AllResidents', 'Tower', 'Flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents' AFTER notice_type`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS audience_filters JSON NULL AFTER audience_type`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS attachments_json JSON NULL AFTER audience_filters`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS publish_at DATETIME NULL AFTER attachments_json`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS published_at DATETIME NULL AFTER publish_at`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE AFTER published_at`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS requires_read_receipt BOOLEAN DEFAULT TRUE AFTER is_pinned`,
    `ALTER TABLE Notices ADD COLUMN IF NOT EXISTS status ENUM('Draft', 'Scheduled', 'Published', 'Archived') DEFAULT 'Published' AFTER requires_read_receipt`,
    `UPDATE Notices SET published_at = COALESCE(published_at, created_at), status = COALESCE(status, 'Published')`,
    `CREATE TABLE IF NOT EXISTS Notice_Reads (
        notice_id INT NOT NULL,
        user_id INT NOT NULL,
        read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (notice_id, user_id),
        FOREIGN KEY (notice_id) REFERENCES Notices(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )`,
    `ALTER TABLE Messages ADD COLUMN IF NOT EXISTS subject VARCHAR(255) NULL AFTER receiver_id`,
    `ALTER TABLE Messages ADD COLUMN IF NOT EXISTS message_type ENUM('Direct', 'Group', 'Emergency') DEFAULT 'Direct' AFTER priority`,
    `ALTER TABLE Messages ADD COLUMN IF NOT EXISTS attachments_json JSON NULL AFTER message_type`,
    `ALTER TABLE Messages ADD COLUMN IF NOT EXISTS read_at DATETIME NULL AFTER attachments_json`,
    `ALTER TABLE Messages ADD COLUMN IF NOT EXISTS delivered_at DATETIME NULL AFTER read_at`,
    `CREATE TABLE IF NOT EXISTS Communication_Polls (
        id INT AUTO_INCREMENT PRIMARY KEY,
        society_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        poll_type ENUM('YesNo', 'SingleChoice') DEFAULT 'YesNo',
        target_scope ENUM('AllResidents', 'Tower', 'Flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents',
        target_filters JSON NULL,
        starts_at DATETIME NULL,
        ends_at DATETIME NULL,
        status ENUM('Draft', 'Live', 'Closed') DEFAULT 'Live',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Communication_Poll_Options (
        id INT AUTO_INCREMENT PRIMARY KEY,
        poll_id INT NOT NULL,
        option_text VARCHAR(255) NOT NULL,
        FOREIGN KEY (poll_id) REFERENCES Communication_Polls(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Communication_Poll_Responses (
        poll_id INT NOT NULL,
        user_id INT NOT NULL,
        option_id INT NOT NULL,
        responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (poll_id, user_id),
        FOREIGN KEY (poll_id) REFERENCES Communication_Polls(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
        FOREIGN KEY (option_id) REFERENCES Communication_Poll_Options(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Community_Events (
        id INT AUTO_INCREMENT PRIMARY KEY,
        society_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        venue VARCHAR(255) NULL,
        target_scope ENUM('AllResidents', 'Tower', 'Flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents',
        target_filters JSON NULL,
        start_at DATETIME NOT NULL,
        end_at DATETIME NULL,
        rsvp_required BOOLEAN DEFAULT TRUE,
        status ENUM('Draft', 'Scheduled', 'Live', 'Closed') DEFAULT 'Scheduled',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Event_RSVPs (
        event_id INT NOT NULL,
        user_id INT NOT NULL,
        status ENUM('Going', 'Maybe', 'NotGoing') DEFAULT 'Going',
        responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (event_id, user_id),
        FOREIGN KEY (event_id) REFERENCES Community_Events(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Shared_Documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        society_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        category ENUM('Rules', 'Minutes', 'Bills', 'Forms', 'Other') DEFAULT 'Other',
        file_url VARCHAR(255) NOT NULL,
        target_scope ENUM('AllResidents', 'Tower', 'Flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents',
        target_filters JSON NULL,
        is_pinned BOOLEAN DEFAULT FALSE,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
];

async function runUpgrade() {
    try {
        console.log('Applying GatePulse communication module upgrade...');

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

        console.log('Communication module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Communication module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
