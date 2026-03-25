const db = require('../config/db');
const path = require('path');
const { buildUploadPublicPath } = require('../config/uploads');

const STAFF_TYPES = ['Maid', 'Cook', 'Driver', 'Cleaner', 'Helper', 'Security', 'Electrician', 'Plumber', 'Other'];
const ID_TYPES = ['Aadhaar', 'PAN', 'Passport'];
const VALID_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ASSIGNMENT_SCOPES = ['SOCIETY', 'FLAT_SPECIFIC'];

function normalizePhone(phone) {
    return String(phone || '').replace(/\D/g, '');
}

function normalizeOptionalString(value) {
    const normalized = String(value || '').trim();
    return normalized || null;
}

function normalizeBoolean(value, fallback = false) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
        if (['false', '0', 'no', 'n'].includes(normalized)) return false;
    }
    return fallback;
}

function normalizeDayList(value) {
    const rawDays = Array.isArray(value)
        ? value
        : String(value || '')
            .split(',')
            .map((day) => day.trim())
            .filter(Boolean);

    const uniqueDays = [...new Set(rawDays)].filter((day) => VALID_DAYS.includes(day));
    return uniqueDays;
}

function normalizeFlatIds(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(
        value
            .map((flatId) => Number(flatId))
            .filter((flatId) => Number.isInteger(flatId) && flatId > 0)
    )];
}

function formatDate(value) {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
}

function mapFlatRow(row) {
    return {
        id: row.id,
        block_name: row.block_name,
        flat_number: row.flat_number,
        label: `${row.block_name}-${row.flat_number}`,
    };
}

function buildUploadedFilePayload(req, file) {
    const relativePath = buildUploadPublicPath(file.path);
    return {
        file_name: file.filename,
        file_path: relativePath,
        url: `${req.protocol}://${req.get('host')}${relativePath}`,
        mime_type: file.mimetype,
        size: file.size,
    };
}

async function getSocietyFlats(societyId) {
    const [flats] = await db.query(
        `SELECT id, block_name, flat_number
         FROM flats
         WHERE society_id = ?
         ORDER BY block_name ASC, flat_number ASC`,
        [societyId]
    );

    return flats.map(mapFlatRow);
}

async function getStaffById(id, societyId) {
    const [rows] = await db.query(
        `SELECT
            s.id,
            s.society_id,
            s.type,
            s.assignment_scope,
            s.linked_user_id,
            s.name,
            s.phone,
            s.guard_login_phone,
            s.profile_photo_url,
            s.is_blacklisted,
            s.blacklist_reason,
            s.shift_timing,
            s.work_start_time,
            s.work_end_time,
            s.work_days,
            s.allow_entry_without_approval,
            s.require_daily_approval,
            s.auto_entry_enabled,
            s.validity_start_date,
            s.validity_end_date,
            s.id_type,
            s.id_number,
            s.id_document_url,
            s.emergency_name,
            s.emergency_phone,
            s.resident_entry_notification,
            s.missed_visit_alerts,
            guard_user.status AS linked_guard_status
         FROM staff s
         LEFT JOIN users guard_user ON guard_user.id = s.linked_user_id
         WHERE s.id = ? AND s.society_id = ?`,
        [id, societyId]
    );

    return rows[0] || null;
}

async function getFlatAssignments(staffIds) {
    if (!staffIds.length) {
        return new Map();
    }

    const [rows] = await db.query(
        `SELECT sf.staff_id, f.id, f.block_name, f.flat_number
         FROM staff_flats sf
         INNER JOIN flats f ON f.id = sf.flat_id
         WHERE sf.staff_id IN (?) 
         ORDER BY f.block_name ASC, f.flat_number ASC`,
        [staffIds]
    );

    const assignments = new Map();

    rows.forEach((row) => {
        if (!assignments.has(row.staff_id)) {
            assignments.set(row.staff_id, []);
        }

        assignments.get(row.staff_id).push(mapFlatRow(row));
    });

    return assignments;
}

