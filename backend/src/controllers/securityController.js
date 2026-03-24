const path = require('path');
const db = require('../config/db');
const { getIO } = require('../websocket/socket');

const ACTIVITY_TYPES = ['Patrol', 'Incident', 'Mistake', 'ShiftStart', 'ShiftEnd'];
const INCIDENT_CATEGORIES = ['Access', 'Visitor', 'Patrol', 'Safety', 'Equipment', 'Emergency', 'Other'];
const INCIDENT_SEVERITIES = ['Low', 'Medium', 'High', 'Critical'];
const INCIDENT_STATUSES = ['Open', 'InReview', 'Resolved', 'Closed'];
const SHIFT_STATUSES = ['Scheduled', 'OnDuty', 'Completed', 'Missed', 'Cancelled'];

const normalizeOptionalString = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const parseJson = (value, fallback = []) => {
    if (!value) return fallback;
    if (typeof value === 'string') {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    }
    return value;
};

const formatDateTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const buildUploadedFilePayload = (req, file) => {
    const relativePath = `/${path.relative(path.join(__dirname, '../../'), file.path).replace(/\\/g, '/')}`;
    return {
        file_name: file.filename,
        file_path: relativePath,
        url: `${req.protocol}://${req.get('host')}${relativePath}`,
        mime_type: file.mimetype,
        size: file.size,
    };
};

const emitToRooms = (rooms, eventName, payload) => {
    try {
        const io = getIO();
        rooms.forEach((room) => io.to(room).emit(eventName, payload));
    } catch (error) {
        console.warn('Security websocket emit skipped:', error.message);
    }
};

const buildSecurityRooms = (societyId) => [
    `society_${societyId}_security`,
    `society_${societyId}_admins`,
    `society_${societyId}_guards`,
];

const mapGuardLogRow = (row) => ({
    id: row.id,
    action_type: row.action_type,
    guard_id: row.guard_id,
    guard_name: row.guard_name || '',
    description: row.description || '',
    timestamp: formatDateTime(row.timestamp),
});

const mapShiftRow = (row) => ({
    id: row.id,
    society_id: row.society_id,
    security_staff_id: row.security_staff_id || null,
    guard_user_id: row.guard_user_id || null,
    guard_name: row.security_staff_name || row.guard_name || '',
    profile_photo_url: row.security_staff_photo_url || '',
    guard_login_phone: row.guard_login_phone || '',
    has_guard_login: Boolean(row.guard_user_id),
    shift_label: row.shift_label,
    scheduled_start: formatDateTime(row.scheduled_start),
    scheduled_end: formatDateTime(row.scheduled_end),
    actual_start: formatDateTime(row.actual_start),
    actual_end: formatDateTime(row.actual_end),
    status: row.status,
    notes: row.notes || '',
    created_by_name: row.created_by_name || '',
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
});

const mapIncidentRow = (row) => ({
    id: row.id,
    society_id: row.society_id,
    reported_by_user_id: row.reported_by_user_id,
    reporter_name: row.reporter_name || '',
    assigned_guard_user_id: row.assigned_guard_user_id,
    assigned_guard_name: row.assigned_guard_name || '',
    title: row.title,
    category: row.category,
    severity: row.severity,
    status: row.status,
    location: row.location || '',
    description: row.description,
    attachments: parseJson(row.attachments_json, []),
    resolution_note: row.resolution_note || '',
    related_visitor_log_id: row.related_visitor_log_id,
    occurred_at: formatDateTime(row.occurred_at),
    resolved_at: formatDateTime(row.resolved_at),
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
});

const ensureGuard = async (societyId, userId) => {
    const [rows] = await db.query(
        `SELECT id, name FROM Users WHERE id = ? AND society_id = ? AND role = 'GUARD' AND status = 'ACTIVE'`,
        [userId, societyId]
    );
    return rows[0] || null;
};

const getSecurityStaffById = async (societyId, staffId) => {
    const [rows] = await db.query(
        `SELECT id, society_id, linked_user_id, name, phone, guard_login_phone, profile_photo_url, is_blacklisted, shift_timing, work_start_time, work_end_time
         FROM Staff
         WHERE id = ? AND society_id = ? AND type = 'Security'`,
        [staffId, societyId]
    );
    return rows[0] || null;
};

