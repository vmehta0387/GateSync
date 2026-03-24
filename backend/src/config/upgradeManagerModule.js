const db = require('./db');

async function upgradeManagerModule() {
    try {
        await db.query(`
            ALTER TABLE Users
            MODIFY COLUMN role ENUM('SUPERADMIN', 'ADMIN', 'MANAGER', 'GUARD', 'RESIDENT') NOT NULL
        `);

        console.log('Manager role upgrade completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('Manager role upgrade failed:', error.message);
        process.exit(1);
    }
}

upgradeManagerModule();