function mapStaffRow(row, assignedFlats = []) {
    const workDays = row.work_days
        ? Array.isArray(row.work_days)
            ? row.work_days
            : JSON.parse(row.work_days)
        : [];

    return {
        id: row.id,
        type: row.type,
        assignment_scope: row.assignment_scope || 'FLAT_SPECIFIC',
        linked_user_id: row.linked_user_id || null,
        has_guard_login: Boolean(row.linked_user_id),
        linked_guard_status: row.linked_guard_status || '',
        name: row.name,
        phone: row.phone,
        guard_login_phone: row.guard_login_phone || '',
        profile_photo_url: row.profile_photo_url || '',
        is_blacklisted: Boolean(row.is_blacklisted),
        blacklist_reason: row.blacklist_reason || '',
        shift_timing: row.shift_timing || '',
        work_start_time: row.work_start_time || '',
        work_end_time: row.work_end_time || '',
        work_days: workDays,
        allow_entry_without_approval: Boolean(row.allow_entry_without_approval),
        require_daily_approval: Boolean(row.require_daily_approval),
        auto_entry_enabled: Boolean(row.auto_entry_enabled),
        validity_start_date: row.validity_start_date ? formatDate(row.validity_start_date) : '',
        validity_end_date: row.validity_end_date ? formatDate(row.validity_end_date) : '',
        id_type: row.id_type || '',
        id_number: row.id_number || '',
        id_document_url: row.id_document_url || '',
        emergency_name: row.emergency_name || '',
        emergency_phone: row.emergency_phone || '',
        resident_entry_notification: Boolean(row.resident_entry_notification),
        missed_visit_alerts: Boolean(row.missed_visit_alerts),
        assigned_flats: row.assignment_scope === 'SOCIETY' ? [] : assignedFlats,
        assigned_flat_ids: row.assignment_scope === 'SOCIETY' ? [] : assignedFlats.map((flat) => flat.id),
        total_visits: Number(row.total_visits || 0),
        late_entries: Number(row.late_entries || 0),
        active_log_id: row.active_log_id || null,
        active_entry_time: row.active_entry_time || null,
        last_entry_time: row.last_entry_time || null,
        last_exit_time: row.last_exit_time || null,
        is_inside: Boolean(row.active_log_id),
    };
}

async function replaceStaffFlatAssignments(connection, staffId, flatIds) {
    await connection.query(`DELETE FROM staff_flats WHERE staff_id = ?`, [staffId]);

    if (flatIds.length > 0) {
        const values = flatIds.map((flatId) => [staffId, flatId]);
        await connection.query(`INSERT INTO staff_flats (staff_id, flat_id) VALUES ?`, [values]);
    }
}

async function getLinkedGuardUserByPhone(connection, societyId, phone) {
    const [rows] = await connection.query(
        `SELECT id, society_id, role, status, phone_number, name
         FROM users
         WHERE phone_number = ?`,
        [phone]
    );

    if (!rows.length) {
        return null;
    }

    const user = rows[0];
    if (user.society_id !== societyId || user.role !== 'GUARD') {
        return { conflict: true, user };
    }

    return user;
}

async function ensureGuardUserNotLinkedElsewhere(connection, userId, staffId) {
    const [rows] = await connection.query(
        `SELECT id FROM staff WHERE linked_user_id = ? AND id <> ? LIMIT 1`,
        [userId, staffId]
    );

    return rows.length === 0;
}