const ensureGuardUserForSecurityStaff = async (connection, staff) => {
    if (staff.linked_user_id) {
        await connection.query(
            `UPDATE Users
             SET society_id = ?, name = ?, phone_number = ?, role = 'GUARD', status = ?
             WHERE id = ?`,
            [staff.society_id, staff.name, staff.phone, staff.is_blacklisted ? 'INACTIVE' : 'ACTIVE', staff.linked_user_id]
        );
        return staff.linked_user_id;
    }

    const [users] = await connection.query(
        `SELECT id, society_id, role
         FROM Users
         WHERE phone_number = ?`,
        [staff.phone]
    );

    if (users.length > 0) {
        const user = users[0];
        if (user.society_id !== staff.society_id || user.role !== 'GUARD') {
            throw new Error('This security staff phone number is already linked to another user account');
        }

        await connection.query(
            `UPDATE Users
             SET name = ?, status = ?
             WHERE id = ?`,
            [staff.name, staff.is_blacklisted ? 'INACTIVE' : 'ACTIVE', user.id]
        );
        await connection.query(`UPDATE Staff SET linked_user_id = ? WHERE id = ?`, [user.id, staff.id]);
        return user.id;
    }

    const [result] = await connection.query(
        `INSERT INTO Users (society_id, name, email, phone_number, role, status)
         VALUES (?, ?, '', ?, 'GUARD', ?)`,
        [staff.society_id, staff.name, staff.phone, staff.is_blacklisted ? 'INACTIVE' : 'ACTIVE']
    );

    await connection.query(`UPDATE Staff SET linked_user_id = ? WHERE id = ?`, [result.insertId, staff.id]);
    return result.insertId;
};

const insertGuardActivity = async ({ guardId, actionType, description }) => {
    await db.query(
        `INSERT INTO Guard_Activity (guard_id, action_type, description) VALUES (?, ?, ?)`,
        [guardId, actionType, normalizeOptionalString(description)]
    );
};

exports.getSecurityMeta = async (req, res) => {
    try {
        const [guards] = await db.query(
            `SELECT
                s.id AS staff_id,
                s.name,
                s.phone AS phone_number,
                s.guard_login_phone,
                s.profile_photo_url,
                s.shift_timing,
                s.work_start_time,
                s.work_end_time,
                s.linked_user_id AS guard_user_id,
                CASE WHEN s.linked_user_id IS NULL THEN FALSE ELSE TRUE END AS has_guard_login,
                COALESCE(u.status, 'INACTIVE') AS guard_status
             FROM Staff s
             LEFT JOIN Users u ON u.id = s.linked_user_id
             WHERE s.society_id = ? AND s.type = 'Security'
             ORDER BY name ASC`,
            [req.user.society_id]
        );

        return res.status(200).json({ success: true, guards });
    } catch (error) {
        console.error('getSecurityMeta error:', error);
        return res.status(500).json({ success: false, message: 'Server error loading security metadata' });
    }
};

exports.getSecuritySummary = async (req, res) => {
    try {
        const societyId = req.user.society_id;

        const [[guardCounts]] = await db.query(
            `SELECT
                COUNT(CASE WHEN role = 'GUARD' THEN 1 END) AS total_guards,
                COUNT(CASE WHEN role = 'GUARD' AND status = 'ACTIVE' THEN 1 END) AS active_guard_profiles
             FROM Users
             WHERE society_id = ?`,
            [societyId]
        );

        const [[shiftMetrics]] = await db.query(
            `SELECT
                COUNT(CASE WHEN status = 'OnDuty' THEN 1 END) AS guards_on_duty,
                COUNT(CASE WHEN DATE(scheduled_start) = CURDATE() THEN 1 END) AS shifts_today,
                COUNT(CASE WHEN status = 'Missed' THEN 1 END) AS missed_shifts
             FROM Guard_Shifts
             WHERE society_id = ?`,
            [societyId]
        );

        const [[incidentMetrics]] = await db.query(
            `SELECT
                COUNT(CASE WHEN status IN ('Open', 'InReview') THEN 1 END) AS open_incidents,
                COUNT(CASE WHEN severity = 'Critical' AND status IN ('Open', 'InReview') THEN 1 END) AS critical_incidents
             FROM Security_Incidents
             WHERE society_id = ?`,
            [societyId]
        );

        const [[activityMetrics]] = await db.query(
            `SELECT
                COUNT(CASE WHEN action_type = 'Mistake' AND DATE(timestamp) = CURDATE() THEN 1 END) AS mistakes_today,
                COUNT(CASE WHEN action_type = 'Patrol' AND DATE(timestamp) = CURDATE() THEN 1 END) AS patrols_today
             FROM Guard_Activity ga
             INNER JOIN Users u ON u.id = ga.guard_id
             WHERE u.society_id = ?`,
            [societyId]
        );

        return res.status(200).json({
            success: true,
            summary: {
                total_guards: Number(guardCounts.total_guards || 0),
                active_guard_profiles: Number(guardCounts.active_guard_profiles || 0),
                guards_on_duty: Number(shiftMetrics.guards_on_duty || 0),
                shifts_today: Number(shiftMetrics.shifts_today || 0),
                missed_shifts: Number(shiftMetrics.missed_shifts || 0),
                open_incidents: Number(incidentMetrics.open_incidents || 0),
                critical_incidents: Number(incidentMetrics.critical_incidents || 0),
                mistakes_today: Number(activityMetrics.mistakes_today || 0),
                patrols_today: Number(activityMetrics.patrols_today || 0),
            },
        });
    } catch (error) {
        console.error('getSecuritySummary error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving security summary' });
    }
};

