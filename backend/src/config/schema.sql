CREATE DATABASE IF NOT EXISTS gatepulse;
USE gatepulse;

-- Clean wipe for multi-tenant re-architecture
DROP TABLE IF EXISTS facility_maintenance_blocks, facility_bookings, facilities, security_incidents, guard_shifts, guard_activity, committee_vote_responses, committee_vote_options, committee_votes, committee_documents, committee_tasks, committee_messages, committee_members, committees, complaint_status_history, complaint_messages, complaint_assignees, complaint_categories, messages, deliveries, invoices, staff_logs, staff_flats, staff, notice_reads, notices, complaints, visitor_logs, visitors, vehicles, family_members, user_flats, flats, gates, user_device_tokens, users, societies;
CREATE TABLE IF NOT EXISTS societies (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    society_type ENUM('Apartment', 'Villa', 'Mixed') DEFAULT 'Apartment',
    towers_count INT DEFAULT 0,
    floors_per_tower INT DEFAULT 0,
    total_flats INT DEFAULT 0,
    amenities JSON,
    config_settings JSON,
    subscription_plan ENUM('Free', 'Pro', 'Enterprise') DEFAULT 'Free',
    status ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NULL,
    name VARCHAR(100),
    email VARCHAR(255),
    phone_number VARCHAR(15) UNIQUE NOT NULL,
    role ENUM('SUPERADMIN', 'ADMIN', 'MANAGER', 'GUARD', 'RESIDENT') NOT NULL,
    status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
    kyc_status ENUM('Pending', 'Verified', 'Rejected') DEFAULT 'Pending',
    id_type ENUM('Aadhaar', 'PAN', 'Passport') NULL,
    id_number VARCHAR(100) NULL,
    id_proof_url VARCHAR(255) NULL,
    emergency_name VARCHAR(100) NULL,
    emergency_relation VARCHAR(50) NULL,
    emergency_phone VARCHAR(20) NULL,
    push_notifications BOOLEAN DEFAULT TRUE,
    sms_alerts BOOLEAN DEFAULT TRUE,
    whatsapp_alerts BOOLEAN DEFAULT FALSE,
    can_approve_visitors BOOLEAN DEFAULT TRUE,
    can_view_bills BOOLEAN DEFAULT TRUE,
    can_raise_complaints BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_device_tokens (
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
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS gates (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    gate_type ENUM('Main', 'Service', 'Other') DEFAULT 'Main',
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS flats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    block_name VARCHAR(10) NOT NULL,
    flat_number VARCHAR(10) NOT NULL,
    flat_type VARCHAR(30) NULL,
    area_sqft DECIMAL(10,2) NULL,
    billing_custom_amount DECIMAL(10,2) NULL,
    UNIQUE(society_id, block_name, flat_number),
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_flats (
    user_id INT,
    flat_id INT,
    type ENUM('Owner', 'Tenant', 'Family', 'Co-owner') NOT NULL,
    access_role ENUM('Primary', 'Secondary') NOT NULL DEFAULT 'Primary',
    move_in_date DATE NULL,
    move_out_date DATE NULL,
    PRIMARY KEY (user_id, flat_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS vehicles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    flat_id INT NOT NULL,
    vehicle_type ENUM('Car', 'Bike') NOT NULL,
    vehicle_number VARCHAR(20) NOT NULL,
    parking_slot VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS family_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    age INT,
    relation VARCHAR(50),
    phone VARCHAR(15),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visitors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    phone_number VARCHAR(15),
    photo_url VARCHAR(255),
    is_vip BOOLEAN DEFAULT FALSE,
    is_blacklisted BOOLEAN DEFAULT FALSE,
    is_watchlisted BOOLEAN DEFAULT FALSE,
    watchlist_reason TEXT NULL,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS visitor_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    visitor_id INT,
    flat_id INT,
    status ENUM('Pending', 'Approved', 'Denied', 'CheckedIn', 'CheckedOut') DEFAULT 'Pending',
    purpose ENUM('Guest', 'Delivery', 'Cab', 'Service', 'Unknown') NOT NULL,
    expected_time DATETIME,
    passcode VARCHAR(10),
    approval_type ENUM('Auto', 'Manual') DEFAULT 'Manual',
    entry_method ENUM('PreApproved', 'WalkIn', 'DeliveryAuto') DEFAULT 'WalkIn',
    delivery_company VARCHAR(100),
    vehicle_number VARCHAR(30),
    visitor_photo_url VARCHAR(255),
    exit_photo_url VARCHAR(255),
    contactless_delivery BOOLEAN DEFAULT FALSE,
    requested_by_user_id INT NULL,
    approval_requested_at DATETIME NULL,
    approval_decision_at DATETIME NULL,
    entry_time DATETIME,
    exit_time DATETIME,
    FOREIGN KEY (visitor_id) REFERENCES visitors(id) ON DELETE CASCADE,
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE,
    FOREIGN KEY (requested_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS complaints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    flat_id INT,
    created_by_user_id INT NULL,
    ticket_id VARCHAR(30) NOT NULL UNIQUE,
    category_id INT NULL,
    description TEXT NOT NULL,
    category VARCHAR(50), 
    attachments_json JSON NULL,
    status ENUM('Open', 'InProgress', 'OnHold', 'Resolved', 'Closed') DEFAULT 'Open',
    assigned_to INT,
    priority ENUM('Low', 'Medium', 'High') DEFAULT 'Medium',
    sla_deadline DATETIME,
    resolved_at DATETIME NULL,
    closed_at DATETIME NULL,
    escalation_level INT DEFAULT 0,
    escalated_to_type ENUM('Admin', 'Committee') NULL,
    escalated_to_user_id INT NULL,
    escalated_to_committee_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS complaint_categories (
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
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaint_assignees (
    id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    assignee_type ENUM('User', 'staff', 'Committee') DEFAULT 'User',
    user_id INT NULL,
    staff_id INT NULL,
    committee_id INT NULL,
    is_primary BOOLEAN DEFAULT FALSE,
    assigned_by_user_id INT NULL,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS complaint_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    sender_type ENUM('Resident', 'Admin', 'staff', 'System') DEFAULT 'Resident',
    sender_user_id INT NULL,
    sender_staff_id INT NULL,
    message TEXT NOT NULL,
    attachments_json JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS complaint_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    complaint_id INT NOT NULL,
    status ENUM('Open', 'InProgress', 'OnHold', 'Resolved', 'Closed') NOT NULL,
    note TEXT NULL,
    changed_by_user_id INT NULL,
    changed_by_staff_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (complaint_id) REFERENCES complaints(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    notice_type ENUM('General', 'Urgent', 'Event', 'Maintenance', 'Emergency') DEFAULT 'General',
    audience_type ENUM('AllResidents', 'Tower', 'flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents',
    audience_filters JSON NULL,
    attachments_json JSON NULL,
    publish_at DATETIME NULL,
    published_at DATETIME NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    requires_read_receipt BOOLEAN DEFAULT TRUE,
    status ENUM('Draft', 'Scheduled', 'Published', 'Archived') DEFAULT 'Published',
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS notice_reads (
    notice_id INT NOT NULL,
    user_id INT NOT NULL,
    read_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (notice_id, user_id),
    FOREIGN KEY (notice_id) REFERENCES notices(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    type ENUM('Maid', 'Cook', 'Driver', 'Cleaner', 'Helper', 'Security', 'Electrician', 'Plumber', 'Other') NOT NULL,
    assignment_scope ENUM('SOCIETY', 'FLAT_SPECIFIC') DEFAULT 'FLAT_SPECIFIC',
    linked_user_id INT NULL,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(15),
    guard_login_phone VARCHAR(15) NULL,
    profile_photo_url VARCHAR(255),
    is_blacklisted BOOLEAN DEFAULT FALSE,
    blacklist_reason TEXT,
    shift_timing VARCHAR(50),
    work_start_time TIME NULL,
    work_end_time TIME NULL,
    work_days JSON NULL,
    allow_entry_without_approval BOOLEAN DEFAULT FALSE,
    require_daily_approval BOOLEAN DEFAULT FALSE,
    auto_entry_enabled BOOLEAN DEFAULT FALSE,
    validity_start_date DATE NULL,
    validity_end_date DATE NULL,
    id_type ENUM('Aadhaar', 'PAN', 'Passport') NULL,
    id_number VARCHAR(100) NULL,
    id_document_url VARCHAR(255) NULL,
    emergency_name VARCHAR(100) NULL,
    emergency_phone VARCHAR(20) NULL,
    resident_entry_notification BOOLEAN DEFAULT TRUE,
    missed_visit_alerts BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (linked_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS staff_flats (
    staff_id INT NOT NULL,
    flat_id INT NOT NULL,
    PRIMARY KEY (staff_id, flat_id),
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS staff_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    staff_id INT,
    entry_time DATETIME,
    exit_time DATETIME,
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoices (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    flat_id INT,
    amount DECIMAL(10,2) NOT NULL,
    month_year VARCHAR(7) NOT NULL,
    status ENUM('Paid', 'Unpaid', 'Overdue', 'PartiallyPaid', 'Waived') DEFAULT 'Unpaid',
    due_date DATE,
    late_fee DECIMAL(10,2) DEFAULT 0.00,
    payment_method VARCHAR(50),
    invoice_number VARCHAR(50),
    billing_config_id INT NULL,
    billing_type ENUM('MonthlyMaintenance', 'QuarterlyMaintenance', 'YearlyMaintenance', 'OneTimeCharge', 'Penalty', 'Fine') DEFAULT 'MonthlyMaintenance',
    billing_frequency ENUM('Monthly', 'Quarterly', 'Yearly', 'OneTime') DEFAULT 'Monthly',
    calculation_method ENUM('Equal', 'AreaBased', 'Custom', 'FlatType') DEFAULT 'Equal',
    invoice_date DATE NULL,
    generated_at DATETIME NULL,
    subtotal_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    penalty_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    adjustment_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    balance_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    paid_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    late_fee_type ENUM('None', 'FlatPerDay', 'FlatOnce', 'PercentOnce') DEFAULT 'None',
    late_fee_value DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    payment_reference VARCHAR(120) NULL,
    paid_at DATETIME NULL,
    notes TEXT NULL,
    pdf_url VARCHAR(255) NULL,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS billing_configs (
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
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_line_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    label VARCHAR(150) NOT NULL,
    amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    calculation_mode ENUM('fixed', 'per_sqft') DEFAULT 'fixed',
    sort_order INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS invoice_payments (
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
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS invoice_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    invoice_id INT NOT NULL,
    adjustment_type ENUM('Discount', 'Waiver', 'Credit') DEFAULT 'Discount',
    amount DECIMAL(10,2) NOT NULL,
    reason TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- NEW TABLES FOR ADMIN FEATURES --

CREATE TABLE IF NOT EXISTS deliveries (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    flat_id INT,
    company_name VARCHAR(100),
    delivery_person VARCHAR(100),
    status ENUM('Expected', 'Arrived', 'Delivered', 'Failed') DEFAULT 'Expected',
    entry_time DATETIME,
    exit_time DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (flat_id) REFERENCES flats(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    sender_id INT,
    receiver_id INT,
    subject VARCHAR(255),
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    priority ENUM('Normal', 'High', 'Emergency') DEFAULT 'Normal',
    message_type ENUM('Direct', 'Group', 'Emergency') DEFAULT 'Direct',
    attachments_json JSON NULL,
    read_at DATETIME NULL,
    delivered_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS communication_polls (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    poll_type ENUM('YesNo', 'SingleChoice') DEFAULT 'YesNo',
    target_scope ENUM('AllResidents', 'Tower', 'flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents',
    target_filters JSON NULL,
    starts_at DATETIME NULL,
    ends_at DATETIME NULL,
    status ENUM('Draft', 'Live', 'Closed') DEFAULT 'Live',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS communication_poll_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    poll_id INT NOT NULL,
    option_text VARCHAR(255) NOT NULL,
    FOREIGN KEY (poll_id) REFERENCES communication_polls(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS communication_poll_responses (
    poll_id INT NOT NULL,
    user_id INT NOT NULL,
    option_id INT NOT NULL,
    responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (poll_id, user_id),
    FOREIGN KEY (poll_id) REFERENCES communication_polls(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES communication_poll_options(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    venue VARCHAR(255) NULL,
    target_scope ENUM('AllResidents', 'Tower', 'flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents',
    target_filters JSON NULL,
    start_at DATETIME NOT NULL,
    end_at DATETIME NULL,
    rsvp_required BOOLEAN DEFAULT TRUE,
    status ENUM('Draft', 'Scheduled', 'Live', 'Closed') DEFAULT 'Scheduled',
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS event_rsvps (
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('Going', 'Maybe', 'NotGoing') DEFAULT 'Going',
    responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES community_events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS shared_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    category ENUM('Rules', 'Minutes', 'Bills', 'Forms', 'Other') DEFAULT 'Other',
    file_url VARCHAR(255) NOT NULL,
    target_scope ENUM('AllResidents', 'Tower', 'flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers') DEFAULT 'AllResidents',
    target_filters JSON NULL,
    is_pinned BOOLEAN DEFAULT FALSE,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS committees (
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
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS committee_members (
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
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS committee_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    committee_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT NOT NULL,
    attachments_json JSON NULL,
    is_decision_log BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS committee_tasks (
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
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
    FOREIGN KEY (assigned_member_id) REFERENCES committee_members(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS committee_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    committee_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    category ENUM('Minutes', 'Budget', 'Policy', 'TaskFile', 'Other') DEFAULT 'Other',
    file_url VARCHAR(255) NOT NULL,
    uploaded_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS committee_votes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    committee_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    decision_type ENUM('YesNo', 'SingleChoice') DEFAULT 'YesNo',
    status ENUM('Draft', 'Live', 'Closed') DEFAULT 'Live',
    closes_at DATETIME NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (committee_id) REFERENCES committees(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS committee_vote_options (
    id INT AUTO_INCREMENT PRIMARY KEY,
    vote_id INT NOT NULL,
    option_text VARCHAR(255) NOT NULL,
    FOREIGN KEY (vote_id) REFERENCES committee_votes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS committee_vote_responses (
    vote_id INT NOT NULL,
    user_id INT NOT NULL,
    option_id INT NOT NULL,
    responded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (vote_id, user_id),
    FOREIGN KEY (vote_id) REFERENCES committee_votes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (option_id) REFERENCES committee_vote_options(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS facilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50),
    description TEXT NULL,
    capacity INT DEFAULT 1,
    rules TEXT,
    max_booking_hours INT DEFAULT 2,
    advance_booking_days INT DEFAULT 7,
    cancellation_hours INT DEFAULT 6,
    pricing DECIMAL(10,2) DEFAULT 0.00,
    is_paid BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS facility_bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    facility_id INT NOT NULL,
    user_id INT NOT NULL,
    guest_count INT DEFAULT 1,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    payment_status ENUM('NotRequired', 'Pending', 'Paid', 'Failed') DEFAULT 'NotRequired',
    notes TEXT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    status ENUM('Confirmed', 'Cancelled', 'Rejected', 'Completed') DEFAULT 'Confirmed',
    cancelled_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS facility_maintenance_blocks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    facility_id INT NOT NULL,
    start_time DATETIME NOT NULL,
    end_time DATETIME NOT NULL,
    reason TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS guard_activity (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guard_id INT NOT NULL,
    action_type ENUM('Patrol', 'Incident', 'Mistake', 'ShiftStart', 'ShiftEnd') NOT NULL,
    description TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (guard_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS guard_shifts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    security_staff_id INT NULL,
    guard_user_id INT NULL,
    shift_label VARCHAR(100) NOT NULL,
    scheduled_start DATETIME NOT NULL,
    scheduled_end DATETIME NOT NULL,
    actual_start DATETIME NULL,
    actual_end DATETIME NULL,
    status ENUM('Scheduled', 'OnDuty', 'Completed', 'Missed', 'Cancelled') DEFAULT 'Scheduled',
    notes TEXT NULL,
    created_by INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (security_staff_id) REFERENCES staff(id) ON DELETE SET NULL,
    FOREIGN KEY (guard_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS security_incidents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    society_id INT NOT NULL,
    reported_by_user_id INT NULL,
    assigned_guard_user_id INT NULL,
    title VARCHAR(255) NOT NULL,
    category ENUM('Access', 'Visitor', 'Patrol', 'Safety', 'Equipment', 'Emergency', 'Other') DEFAULT 'Other',
    severity ENUM('Low', 'Medium', 'High', 'Critical') DEFAULT 'Medium',
    status ENUM('Open', 'InReview', 'Resolved', 'Closed') DEFAULT 'Open',
    location VARCHAR(255) NULL,
    description TEXT NOT NULL,
    attachments_json JSON NULL,
    resolution_note TEXT NULL,
    related_visitor_log_id INT NULL,
    occurred_at DATETIME NOT NULL,
    resolved_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (society_id) REFERENCES societies(id) ON DELETE CASCADE,
    FOREIGN KEY (reported_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (assigned_guard_user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (related_visitor_log_id) REFERENCES visitor_logs(id) ON DELETE SET NULL
);