async function syncLinkedGuardUser(connection, { societyId, staffId, linkedUserId, name, phone, shouldBeActive }) {
    const normalizedLoginPhone = normalizePhone(phone);
    if (!normalizedLoginPhone) {
        throw new Error('Guard login needs a valid login phone number.');
    }

    const existingGuardUser = await getLinkedGuardUserByPhone(connection, societyId, normalizedLoginPhone);
    if (existingGuardUser?.conflict) {
        const conflictRole = existingGuardUser.user?.role || 'USER';
        throw new Error(`This phone number already belongs to a ${conflictRole} account. Guard login needs a unique phone number.`);
    }

    if (linkedUserId) {
        if (existingGuardUser?.id && existingGuardUser.id !== linkedUserId) {
            throw new Error('This guard login is already linked to another staff profile');
        }

        await connection.query(
            `UPDATE users
             SET society_id = ?, name = ?, phone_number = ?, role = 'GUARD', status = ?
             WHERE id = ?`,
            [societyId, name, normalizedLoginPhone, shouldBeActive ? 'ACTIVE' : 'INACTIVE', linkedUserId]
        );
        return linkedUserId;
    }

    const linkedGuardUserId = existingGuardUser?.id;
    if (linkedGuardUserId) {
        const available = await ensureGuardUserNotLinkedElsewhere(connection, linkedGuardUserId, staffId);
        if (!available) {
            throw new Error('This guard login is already linked to another staff profile');
        }
    }
    const nextUserId = linkedGuardUserId || (
        await connection.query(
            `INSERT INTO users (society_id, name, email, phone_number, role, status)
             VALUES (?, ?, '', ?, 'GUARD', ?)`,
            [societyId, name, normalizedLoginPhone, shouldBeActive ? 'ACTIVE' : 'INACTIVE']
        )
    )[0].insertId;

    if (linkedGuardUserId) {
        await connection.query(
            `UPDATE users
             SET name = ?, status = ?
             WHERE id = ?`,
            [name, shouldBeActive ? 'ACTIVE' : 'INACTIVE', linkedGuardUserId]
        );
    }

    await connection.query(`UPDATE staff SET linked_user_id = ? WHERE id = ? AND society_id = ?`, [nextUserId, staffId, societyId]);
    return nextUserId;
}

async function validateFlatAssignments(connection, societyId, flatIds) {
    if (!flatIds.length) {
        return { success: true };
    }

    const [rows] = await connection.query(
        `SELECT id
         FROM flats
         WHERE society_id = ? AND id IN (?)`,
        [societyId, flatIds]
    );

    if (rows.length !== flatIds.length) {
        return { success: false, message: 'One or more assigned flats are invalid for this society' };
    }

    return { success: true };
}

