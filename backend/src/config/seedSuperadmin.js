require('dotenv').config({ path: '../../.env' });
const db = require('./db');

async function seedSuperAdmin() {
    try {
        const phone = '9999999999';
        await db.query(`
            INSERT IGNORE INTO users (phone_number, role, status, society_id) 
            VALUES (?, 'SUPERADMIN', 'ACTIVE', NULL)
        `, [phone]);
        console.log('Successfully seeded SUPERADMIN with phone number:', phone);
        process.exit(0);
    } catch (err) {
        console.error('Failed to seed SUPERADMIN:', err);
        process.exit(1);
    }
}
seedSuperAdmin();
