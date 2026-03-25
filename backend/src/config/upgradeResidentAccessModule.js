const db = require('./db');

const queries = [
  `ALTER TABLE user_flats ADD COLUMN IF NOT EXISTS access_role ENUM('Primary', 'Secondary') NOT NULL DEFAULT 'Primary' AFTER type`,
  `UPDATE user_flats SET access_role = 'Primary' WHERE access_role IS NULL OR access_role = ''`,
];

(async () => {
  try {
    for (const query of queries) {
      // eslint-disable-next-line no-await-in-loop
      await db.query(query);
    }

    console.log('Resident access roles upgraded successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Failed to upgrade resident access roles:', error);
    process.exit(1);
  }
})();