function validateStaffPayload(payload) {
    const type = String(payload.type || '').trim();
    const assignment_scope = String(payload.assignment_scope || 'FLAT_SPECIFIC').trim().toUpperCase();
    const name = String(payload.name || '').trim();
    const phone = normalizePhone(payload.phone);
    const guard_login_phone = payload.guard_login_phone ? normalizePhone(payload.guard_login_phone) : null;
    const profile_photo_url = normalizeOptionalString(payload.profile_photo_url);
    const blacklist_reason = normalizeOptionalString(payload.blacklist_reason);
    const shift_timing = normalizeOptionalString(payload.shift_timing);
    const work_start_time = normalizeOptionalString(payload.work_start_time);
    const work_end_time = normalizeOptionalString(payload.work_end_time);
    const work_days = normalizeDayList(payload.work_days);
    const validity_start_date = formatDate(payload.validity_start_date);
    const validity_end_date = formatDate(payload.validity_end_date);
    const id_type = normalizeOptionalString(payload.id_type);
    const id_number = normalizeOptionalString(payload.id_number);
    const id_document_url = normalizeOptionalString(payload.id_document_url);
    const emergency_name = normalizeOptionalString(payload.emergency_name);
    const emergency_phone = payload.emergency_phone ? normalizePhone(payload.emergency_phone) : null;
    const assigned_flat_ids = normalizeFlatIds(payload.assigned_flat_ids);

    if (!type || !STAFF_TYPES.includes(type)) {
        return { error: 'staff type must be one of the supported values' };
    }

    if (!ASSIGNMENT_SCOPES.includes(assignment_scope)) {
        return { error: 'Assignment scope must be either SOCIETY or FLAT_SPECIFIC' };
    }

    if (!name) {
        return { error: 'staff name is required' };
    }

    if (!phone || phone.length < 10 || phone.length > 15) {
        return { error: 'Phone number must be between 10 and 15 digits' };
    }

    if (!profile_photo_url) {
        return { error: 'Profile photo URL is required for staff identification' };
    }

    if (guard_login_phone && (guard_login_phone.length < 10 || guard_login_phone.length > 15)) {
        return { error: 'Guard login phone must be between 10 and 15 digits' };
    }

    if (id_type && !ID_TYPES.includes(id_type)) {
        return { error: 'ID type must be Aadhaar, PAN, or Passport' };
    }

    if (validity_start_date && validity_end_date && validity_start_date > validity_end_date) {
        return { error: 'Validity end date must be on or after validity start date' };
    }

    if (work_start_time && work_end_time && work_start_time === work_end_time) {
        return { error: 'Work start time and end time cannot be the same' };
    }

    if (assignment_scope === 'FLAT_SPECIFIC' && assigned_flat_ids.length === 0) {
        return { error: 'Please assign at least one flat for flat-specific staff' };
    }

    return {
        value: {
            type,
            assignment_scope,
            name,
            phone,
            guard_login_phone: type === 'Security' ? guard_login_phone : null,
            profile_photo_url,
            is_blacklisted: normalizeBoolean(payload.is_blacklisted, false),
            blacklist_reason,
            shift_timing,
            work_start_time,
            work_end_time,
            work_days,
            allow_entry_without_approval: normalizeBoolean(payload.allow_entry_without_approval, false),
            require_daily_approval: normalizeBoolean(payload.require_daily_approval, false),
            auto_entry_enabled: normalizeBoolean(payload.auto_entry_enabled, false),
            validity_start_date,
            validity_end_date,
            id_type,
            id_number,
            id_document_url,
            emergency_name,
            emergency_phone,
            resident_entry_notification: normalizeBoolean(payload.resident_entry_notification, true),
            missed_visit_alerts: normalizeBoolean(payload.missed_visit_alerts, true),
            assigned_flat_ids,
        }
    };
}

exports.getStaffMeta = async (req, res) => {
    try {
        const flats = await getSocietyFlats(req.user.society_id);
        return res.status(200).json({
            success: true,
            meta: {
                staff_types: STAFF_TYPES,
                assignment_scopes: ASSIGNMENT_SCOPES,
                id_types: ID_TYPES,
                weekdays: VALID_DAYS,
                flats,
            }
        });
    } catch (error) {
        console.error('getStaffMeta error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving staff form metadata' });
    }
};

exports.uploadStaffPhoto = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Photo file is required' });
    }

    return res.status(200).json({
        success: true,
        message: 'staff photo uploaded successfully',
        file: buildUploadedFilePayload(req, req.file),
    });
};

exports.uploadStaffDocument = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Document file is required' });
    }

    return res.status(200).json({
        success: true,
        message: 'staff document uploaded successfully',
        file: buildUploadedFilePayload(req, req.file),
    });
};

