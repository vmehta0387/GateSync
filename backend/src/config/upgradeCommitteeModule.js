const db = require('./db');

const statements = [
    `CREATE TABLE IF NOT EXISTS Committees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        society_id INT NOT NULL,
        committee_type VARCHAR(100) NOT NULL,
        name VARCHAR(255) NOT NULL,
        description TEXT NULL,
        is_public BOOLEAN DEFAULT TRUE,
        start_date DATE NULL,
        end_date DATE NULL,
        status ENUM('Draft', 'Active', 'Inactive', 'Archived') DEFAULT 'Active',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Committee_Members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        committee_id INT NOT NULL,
        user_id INT NOT NULL,
        role_title VARCHAR(100) NOT NULL,
        permission_scope ENUM('Full', 'Communication', 'Finance', 'Tasks', 'ViewOnly', 'Custom') DEFAULT 'ViewOnly',
        permissions_json JSON NULL,
        tenure_start_date DATE NULL,
        tenure_end_date DATE NULL,
        is_primary_contact BOOLEAN DEFAULT FALSE,
        status ENUM('Active', 'Inactive') DEFAULT 'Active',
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_committee_member (committee_id, user_id),
        FOREIGN KEY (committee_id) REFERENCES Committees(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Committee_Messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        committee_id INT NOT NULL,
        sender_id INT NOT NULL,
        content TEXT NOT NULL,
        attachments_json JSON NULL,
        is_decision_log BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (committee_id) REFERENCES Committees(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES Users(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Committee_Tasks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        committee_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        assigned_member_id INT NULL,
        due_date DATE NULL,
        status ENUM('Open', 'InProgress', 'Completed', 'Blocked') DEFAULT 'Open',
        priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (committee_id) REFERENCES Committees(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_member_id) REFERENCES Committee_Members(id) ON DELETE SET NULL,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Committee_Documents (
        id INT AUTO_INCREMENT PRIMARY KEY,
        committee_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        category ENUM('Minutes', 'Budget', 'Policy', 'TaskFile', 'Other') DEFAULT 'Other',
        file_url VARCHAR(255) NOT NULL,
        uploaded_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (committee_id) REFERENCES Committees(id) ON DELETE CASCADE,
        FOREIGN KEY (uploaded_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Committee_Votes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        committee_id INT NOT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT NULL,
        decision_type ENUM('YesNo', 'SingleChoice') DEFAULT 'YesNo',
        status ENUM('Draft', 'Live', 'Closed') DEFAULT 'Live',
        closes_at DATETIME NULL,
        created_by INT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (committee_id) REFERENCES Committees(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
    )`,
    `CREATE TABLE IF NOT EXISTS Committee_Vote_Options (
        id INT AUTO_INCREMENT PRIMARY KEY,
        vote_id INT NOT NULL,
        option_text VARCHAR(255) NOT NULL,
        FOREIGN KEY (vote_id) REFERENCES Committee_Votes(id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS Committee_Vote_Responses (
        vote_id INT NOT NULL,
        user_id INT NOT NULL,
        option_id INT NOT NULL,
        responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (vote_id, user_id),
        FOREIGN KEY (vote_id) REFERENCES Committee_Votes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE,
        FOREIGN KEY (option_id) REFERENCES Committee_Vote_Options(id) ON DELETE CASCADE
    )`,
];

async function runUpgrade() {
    try {
        console.log('Applying GatePulse committee module upgrade...');

        for (const statement of statements) {
            await db.query(statement);
        }

        console.log('Committee module upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Committee module upgrade failed:', error);
        process.exit(1);
    }
}

runUpgrade();
