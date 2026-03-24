const db = require('./db');

const statements = [
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS created_by_user_id INT NULL AFTER flat_id`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS ticket_id VARCHAR(30) NULL AFTER created_by_user_id`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS category_id INT NULL AFTER ticket_id`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS attachments_json JSON NULL AFTER category`,
    `ALTER TABLE Complaints MODIFY COLUMN status ENUM('Open', 'InProgress', 'OnHold', 'Resolved', 'Closed') DEFAULT 'Open'`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS resolved_at DATETIME NULL AFTER sla_deadline`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS closed_at DATETIME NULL AFTER resolved_at`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS escalation_level INT DEFAULT 0 AFTER closed_at`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS escalated_to_type ENUM('Admin', 'Committee') NULL AFTER escalation_level`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS escalated_to_user_id INT NULL AFTER escalated_to_type`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS escalated_to_committee_id INT NULL AFTER escalated_to_user_id`,
    `ALTER TABLE Complaints ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`,
    `CREATE TABLE IF NOT EXISTS Complaint_Categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        society_id INT NOT NULL,
        name VARCHAR(100) NOT NULL,
        description TEXT NULL,
        default_priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        sla_hours INT DEFAULT 24,
        is_default BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_complaint_category (society_id, name),
        FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Complaint_Assignees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        complaint_id INT NOT NULL,
        assignee_type ENUM('User', 'Staff', 'Committee') DEFAULT 'User',
        user_id INT NULL,
        staff_id INT NULL,
        committee_id INT NULL,
        is_primary BOOLEAN DEFAULT FALSE,
        assigned_by_user_id INT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES Complaints(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by_user_id) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Complaint_Messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        complaint_id INT NOT NULL,
        sender_type ENUM('Resident', 'Admin', 'Staff', 'System') DEFAULT 'Resident',
        sender_user_id INT NULL,
        sender_staff_id INT NULL,
        message TEXT NOT NULL,
        attachments_json JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES Complaints(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_user_id) REFERENCES Users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Complaint_Status_History (
        id INT AUTO_INCREMENT PRIMARY KEY,
        complaint_id INT NOT NULL,
        status ENUM('Open', 'InProgress', 'OnHold', 'Resolved', 'Closed') NOT NULL,
        note TEXT NULL,
        changed_by_user_id INT NULL,
        changed_by_staff_id INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (complaint_id) REFERENCES Complaints(id) ON DELETE CASCADE,
        FOREIGN KEY (changed_by_user_id) REFERENCES Users(id) ON DELETE SET NULL
    )`,
];

async function runUpgrade() {
    try {
        console.log('Applying GatePulse complaint module upgrade...');

        for (const statement of statements) {
            await db.query(statement);
        }

        const [societies] = await db.query(`SELECT id FROM Societies`);
        for (const society of societies) {
            const values = [
                ['Plumbing', 'Water leakage, pipe issues, or drainage problems.', 'High', 24],
                ['Electrical', 'Power faults, wiring, or lighting issues.', 'High', 12],
                ['Security', 'Security incident, breach, or guard concern.', 'High', 2],
                ['Housekeeping', 'Cleaning, garbage, or common-area upkeep.', 'Medium', 24],
                ['Lift issue', 'Lift outage, malfunction, or safety concern.', 'High', 4],
                ['Noise complaint', 'Disturbance, nuisance, or community noise issue.', 'Medium', 12],
                ['Others', 'General complaint category.', 'Medium', 24],
            ].map((item) => [society.id, item[0], item[1], item[2], item[3], true, true]);

            await db.query(
                `INSERT IGNORE INTO Complaint_Categories (
                    society_id, name, description, default_priority, sla_hours, is_default, is_active
                ) VALUES ?`,
                [values]
            );
        }

        const [complaints] = await db.query(`SELECT id FROM Complaints WHERE ticket_id IS NULL OR ticket_id = ''`);
        for (const complaint of complaints) {
            const ticketId = `GP-CMP-${String(complaint.id).padStart(6, '0')}`;
            await db.query(`UPDATE Complaints SET ticket_id = ? WHERE id = ?`, [ticketId, complaint.id]);
        }

        console.log('Complaint module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Complaint module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