exports.getGuardLogs = async (req, res) => {
    try {
        const [logs] = await db.query(
            `SELECT ga.*, u.name AS guard_name
             FROM Guard_Activity ga
             JOIN Users u ON ga.guard_id = u.id
             WHERE u.society_id = ?
             ORDER BY ga.timestamp DESC
             LIMIT 100`,
            [req.user.society_id]
        );
        return res.status(200).json({ success: true, logs: logs.map(mapGuardLogRow) });
    } catch (error) {
        console.error('getGuardLogs error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving guard logs' });
    }
};

exports.logGuardActivity = async (req, res) => {
    try {
        const actionType = String(req.body.action_type || '').trim();
        if (!ACTIVITY_TYPES.includes(actionType)) {
            return res.status(400).json({ success: false, message: 'Invalid guard activity type' });
        }

        await insertGuardActivity({
            guardId: req.user.id,
            actionType,
            description: req.body.description,
        });

        emitToRooms(
            buildSecurityRooms(req.user.society_id),
            'security_activity_logged',
            { action_type: actionType, guard_id: req.user.id }
        );

        return res.status(201).json({ success: true, message: 'Guard activity logged successfully' });
    } catch (error) {
        console.error('logGuardActivity error:', error);
        return res.status(500).json({ success: false, message: 'Server error logging guard activity' });
    }
};

exports.getGuardShifts = async (req, res) => {
    try {
        const params = [req.user.society_id];
        let whereClause = `WHERE gs.society_id = ?`;

        if (req.user.role === 'GUARD') {
            whereClause += ` AND gs.guard_user_id = ?`;
            params.push(req.user.id);
        } else if (req.query.guard_user_id) {
            whereClause += ` AND gs.guard_user_id = ?`;
            params.push(Number(req.query.guard_user_id));
        } else if (req.query.security_staff_id) {
            whereClause += ` AND gs.security_staff_id = ?`;
            params.push(Number(req.query.security_staff_id));
        }

        const [rows] = await db.query(
            `SELECT
                gs.*,
                g.name AS guard_name,
                s.name AS security_staff_name,
                s.profile_photo_url AS security_staff_photo_url,
                s.guard_login_phone,
                creator.name AS created_by_name
             FROM Guard_Shifts gs
             LEFT JOIN Users g ON g.id = gs.guard_user_id
             LEFT JOIN Staff s ON s.id = gs.security_staff_id
             LEFT JOIN Users creator ON creator.id = gs.created_by
             ${whereClause}
             ORDER BY gs.scheduled_start DESC
             LIMIT 100`,
            params
        );

        return res.status(200).json({ success: true, shifts: rows.map(mapShiftRow) });
    } catch (error) {
        console.error('getGuardShifts error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving guard shifts' });
    }
};

