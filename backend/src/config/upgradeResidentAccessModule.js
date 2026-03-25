const db = require('./db');

(async () => {
  try {
    const [columns] = await db.query(
      `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'user_flats'
         AND COLUMN_NAME = 'access_role'`
    );

    if (!columns.length) {
      await db.query(
        `ALTER TABLE user_flats
         ADD COLUMN access_role ENUM('Primary', 'Secondary') NOT NULL DEFAULT 'Primary' AFTER type`
      );
    }

    await db.query(`UPDATE user_flats SET access_role = 'Primary' WHERE access_role IS NULL OR access_role = ''`);

    console.log('Resident access roles upgraded successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to upgrade resident access roles:', error);
    process.exit(1);
  }
})();
