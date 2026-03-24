require('dotenv').config({ path: '../../.env' }); // Adjust if needed
const db = require('./db');

async function seedAdmin() {
    try {
        const adminPhone = '9999999999';
        // Use INSERT IGNORE to prevent duplicate errors if run multiple times
        await db.query("INSERT IGNORE INTO Users (phone_number, role, status) VALUES (?, 'ADMIN', 'ACTIVE')", [adminPhone]);
        console.log('Successfully seeded admin user with phone number:', adminPhone);
        process.exit(0);
    } catch (err) {
        console.error('Failed to seed admin:', err);
        process.exit(1);
    }
}

seedAdmin();