exports.createGuardShift = async (req, res) => {
    try {
        const requestedGuardUserId = req.body.guard_user_id ? Number(req.body.guard_user_id) : null;
        const securityStaffId = req.body.security_staff_id ? Number(req.body.security_staff_id) : null;
        const scheduledStart = new Date(req.body.scheduled_start);
        const scheduledEnd = new Date(req.body.scheduled_end);
        const shiftLabel = String(req.body.shift_label || '').trim();

        if ((!requestedGuardUserId && !securityStaffId) || !shiftLabel || Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime()) || scheduledStart >= scheduledEnd) {
            return res.status(400).json({ success: false, message: 'Security staff, label, and valid shift window are required' });
        }

        let guardUserId = requestedGuardUserId;
        let resolvedSecurityStaffId = securityStaffId;
        if (securityStaffId) {
            const staff = await getSecurityStaffById(req.user.society_id, securityStaffId);
            if (!staff) {
                return res.status(404).json({ success: false, message: 'Selected security staff was not found in this society' });
            }

            guardUserId = staff.linked_user_id || null;
        } else {
            const guard = await ensureGuard(req.user.society_id, requestedGuardUserId);
            if (!guard) {
                return res.status(404).json({ success: false, message: 'Selected guard was not found in this society' });
            }

            const [staffRows] = await db.query(
                `SELECT id FROM Staff WHERE society_id = ? AND linked_user_id = ? LIMIT 1`,
                [req.user.society_id, requestedGuardUserId]
            );
            resolvedSecurityStaffId = staffRows[0]?.id || null;
        }

        const [result] = await db.query(
            `INSERT INTO Guard_Shifts (
                society_id, security_staff_id, guard_user_id, shift_label, scheduled_start,
                scheduled_end, status, notes, created_by
             ) VALUES (?, ?, ?, ?, ?, ?, 'Scheduled', ?, ?)`,
            [
                req.user.society_id,
                resolvedSecurityStaffId,
                guardUserId,
                shiftLabel,
                scheduledStart,
                scheduledEnd,
                normalizeOptionalString(req.body.notes),
                req.user.id,
            ]
        );

        emitToRooms(
            buildSecurityRooms(req.user.society_id),
            'security_shift_updated',
            { shift_id: result.insertId, security_staff_id: resolvedSecurityStaffId, guard_user_id: guardUserId }
        );

        return res.status(201).json({ success: true, message: 'Guard shift created successfully' });
    } catch (error) {
        console.error('createGuardShift error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Server error creating shift' });
    }
};

exports.updateGuardShift = async (req, res) => {
    try {
        const shiftId = Number(req.params.id);
        const [rows] = await db.query(
            `SELECT * FROM Guard_Shifts WHERE id = ? AND society_id = ?`,
            [shiftId, req.user.society_id]
        );

        const shift = rows[0];
        if (!shift) {
            return res.status(404).json({ success: false, message: 'Guard shift not found' });
        }

        let nextGuardId = req.body.guard_user_id ? Number(req.body.guard_user_id) : shift.guard_user_id;
        let nextSecurityStaffId = req.body.security_staff_id ? Number(req.body.security_staff_id) : shift.security_staff_id;
        const nextStatus = String(req.body.status || shift.status);
        if (!SHIFT_STATUSES.includes(nextStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid shift status' });
        }

        if (nextSecurityStaffId) {
            const staff = await getSecurityStaffById(req.user.society_id, nextSecurityStaffId);
            if (!staff) {
                return res.status(404).json({ success: false, message: 'Selected security staff was not found in this society' });
            }
            nextGuardId = staff.linked_user_id || null;
        } else if (nextGuardId) {
            const guard = await ensureGuard(req.user.society_id, nextGuardId);
            if (!guard) {
                return res.status(404).json({ success: false, message: 'Selected guard was not found in this society' });
            }
        }

        const scheduledStart = req.body.scheduled_start ? new Date(req.body.scheduled_start) : new Date(shift.scheduled_start);
        const scheduledEnd = req.body.scheduled_end ? new Date(req.body.scheduled_end) : new Date(shift.scheduled_end);
        if (Number.isNaN(scheduledStart.getTime()) || Number.isNaN(scheduledEnd.getTime()) || scheduledStart >= scheduledEnd) {
            return res.status(400).json({ success: false, message: 'Invalid shift timing' });
        }

        await db.query(
            `UPDATE Guard_Shifts
             SET security_staff_id = ?, guard_user_id = ?, shift_label = ?, scheduled_start = ?, scheduled_end = ?, status = ?, notes = ?
             WHERE id = ? AND society_id = ?`,
            [
                nextSecurityStaffId,
                nextGuardId,
                String(req.body.shift_label || shift.shift_label).trim(),
                scheduledStart,
                scheduledEnd,
                nextStatus,
                normalizeOptionalString(req.body.notes ?? shift.notes),
                shiftId,
                req.user.society_id,
            ]
        );

        emitToRooms(
            buildSecurityRooms(req.user.society_id),
            'security_shift_updated',
            { shift_id: shiftId, security_staff_id: nextSecurityStaffId, guard_user_id: nextGuardId }
        );

        return res.status(200).json({ success: true, message: 'Guard shift updated successfully' });
    } catch (error) {
        console.error('updateGuardShift error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating shift' });
    }
};

