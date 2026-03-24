const db = require('./db');

const statements = [
  `ALTER TABLE Flats ADD COLUMN IF NOT EXISTS area_sqft DECIMAL(10,2) NULL AFTER flat_number`,
  `ALTER TABLE Flats ADD COLUMN IF NOT EXISTS flat_type VARCHAR(30) NULL AFTER flat_number`,
  `ALTER TABLE Flats ADD COLUMN IF NOT EXISTS billing_custom_amount DECIMAL(10,2) NULL AFTER area_sqft`,
  `ALTER TABLE Invoices
      MODIFY COLUMN status ENUM('Paid', 'Unpaid', 'Overdue', 'PartiallyPaid', 'Waived') DEFAULT 'Unpaid'`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(50) NULL AFTER payment_method`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS billing_config_id INT NULL AFTER invoice_number`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS billing_type ENUM('MonthlyMaintenance', 'QuarterlyMaintenance', 'YearlyMaintenance', 'OneTimeCharge', 'Penalty', 'Fine') DEFAULT 'MonthlyMaintenance' AFTER billing_config_id`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS billing_frequency ENUM('Monthly', 'Quarterly', 'Yearly', 'OneTime') DEFAULT 'Monthly' AFTER billing_type`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS calculation_method ENUM('Equal', 'AreaBased', 'Custom', 'FlatType') DEFAULT 'Equal' AFTER billing_frequency`,
  `ALTER TABLE Invoices MODIFY COLUMN calculation_method ENUM('Equal', 'AreaBased', 'Custom', 'FlatType') DEFAULT 'Equal'`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS invoice_date DATE NULL AFTER calculation_method`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS generated_at DATETIME NULL AFTER invoice_date`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER generated_at`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS penalty_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER subtotal_amount`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS adjustment_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER penalty_amount`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER adjustment_amount`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS balance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER total_amount`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER balance_amount`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS late_fee_type ENUM('None', 'FlatPerDay', 'FlatOnce', 'PercentOnce') DEFAULT 'None' AFTER paid_amount`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS late_fee_value DECIMAL(10,2) NOT NULL DEFAULT 0.00 AFTER late_fee_type`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS payment_reference VARCHAR(120) NULL AFTER late_fee_value`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS paid_at DATETIME NULL AFTER payment_reference`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS notes TEXT NULL AFTER paid_at`,
  `ALTER TABLE Invoices ADD COLUMN IF NOT EXISTS pdf_url VARCHAR(255) NULL AFTER notes`,
  `CREATE TABLE IF NOT EXISTS Billing_Configs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      society_id INT NOT NULL,
      title VARCHAR(150) NOT NULL,
      description TEXT NULL,
      billing_type ENUM('MonthlyMaintenance', 'QuarterlyMaintenance', 'YearlyMaintenance', 'OneTimeCharge', 'Penalty', 'Fine') DEFAULT 'MonthlyMaintenance',
      frequency ENUM('Monthly', 'Quarterly', 'Yearly', 'OneTime') DEFAULT 'Monthly',
      calculation_method ENUM('Equal', 'AreaBased', 'Custom', 'FlatType') DEFAULT 'Equal',
      base_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      due_day TINYINT NULL,
      auto_generate BOOLEAN DEFAULT FALSE,
      late_fee_type ENUM('None', 'FlatPerDay', 'FlatOnce', 'PercentOnce') DEFAULT 'None',
      late_fee_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      breakdown_json JSON NULL,
      flat_type_amounts_json JSON NULL,
      reminder_days_json JSON NULL,
      is_active BOOLEAN DEFAULT TRUE,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (society_id) REFERENCES Societies(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
   )`,
  `CREATE TABLE IF NOT EXISTS Invoice_Line_Items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      label VARCHAR(150) NOT NULL,
      amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
      calculation_mode ENUM('fixed', 'per_sqft') DEFAULT 'fixed',
      sort_order INT DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES Invoices(id) ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS Invoice_Payments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      payment_method VARCHAR(50) NULL,
      payment_gateway VARCHAR(50) NULL,
      payment_reference VARCHAR(120) NULL,
      paid_by_user_id INT NULL,
      status ENUM('Pending', 'Completed', 'Failed', 'Refunded') DEFAULT 'Completed',
      paid_at DATETIME NULL,
      notes TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES Invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (paid_by_user_id) REFERENCES Users(id) ON DELETE SET NULL
   )`,
  `CREATE TABLE IF NOT EXISTS Invoice_Adjustments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      invoice_id INT NOT NULL,
      adjustment_type ENUM('Discount', 'Waiver', 'Credit') DEFAULT 'Discount',
      amount DECIMAL(10,2) NOT NULL,
      reason TEXT NULL,
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (invoice_id) REFERENCES Invoices(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES Users(id) ON DELETE SET NULL
   )`,
  `ALTER TABLE Billing_Configs ADD COLUMN IF NOT EXISTS flat_type_amounts_json JSON NULL AFTER breakdown_json`,
  `ALTER TABLE Billing_Configs MODIFY COLUMN calculation_method ENUM('Equal', 'AreaBased', 'Custom', 'FlatType') DEFAULT 'Equal'`,
];

async function run() {
  try {
    for (const statement of statements) {
      await db.query(statement);
    }

    await db.query(`UPDATE Invoices SET invoice_date = COALESCE(invoice_date, due_date), generated_at = COALESCE(generated_at, NOW())`);
    await db.query(`UPDATE Invoices SET subtotal_amount = CASE WHEN subtotal_amount = 0 THEN amount - COALESCE(late_fee, 0) ELSE subtotal_amount END`);
    await db.query(`UPDATE Invoices SET penalty_amount = CASE WHEN penalty_amount = 0 THEN COALESCE(late_fee, 0) ELSE penalty_amount END`);
    await db.query(`UPDATE Invoices SET total_amount = CASE WHEN total_amount = 0 THEN amount ELSE total_amount END`);
    await db.query(`UPDATE Invoices SET balance_amount = CASE WHEN balance_amount = 0 AND status <> 'Paid' THEN total_amount ELSE balance_amount END`);
    await db.query(`UPDATE Invoices SET paid_amount = CASE WHEN status = 'Paid' AND paid_amount = 0 THEN total_amount ELSE paid_amount END`);
    await db.query(`UPDATE Invoices SET late_fee_type = CASE WHEN COALESCE(late_fee, 0) > 0 AND late_fee_type = 'None' THEN 'FlatOnce' ELSE late_fee_type END`);
    await db.query(`UPDATE Invoices SET late_fee_value = CASE WHEN late_fee_value = 0 THEN COALESCE(late_fee, 0) ELSE late_fee_value END`);

    console.log('Billing module upgrade completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Billing module upgrade failed:', error);
    process.exit(1);
  }
}

run();