exports.getStaffDirectory = async (req, res) => {
    try {
        const [staffRows] = await db.query(
            `SELECT
                s.id,
                s.type,
                s.assignment_scope,
                s.linked_user_id,
                s.name,
                s.phone,
                s.guard_login_phone,
                s.profile_photo_url,
                s.is_blacklisted,
                s.blacklist_reason,
                s.shift_timing,
                s.work_start_time,
                s.work_end_time,
                s.work_days,
                s.allow_entry_without_approval,
                s.require_daily_approval,
                s.auto_entry_enabled,
                s.validity_start_date,
                s.validity_end_date,
                s.id_type,
                s.id_number,
                s.id_document_url,
                s.emergency_name,
                s.emergency_phone,
                s.resident_entry_notification,
                s.missed_visit_alerts,
                guard_user.status AS linked_guard_status,
                COUNT(sl.id) AS total_visits,
                SUM(
                    CASE
                        WHEN s.work_start_time IS NOT NULL AND sl.entry_time IS NOT NULL AND TIME(sl.entry_time) > s.work_start_time
                            THEN 1
                        ELSE 0
                    END
                ) AS late_entries,
                (
                    SELECT sl_open.id
                    FROM staff_logs sl_open
                    WHERE sl_open.staff_id = s.id AND sl_open.exit_time IS NULL
                    ORDER BY sl_open.entry_time DESC, sl_open.id DESC
                    LIMIT 1
                ) AS active_log_id,
                (
                    SELECT sl_open.entry_time
                    FROM staff_logs sl_open
                    WHERE sl_open.staff_id = s.id AND sl_open.exit_time IS NULL
                    ORDER BY sl_open.entry_time DESC, sl_open.id DESC
                    LIMIT 1
                ) AS active_entry_time,
                (
                    SELECT sl_last.entry_time
                    FROM staff_logs sl_last
                    WHERE sl_last.staff_id = s.id
                    ORDER BY sl_last.entry_time DESC, sl_last.id DESC
                    LIMIT 1
                ) AS last_entry_time,
                (
                    SELECT sl_last.exit_time
                    FROM staff_logs sl_last
                    WHERE sl_last.staff_id = s.id
                    ORDER BY sl_last.entry_time DESC, sl_last.id DESC
                    LIMIT 1
                ) AS last_exit_time
            FROM staff s
            LEFT JOIN users guard_user ON guard_user.id = s.linked_user_id
            LEFT JOIN staff_logs sl ON sl.staff_id = s.id
            WHERE s.society_id = ?
            GROUP BY s.id
            ORDER BY s.name ASC`,
            [req.user.society_id]
        );

        const flatAssignments = await getFlatAssignments(staffRows.map((row) => row.id));
        const staff = staffRows.map((row) => mapStaffRow(row, flatAssignments.get(row.id) || []));

        return res.status(200).json({ success: true, staff });
    } catch (error) {
        console.error('getStaff error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving staff' });
    }
};

exports.getStaffLogs = async (req, res) => {
    try {
        const staffId = req.query.staff_id ? Number(req.query.staff_id) : null;
        const queryParams = [req.user.society_id];
        let staffFilter = '';

        if (staffId) {
            staffFilter = ' AND s.id = ?';
            queryParams.push(staffId);
        }

        const [logs] = await db.query(
            `SELECT
                sl.id,
                sl.staff_id,
                sl.entry_time,
                sl.exit_time,
                s.name,
                s.type,
                s.phone,
                s.work_start_time,
                CASE
                    WHEN s.work_start_time IS NOT NULL AND sl.entry_time IS NOT NULL AND TIME(sl.entry_time) > s.work_start_time
                        THEN TRUE
                    ELSE FALSE
                END AS is_late
            FROM staff_logs sl
            INNER JOIN staff s ON s.id = sl.staff_id
            WHERE s.society_id = ?${staffFilter}
            ORDER BY COALESCE(sl.entry_time, sl.exit_time) DESC, sl.id DESC
            LIMIT 200`,
            queryParams
        );

        return res.status(200).json({ success: true, logs });
    } catch (error) {
        console.error('getStaffLogs error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving staff logs' });
    }
};

