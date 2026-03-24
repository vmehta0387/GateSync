const dotenv = require('dotenv');
const db = require('./db');

dotenv.config();

async function upgradePushNotifications() {
    try {
        await db.query(`
            CREATE TABLE IF NOT EXISTS User_Device_Tokens (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                expo_push_token VARCHAR(255) NOT NULL UNIQUE,
                installation_id VARCHAR(120) NULL,
                platform ENUM('android', 'ios', 'unknown') DEFAULT 'unknown',
                app_role ENUM('RESIDENT', 'GUARD', 'OTHER') DEFAULT 'OTHER',
                device_name VARCHAR(150) NULL,
                is_active BOOLEAN DEFAULT TRUE,
                last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE
            )
        `);

        await db.query(`
            ALTER TABLE User_Device_Tokens
            MODIFY COLUMN platform ENUM('android', 'ios', 'unknown') DEFAULT 'unknown'
        `);

        await db.query(`
            ALTER TABLE User_Device_Tokens
            MODIFY COLUMN app_role ENUM('RESIDENT', 'GUARD', 'OTHER') DEFAULT 'OTHER'
        `);

        await db.query(`
            ALTER TABLE User_Device_Tokens
            ADD COLUMN IF NOT EXISTS installation_id VARCHAR(120) NULL
        `);

        await db.query(`
            ALTER TABLE User_Device_Tokens
            ADD COLUMN IF NOT EXISTS device_name VARCHAR(150) NULL
        `);

        await db.query(`
            ALTER TABLE User_Device_Tokens
            ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE
        `);

        await db.query(`
            ALTER TABLE User_Device_Tokens
            ADD COLUMN IF NOT EXISTS last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP
        `);

        console.log('Push notifications upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Push notifications upgrade failed:', error);
        process.exit(1);
    }
}

upgradePushNotifications();