exports.startGuardShift = async (req, res) => {
    try {
        const shiftId = Number(req.params.id);
        const [rows] = await db.query(
            `SELECT * FROM Guard_Shifts WHERE id = ? AND society_id = ?`,
            [shiftId, req.user.society_id]
        );

        const shift = rows[0];
        if (!shift) {
            return res.status(404).json({ success: false, message: 'Guard shift not found' });
        }

        if (req.user.role === 'GUARD' && shift.guard_user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You can only start your own shifts' });
        }

        await db.query(
            `UPDATE Guard_Shifts
             SET status = 'OnDuty', actual_start = COALESCE(actual_start, NOW())
             WHERE id = ? AND society_id = ?`,
            [shiftId, req.user.society_id]
        );

        if (shift.guard_user_id) {
            await insertGuardActivity({
                guardId: shift.guard_user_id,
                actionType: 'ShiftStart',
                description: `Shift started: ${shift.shift_label}`,
            });
        }

        emitToRooms(
            buildSecurityRooms(req.user.society_id),
            'security_shift_updated',
            { shift_id: shiftId, security_staff_id: shift.security_staff_id, guard_user_id: shift.guard_user_id }
        );

        return res.status(200).json({ success: true, message: 'Shift started successfully' });
    } catch (error) {
        console.error('startGuardShift error:', error);
        return res.status(500).json({ success: false, message: 'Server error starting shift' });
    }
};

exports.endGuardShift = async (req, res) => {
    try {
        const shiftId = Number(req.params.id);
        const [rows] = await db.query(
            `SELECT * FROM Guard_Shifts WHERE id = ? AND society_id = ?`,
            [shiftId, req.user.society_id]
        );

        const shift = rows[0];
        if (!shift) {
            return res.status(404).json({ success: false, message: 'Guard shift not found' });
        }

        if (req.user.role === 'GUARD' && shift.guard_user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'You can only end your own shifts' });
        }

        await db.query(
            `UPDATE Guard_Shifts
             SET status = 'Completed', actual_end = NOW(), actual_start = COALESCE(actual_start, NOW())
             WHERE id = ? AND society_id = ?`,
            [shiftId, req.user.society_id]
        );

        if (shift.guard_user_id) {
            await insertGuardActivity({
                guardId: shift.guard_user_id,
                actionType: 'ShiftEnd',
                description: `Shift ended: ${shift.shift_label}`,
            });
        }

        emitToRooms(
            buildSecurityRooms(req.user.society_id),
            'security_shift_updated',
            { shift_id: shiftId, security_staff_id: shift.security_staff_id, guard_user_id: shift.guard_user_id }
        );

        return res.status(200).json({ success: true, message: 'Shift ended successfully' });
    } catch (error) {
        console.error('endGuardShift error:', error);
        return res.status(500).json({ success: false, message: 'Server error ending shift' });
    }
};

exports.getSecurityIncidents = async (req, res) => {
    try {
        const params = [req.user.society_id];
        let whereClause = `WHERE si.society_id = ?`;

        if (req.user.role === 'GUARD') {
            whereClause += ` AND (si.reported_by_user_id = ? OR si.assigned_guard_user_id = ? OR si.assigned_guard_user_id IS NULL)`;
            params.push(req.user.id, req.user.id);
        }

        if (req.query.status) {
            whereClause += ` AND si.status = ?`;
            params.push(req.query.status);
        }

        const [rows] = await db.query(
            `SELECT
                si.*,
                reporter.name AS reporter_name,
                assigned.name AS assigned_guard_name
             FROM Security_Incidents si
             LEFT JOIN Users reporter ON reporter.id = si.reported_by_user_id
             LEFT JOIN Users assigned ON assigned.id = si.assigned_guard_user_id
             ${whereClause}
             ORDER BY si.occurred_at DESC
             LIMIT 100`,
            params
        );

        return res.status(200).json({ success: true, incidents: rows.map(mapIncidentRow) });
    } catch (error) {
        console.error('getSecurityIncidents error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving incidents' });
    }
};