exports.addStaff = async (req, res) => {
    let connection;

    try {
        const validation = validateStaffPayload(req.body);
        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const flatValidation = await validateFlatAssignments(connection, req.user.society_id, validation.value.assigned_flat_ids);
        if (!flatValidation.success) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: flatValidation.message });
        }

        const staffValues = validation.value;
        const [result] = await connection.query(
            `INSERT INTO staff (
                society_id, type, assignment_scope, name, phone, guard_login_phone, profile_photo_url, is_blacklisted, blacklist_reason,
                shift_timing, work_start_time, work_end_time, work_days,
                allow_entry_without_approval, require_daily_approval, auto_entry_enabled,
                validity_start_date, validity_end_date,
                id_type, id_number, id_document_url,
                emergency_name, emergency_phone,
                resident_entry_notification, missed_visit_alerts
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.society_id,
                staffValues.type,
                staffValues.assignment_scope,
                staffValues.name,
                staffValues.phone,
                staffValues.guard_login_phone,
                staffValues.profile_photo_url,
                staffValues.is_blacklisted,
                staffValues.blacklist_reason,
                staffValues.shift_timing,
                staffValues.work_start_time,
                staffValues.work_end_time,
                JSON.stringify(staffValues.work_days),
                staffValues.allow_entry_without_approval,
                staffValues.require_daily_approval,
                staffValues.auto_entry_enabled,
                staffValues.validity_start_date,
                staffValues.validity_end_date,
                staffValues.id_type,
                staffValues.id_number,
                staffValues.id_document_url,
                staffValues.emergency_name,
                staffValues.emergency_phone,
                staffValues.resident_entry_notification,
                staffValues.missed_visit_alerts,
            ]
        );

        await replaceStaffFlatAssignments(connection, result.insertId, staffValues.assignment_scope === 'SOCIETY' ? [] : staffValues.assigned_flat_ids);

        if (staffValues.type === 'Security' && normalizeBoolean(req.body.enable_guard_login, false)) {
            await syncLinkedGuardUser(connection, {
                societyId: req.user.society_id,
                staffId: result.insertId,
                linkedUserId: null,
                name: staffValues.name,
                phone: staffValues.guard_login_phone || staffValues.phone,
                shouldBeActive: !staffValues.is_blacklisted,
            });
        }

        await connection.commit();

        const staffRow = await getStaffById(result.insertId, req.user.society_id);
        const flatAssignments = await getFlatAssignments([result.insertId]);

        return res.status(201).json({
            success: true,
            message: 'staff added successfully',
            staff: staffRow ? mapStaffRow(staffRow, flatAssignments.get(result.insertId) || []) : null,
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('addStaff error:', error);
        return res.status(500).json({ success: false, message: 'Server error adding staff' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

exports.updateStaff = async (req, res) => {
    let connection;

    try {
        const { id } = req.params;
        const existingStaff = await getStaffById(id, req.user.society_id);

        if (!existingStaff) {
            return res.status(404).json({ success: false, message: 'staff member not found' });
        }

        const validation = validateStaffPayload({
            ...existingStaff,
            ...req.body,
            assigned_flat_ids: req.body.assigned_flat_ids,
        });

        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const flatValidation = await validateFlatAssignments(connection, req.user.society_id, validation.value.assigned_flat_ids);
        if (!flatValidation.success) {
            await connection.rollback();
            return res.status(400).json({ success: false, message: flatValidation.message });
        }

        const staffValues = validation.value;
        await connection.query(
            `UPDATE staff
             SET type = ?, name = ?, phone = ?, guard_login_phone = ?, profile_photo_url = ?, is_blacklisted = ?, blacklist_reason = ?,
                 assignment_scope = ?,
                 shift_timing = ?, work_start_time = ?, work_end_time = ?, work_days = ?,
                 allow_entry_without_approval = ?, require_daily_approval = ?, auto_entry_enabled = ?,
                 validity_start_date = ?, validity_end_date = ?,
                 id_type = ?, id_number = ?, id_document_url = ?,
                 emergency_name = ?, emergency_phone = ?,
                 resident_entry_notification = ?, missed_visit_alerts = ?
             WHERE id = ? AND society_id = ?`,
            [
                staffValues.type,
                staffValues.name,
                staffValues.phone,
                staffValues.guard_login_phone,
                staffValues.profile_photo_url,
                staffValues.is_blacklisted,
                staffValues.blacklist_reason,
                staffValues.assignment_scope,
                staffValues.shift_timing,
                staffValues.work_start_time,
                staffValues.work_end_time,
                JSON.stringify(staffValues.work_days),
                staffValues.allow_entry_without_approval,
                staffValues.require_daily_approval,
                staffValues.auto_entry_enabled,
                staffValues.validity_start_date,
                staffValues.validity_end_date,
                staffValues.id_type,
                staffValues.id_number,
                staffValues.id_document_url,
                staffValues.emergency_name,
                staffValues.emergency_phone,
                staffValues.resident_entry_notification,
                staffValues.missed_visit_alerts,
                id,
                req.user.society_id,
            ]
        );

        await replaceStaffFlatAssignments(connection, id, staffValues.assignment_scope === 'SOCIETY' ? [] : staffValues.assigned_flat_ids);

        if (existingStaff.linked_user_id) {
            if (staffValues.type !== 'Security') {
                await connection.query(
                    `UPDATE users SET status = 'INACTIVE' WHERE id = ?`,
                    [existingStaff.linked_user_id]
                );
            } else {
                await syncLinkedGuardUser(connection, {
                    societyId: req.user.society_id,
                    staffId: Number(id),
                    linkedUserId: existingStaff.linked_user_id,
                    name: staffValues.name,
                    phone: staffValues.guard_login_phone || staffValues.phone,
                    shouldBeActive: !staffValues.is_blacklisted,
                });
                await connection.query(
                    `UPDATE guard_shifts
                     SET guard_user_id = ?
                     WHERE society_id = ? AND security_staff_id = ?`,
                    [existingStaff.linked_user_id, req.user.society_id, Number(id)]
                );
            }
        }

        await connection.commit();

        const updatedStaff = await getStaffById(id, req.user.society_id);
        const flatAssignments = await getFlatAssignments([Number(id)]);

        return res.status(200).json({
            success: true,
            message: 'staff updated successfully',
            staff: updatedStaff ? mapStaffRow(updatedStaff, flatAssignments.get(Number(id)) || []) : null,
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('updateStaff error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating staff' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

exports.deleteStaff = async (req, res) => {
    try {
        const { id } = req.params;
        const existingStaff = await getStaffById(id, req.user.society_id);

        if (!existingStaff) {
            return res.status(404).json({ success: false, message: 'staff member not found' });
        }

        if (existingStaff.linked_user_id) {
            await db.query(`UPDATE users SET status = 'INACTIVE' WHERE id = ?`, [existingStaff.linked_user_id]);
        }

        await db.query(`DELETE FROM staff WHERE id = ? AND society_id = ?`, [id, req.user.society_id]);
        return res.status(200).json({ success: true, message: 'staff removed successfully' });
    } catch (error) {
        console.error('deleteStaff error:', error);
        return res.status(500).json({ success: false, message: 'Server error removing staff' });
    }
};

exports.enableGuardLogin = async (req, res) => {
    let connection;

    try {
        const staffId = Number(req.params.id);
        const existingStaff = await getStaffById(staffId, req.user.society_id);
        if (!existingStaff) {
            return res.status(404).json({ success: false, message: 'staff member not found' });
        }

        if (existingStaff.type !== 'Security') {
            return res.status(400).json({ success: false, message: 'Only security staff can be enabled for guard login' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const linkedUserId = await syncLinkedGuardUser(connection, {
            societyId: req.user.society_id,
            staffId,
            linkedUserId: existingStaff.linked_user_id,
            name: existingStaff.name,
            phone: existingStaff.guard_login_phone || existingStaff.phone,
            shouldBeActive: !existingStaff.is_blacklisted,
        });

        await connection.query(
            `UPDATE guard_shifts
             SET guard_user_id = ?
             WHERE society_id = ? AND security_staff_id = ?`,
            [linkedUserId, req.user.society_id, staffId]
        );

        await connection.commit();

        return res.status(200).json({
            success: true,
            message: 'Guard login enabled for this security staff profile',
            linked_user_id: linkedUserId,
        });
    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('enableGuardLogin error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Server error enabling guard login' });
    } finally {
        if (connection) {
            connection.release();
        }
    }
};

exports.disableGuardLogin = async (req, res) => {
    try {
        const staffId = Number(req.params.id);
        const existingStaff = await getStaffById(staffId, req.user.society_id);
        if (!existingStaff) {
            return res.status(404).json({ success: false, message: 'staff member not found' });
        }

        if (!existingStaff.linked_user_id) {
            return res.status(400).json({ success: false, message: 'This staff profile does not have guard login enabled' });
        }

        await db.query(`UPDATE users SET status = 'INACTIVE' WHERE id = ?`, [existingStaff.linked_user_id]);
        return res.status(200).json({ success: true, message: 'Guard login disabled for this staff profile' });
    } catch (error) {
        console.error('disableGuardLogin error:', error);
        return res.status(500).json({ success: false, message: 'Server error disabling guard login' });
    }
};

exports.logStaffEntry = async (req, res) => {
    try {
        const staffId = Number(req.body.staff_id);
        if (!staffId) {
            return res.status(400).json({ success: false, message: 'staff_id is required' });
        }

        const staff = await getStaffById(staffId, req.user.society_id);
        if (!staff) {
            return res.status(404).json({ success: false, message: 'staff member not found' });
        }

        if (staff.is_blacklisted) {
            return res.status(400).json({ success: false, message: 'Blacklisted staff cannot be checked in' });
        }

        if (staff.validity_end_date && formatDate(staff.validity_end_date) < formatDate(new Date())) {
            return res.status(400).json({ success: false, message: 'This staff profile has expired' });
        }

        const [openLogs] = await db.query(
            `SELECT id FROM staff_logs WHERE staff_id = ? AND exit_time IS NULL ORDER BY entry_time DESC, id DESC LIMIT 1`,
            [staffId]
        );

        if (openLogs.length > 0) {
            return res.status(400).json({ success: false, message: 'This staff member is already checked in' });
        }

        const [result] = await db.query(`INSERT INTO staff_logs (staff_id, entry_time) VALUES (?, NOW())`, [staffId]);
        return res.status(200).json({
            success: true,
            message: 'staff entry logged',
            log_id: result.insertId,
        });
    } catch (error) {
        console.error('logEntry error:', error);
        return res.status(500).json({ success: false, message: 'Server error logging staff entry' });
    }
};

exports.logStaffExit = async (req, res) => {
    try {
        const logId = req.body.log_id ? Number(req.body.log_id) : null;
        const staffId = req.body.staff_id ? Number(req.body.staff_id) : null;

        if (!logId && !staffId) {
            return res.status(400).json({ success: false, message: 'log_id or staff_id is required' });
        }

        let log;

        if (logId) {
            const [logs] = await db.query(
                `SELECT sl.id, sl.staff_id
                 FROM staff_logs sl
                 INNER JOIN staff s ON s.id = sl.staff_id
                 WHERE sl.id = ? AND s.society_id = ?`,
                [logId, req.user.society_id]
            );
            log = logs[0];
        } else {
            const staff = await getStaffById(staffId, req.user.society_id);
            if (!staff) {
                return res.status(404).json({ success: false, message: 'staff member not found' });
            }

            const [logs] = await db.query(
                `SELECT id, staff_id
                 FROM staff_logs
                 WHERE staff_id = ? AND exit_time IS NULL
                 ORDER BY entry_time DESC, id DESC
                 LIMIT 1`,
                [staffId]
            );
            log = logs[0];
        }

        if (!log) {
            return res.status(404).json({ success: false, message: 'No active staff check-in found' });
        }

        await db.query(`UPDATE staff_logs SET exit_time = NOW() WHERE id = ?`, [log.id]);
        return res.status(200).json({ success: true, message: 'staff exit logged' });
    } catch (error) {
        console.error('logExit error:', error);
        return res.status(500).json({ success: false, message: 'Server error logging staff exit' });
    }
};