exports.createSecurityIncident = async (req, res) => {
    try {
        const title = String(req.body.title || '').trim();
        const description = String(req.body.description || '').trim();
        const category = String(req.body.category || 'Other');
        const severity = String(req.body.severity || 'Medium');
        const occurredAt = req.body.occurred_at ? new Date(req.body.occurred_at) : new Date();
        const assignedGuardId = req.body.assigned_guard_user_id ? Number(req.body.assigned_guard_user_id) : null;

        if (!title || !description || Number.isNaN(occurredAt.getTime())) {
            return res.status(400).json({ success: false, message: 'Title, description, and valid occurrence time are required' });
        }
        if (!INCIDENT_CATEGORIES.includes(category) || !INCIDENT_SEVERITIES.includes(severity)) {
            return res.status(400).json({ success: false, message: 'Invalid incident category or severity' });
        }
        if (assignedGuardId) {
            const guard = await ensureGuard(req.user.society_id, assignedGuardId);
            if (!guard) {
                return res.status(404).json({ success: false, message: 'Assigned guard not found' });
            }
        }

        const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        const [result] = await db.query(
            `INSERT INTO Security_Incidents (
                society_id, reported_by_user_id, assigned_guard_user_id, title, category, severity,
                status, location, description, attachments_json, resolution_note, related_visitor_log_id, occurred_at
             ) VALUES (?, ?, ?, ?, ?, ?, 'Open', ?, ?, ?, ?, ?, ?)`,
            [
                req.user.society_id,
                req.user.id,
                assignedGuardId,
                title,
                category,
                severity,
                normalizeOptionalString(req.body.location),
                description,
                JSON.stringify(attachments),
                normalizeOptionalString(req.body.resolution_note),
                req.body.related_visitor_log_id ? Number(req.body.related_visitor_log_id) : null,
                occurredAt,
            ]
        );

        if (req.user.role === 'GUARD') {
            await insertGuardActivity({
                guardId: req.user.id,
                actionType: 'Incident',
                description: `${title} (${severity})`,
            });
        }

        emitToRooms(
            buildSecurityRooms(req.user.society_id),
            'security_incident_updated',
            { incident_id: result.insertId }
        );

        return res.status(201).json({ success: true, message: 'Incident reported successfully' });
    } catch (error) {
        console.error('createSecurityIncident error:', error);
        return res.status(500).json({ success: false, message: 'Server error reporting incident' });
    }
};

exports.updateSecurityIncident = async (req, res) => {
    try {
        const incidentId = Number(req.params.id);
        const [rows] = await db.query(
            `SELECT * FROM Security_Incidents WHERE id = ? AND society_id = ?`,
            [incidentId, req.user.society_id]
        );

        const incident = rows[0];
        if (!incident) {
            return res.status(404).json({ success: false, message: 'Incident not found' });
        }

        const nextStatus = String(req.body.status || incident.status);
        if (!INCIDENT_STATUSES.includes(nextStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid incident status' });
        }

        const assignedGuardId = req.body.assigned_guard_user_id === '' || req.body.assigned_guard_user_id === null
            ? null
            : (req.body.assigned_guard_user_id ? Number(req.body.assigned_guard_user_id) : incident.assigned_guard_user_id);

        if (assignedGuardId) {
            const guard = await ensureGuard(req.user.society_id, assignedGuardId);
            if (!guard) {
                return res.status(404).json({ success: false, message: 'Assigned guard not found' });
            }
        }

        await db.query(
            `UPDATE Security_Incidents
             SET assigned_guard_user_id = ?,
                 status = ?,
                 resolution_note = ?,
                 resolved_at = CASE WHEN ? IN ('Resolved', 'Closed') THEN COALESCE(resolved_at, NOW()) ELSE NULL END
             WHERE id = ? AND society_id = ?`,
            [
                assignedGuardId,
                nextStatus,
                normalizeOptionalString(req.body.resolution_note ?? incident.resolution_note),
                nextStatus,
                incidentId,
                req.user.society_id,
            ]
        );

        emitToRooms(
            buildSecurityRooms(req.user.society_id),
            'security_incident_updated',
            { incident_id: incidentId }
        );

        return res.status(200).json({ success: true, message: 'Incident updated successfully' });
    } catch (error) {
        console.error('updateSecurityIncident error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating incident' });
    }
};

exports.uploadIncidentAttachment = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No attachment provided' });
        }

        return res.status(200).json({
            success: true,
            file: buildUploadedFilePayload(req, req.file),
        });
    } catch (error) {
        console.error('uploadIncidentAttachment error:', error);
        return res.status(500).json({ success: false, message: 'Server error uploading incident attachment' });
    }
};
