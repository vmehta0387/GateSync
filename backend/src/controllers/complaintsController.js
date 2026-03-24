const path = require('path');
const db = require('../config/db');
const { getIO } = require('../websocket/socket');

const DEFAULT_CATEGORIES = [
    { name: 'Plumbing', description: 'Water leakage, pipe issues, or drainage problems.', default_priority: 'High', sla_hours: 24 },
    { name: 'Electrical', description: 'Power faults, wiring, or lighting issues.', default_priority: 'High', sla_hours: 12 },
    { name: 'Security', description: 'Security incident, breach, or guard concern.', default_priority: 'High', sla_hours: 2 },
    { name: 'Housekeeping', description: 'Cleaning, garbage, or common-area upkeep.', default_priority: 'Medium', sla_hours: 24 },
    { name: 'Lift issue', description: 'Lift outage, malfunction, or safety concern.', default_priority: 'High', sla_hours: 4 },
    { name: 'Noise complaint', description: 'Disturbance, nuisance, or community noise issue.', default_priority: 'Medium', sla_hours: 12 },
    { name: 'Others', description: 'General complaint category.', default_priority: 'Medium', sla_hours: 24 },
];

const COMPLAINT_STATUSES = ['Open', 'InProgress', 'OnHold', 'Resolved', 'Closed'];
const PRIORITIES = ['Low', 'Medium', 'High'];

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
        console.warn('Complaint websocket emit skipped:', error.message);
    }
};

const buildComplaintRooms = ({ societyId, flatId, residentUserId }) => [
    `society_${societyId}_admins`,
    `flat_${flatId}`,
    residentUserId ? `resident_${residentUserId}` : null,
].filter(Boolean);

const ensureDefaultCategories = async (societyId) => {
    const values = DEFAULT_CATEGORIES.map((category) => [
        societyId,
        category.name,
        category.description,
        category.default_priority,
        category.sla_hours,
        true,
        true,
    ]);

    if (values.length > 0) {
        await db.query(
            `INSERT IGNORE INTO Complaint_Categories (
                society_id, name, description, default_priority, sla_hours, is_default, is_active
            ) VALUES ?`,
            [values]
        );
    }
};

const mapCategoryRow = (row) => ({
    id: row.id,
    name: row.name,
    description: row.description || '',
    default_priority: row.default_priority,
    sla_hours: Number(row.sla_hours || 0),
    is_default: Boolean(row.is_default),
    is_active: Boolean(row.is_active),
});

const mapComplaintRow = (row) => ({
    id: row.id,
    ticket_id: row.ticket_id,
    flat_id: row.flat_id,
    block_name: row.block_name || '',
    flat_number: row.flat_number || '',
    resident_name: row.resident_name || '',
    category_id: row.category_id,
    category_name: row.category_name || row.category || 'Others',
    description: row.description,
    attachments: parseJson(row.attachments_json, []),
    status: row.status,
    priority: row.priority,
    sla_deadline: formatDateTime(row.sla_deadline),
    resolved_at: formatDateTime(row.resolved_at),
    closed_at: formatDateTime(row.closed_at),
    escalation_level: Number(row.escalation_level || 0),
    escalated_to_type: row.escalated_to_type,
    escalated_to_user_id: row.escalated_to_user_id,
    escalated_to_committee_id: row.escalated_to_committee_id,
    created_at: formatDateTime(row.created_at),
    updated_at: formatDateTime(row.updated_at),
    is_overdue: Boolean(row.is_overdue),
    is_mine: Boolean(row.is_mine),
    assigned_summary: row.assigned_summary || '',
});

const mapMessageRow = (row) => ({
    id: row.id,
    sender_type: row.sender_type,
    sender_name: row.sender_name || 'System',
    message: row.message,
    attachments: parseJson(row.attachments_json, []),
    created_at: formatDateTime(row.created_at),
});

const mapHistoryRow = (row) => ({
    id: row.id,
    status: row.status,
    note: row.note || '',
    changed_by_name: row.changed_by_name || 'System',
    created_at: formatDateTime(row.created_at),
});

const mapAssigneeRow = (row) => ({
    id: row.id,
    assignee_type: row.assignee_type,
    user_id: row.user_id,
    staff_id: row.staff_id,
    committee_id: row.committee_id,
    is_primary: Boolean(row.is_primary),
    name: row.name || '',
    role_label: row.role_label || '',
    assigned_at: formatDateTime(row.assigned_at),
});

const getComplaintBase = async (complaintId, societyId) => {
    const [rows] = await db.query(
        `SELECT
            c.*,
            f.block_name,
            f.flat_number,
            u.name AS resident_name,
            cc.name AS category_name,
            CASE WHEN c.sla_deadline IS NOT NULL AND c.status NOT IN ('Resolved', 'Closed') AND c.sla_deadline < NOW() THEN TRUE ELSE FALSE END AS is_overdue
         FROM Complaints c
         LEFT JOIN Flats f ON f.id = c.flat_id
         LEFT JOIN Users u ON u.id = c.created_by_user_id
         LEFT JOIN Complaint_Categories cc ON cc.id = c.category_id
         WHERE c.id = ? AND c.society_id = ?`,
        [complaintId, societyId]
    );
    return rows[0] || null;
};

const getComplaintAssignees = async (complaintId) => {
    const [rows] = await db.query(
        `SELECT
            ca.*,
            CASE
                WHEN ca.assignee_type = 'User' THEN u.name
                WHEN ca.assignee_type = 'Staff' THEN s.name
                WHEN ca.assignee_type = 'Committee' THEN c.name
            END AS name,
            CASE
                WHEN ca.assignee_type = 'User' THEN u.role
                WHEN ca.assignee_type = 'Staff' THEN s.type
                WHEN ca.assignee_type = 'Committee' THEN c.committee_type
            END AS role_label
         FROM Complaint_Assignees ca
         LEFT JOIN Users u ON u.id = ca.user_id
         LEFT JOIN Staff s ON s.id = ca.staff_id
         LEFT JOIN Committees c ON c.id = ca.committee_id
         WHERE ca.complaint_id = ?
         ORDER BY ca.is_primary DESC, ca.assigned_at ASC`,
        [complaintId]
    );
    return rows.map(mapAssigneeRow);
};

const getComplaintMessages = async (complaintId) => {
    const [rows] = await db.query(
        `SELECT
            cm.*,
            CASE
                WHEN cm.sender_type IN ('Resident', 'Admin') THEN u.name
                WHEN cm.sender_type = 'Staff' THEN s.name
                ELSE 'System'
            END AS sender_name
         FROM Complaint_Messages cm
         LEFT JOIN Users u ON u.id = cm.sender_user_id
         LEFT JOIN Staff s ON s.id = cm.sender_staff_id
         WHERE cm.complaint_id = ?
         ORDER BY cm.created_at ASC`,
        [complaintId]
    );
    return rows.map(mapMessageRow);
};

const getComplaintHistory = async (complaintId) => {
    const [rows] = await db.query(
        `SELECT
            h.*,
            CASE
                WHEN h.changed_by_user_id IS NOT NULL THEN u.name
                WHEN h.changed_by_staff_id IS NOT NULL THEN s.name
                ELSE 'System'
            END AS changed_by_name
         FROM Complaint_Status_History h
         LEFT JOIN Users u ON u.id = h.changed_by_user_id
         LEFT JOIN Staff s ON s.id = h.changed_by_staff_id
         WHERE h.complaint_id = ?
         ORDER BY h.created_at ASC`,
        [complaintId]
    );
    return rows.map(mapHistoryRow);
};

const runEscalationSweep = async (societyId) => {
    const [[primaryAdmin]] = await db.query(
        `SELECT id FROM Users WHERE society_id = ? AND role = 'ADMIN' ORDER BY id ASC LIMIT 1`,
        [societyId]
    );
    const [[coreCommittee]] = await db.query(
        `SELECT id FROM Committees WHERE society_id = ? AND status = 'Active' AND committee_type IN ('CoreCommittee', 'SecurityCommittee') ORDER BY id ASC LIMIT 1`,
        [societyId]
    );

    if (primaryAdmin) {
        const [rows] = await db.query(
            `SELECT id, status FROM Complaints
             WHERE society_id = ? AND status NOT IN ('Resolved', 'Closed') AND sla_deadline IS NOT NULL AND sla_deadline < NOW() AND escalation_level = 0`,
            [societyId]
        );

        for (const row of rows) {
            await db.query(
                `UPDATE Complaints
                 SET escalation_level = 1, escalated_to_type = 'Admin', escalated_to_user_id = ?
                 WHERE id = ?`,
                [primaryAdmin.id, row.id]
            );
            await db.query(
                `INSERT INTO Complaint_Status_History (complaint_id, status, note)
                 VALUES (?, ?, 'Auto escalated to senior admin after SLA breach')`,
                [row.id, row.status]
            );
        }
    }

    if (coreCommittee) {
        const [rows] = await db.query(
            `SELECT id, status FROM Complaints
             WHERE society_id = ? AND status NOT IN ('Resolved', 'Closed') AND sla_deadline IS NOT NULL
               AND sla_deadline < DATE_SUB(NOW(), INTERVAL 24 HOUR)
               AND escalation_level = 1`,
            [societyId]
        );

        for (const row of rows) {
            await db.query(
                `UPDATE Complaints
                 SET escalation_level = 2, escalated_to_type = 'Committee', escalated_to_committee_id = ?
                 WHERE id = ?`,
                [coreCommittee.id, row.id]
            );
            await db.query(
                `INSERT INTO Complaint_Status_History (complaint_id, status, note)
                 VALUES (?, ?, 'Auto escalated to committee after extended SLA breach')`,
                [row.id, row.status]
            );
        }
    }
};

const validateResidentFlatAccess = async (userId, flatId) => {
    const [rows] = await db.query(`SELECT 1 FROM User_Flats WHERE user_id = ? AND flat_id = ? LIMIT 1`, [userId, flatId]);
    return Boolean(rows[0]);
};

exports.getCategories = async (req, res) => {
    try {
        await ensureDefaultCategories(req.user.society_id);
        const [rows] = await db.query(
            `SELECT * FROM Complaint_Categories WHERE society_id = ? AND is_active = TRUE ORDER BY is_default DESC, name ASC`,
            [req.user.society_id]
        );
        return res.status(200).json({ success: true, categories: rows.map(mapCategoryRow) });
    } catch (error) {
        console.error('getCategories error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching complaint categories' });
    }
};

exports.createCategory = async (req, res) => {
    try {
        const name = normalizeOptionalString(req.body.name);
        const description = normalizeOptionalString(req.body.description);
        const defaultPriority = PRIORITIES.includes(req.body.default_priority) ? req.body.default_priority : 'Medium';
        const slaHours = Number(req.body.sla_hours) > 0 ? Number(req.body.sla_hours) : 24;

        if (!name) {
            return res.status(400).json({ success: false, message: 'Category name is required' });
        }

        await db.query(
            `INSERT INTO Complaint_Categories (society_id, name, description, default_priority, sla_hours, is_default, is_active)
             VALUES (?, ?, ?, ?, ?, FALSE, TRUE)`,
            [req.user.society_id, name, description, defaultPriority, slaHours]
        );

        return res.status(201).json({ success: true, message: 'Complaint category created successfully' });
    } catch (error) {
        console.error('createCategory error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating complaint category' });
    }
};

exports.createComplaint = async (req, res) => {
    const connection = await db.getConnection();
    try {
        await ensureDefaultCategories(req.user.society_id);

        const flatId = Number(req.body.flat_id);
        const categoryId = Number(req.body.category_id);
        const description = normalizeOptionalString(req.body.description);
        const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];

        if (!flatId || !categoryId || !description) {
            return res.status(400).json({ success: false, message: 'flat_id, category_id, and description are required' });
        }

        if (req.user.role === 'RESIDENT') {
            const hasAccess = await validateResidentFlatAccess(req.user.id, flatId);
            if (!hasAccess) {
                return res.status(403).json({ success: false, message: 'You can only raise complaints for your own flat' });
            }
        }

        const [[category]] = await db.query(
            `SELECT * FROM Complaint_Categories WHERE id = ? AND society_id = ? AND is_active = TRUE`,
            [categoryId, req.user.society_id]
        );
        if (!category) {
            return res.status(400).json({ success: false, message: 'Selected category is invalid' });
        }

        const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : category.default_priority;
        const slaHours = Number(category.sla_hours || 24);
        const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000);
        const temporaryTicketId = `TMP-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        await connection.beginTransaction();
        const [result] = await connection.query(
             `INSERT INTO Complaints (
                 society_id, flat_id, created_by_user_id, ticket_id, category_id, category, description,
                 attachments_json, status, priority, sla_deadline
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?)`,
            [req.user.society_id, flatId, req.user.id, temporaryTicketId, categoryId, category.name, description, JSON.stringify(attachments), priority, slaDeadline]
        );

        const ticketId = `GP-CMP-${String(result.insertId).padStart(6, '0')}`;
        await connection.query(`UPDATE Complaints SET ticket_id = ? WHERE id = ?`, [ticketId, result.insertId]);

        await connection.query(
            `INSERT INTO Complaint_Messages (
                complaint_id, sender_type, sender_user_id, message, attachments_json
            ) VALUES (?, ?, ?, ?, ?)`,
            [result.insertId, ['ADMIN', 'MANAGER'].includes(req.user.role) ? 'Admin' : 'Resident', req.user.id, description, JSON.stringify(attachments)]
        );

        await connection.query(
            `INSERT INTO Complaint_Status_History (complaint_id, status, note, changed_by_user_id)
             VALUES (?, 'Open', 'Complaint created', ?)`,
            [result.insertId, req.user.id]
        );

        await connection.commit();

        const complaint = await getComplaintBase(result.insertId, req.user.society_id);
        emitToRooms(
            buildComplaintRooms({ societyId: req.user.society_id, flatId, residentUserId: req.user.id }),
            'complaint_created',
            { complaint_id: result.insertId, ticket_id: ticketId, status: 'Open', priority, category_name: category.name }
        );

        return res.status(201).json({
            success: true,
            message: 'Complaint created successfully',
            complaint: mapComplaintRow({ ...complaint, ticket_id: ticketId, is_mine: true, assigned_summary: '' }),
        });
    } catch (error) {
        await connection.rollback();
        console.error('createComplaint error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating complaint' });
    } finally {
        connection.release();
    }
};

exports.getComplaints = async (req, res) => {
    try {
        await ensureDefaultCategories(req.user.society_id);
        await runEscalationSweep(req.user.society_id);

        const filters = [];
        const params = [req.user.society_id];
        let accessClause = '';

        if (req.user.role === 'RESIDENT') {
            accessClause = ` AND c.created_by_user_id = ?`;
            params.push(req.user.id);
        }

        if (req.query.status && COMPLAINT_STATUSES.includes(req.query.status)) {
            filters.push(`c.status = ?`);
            params.push(req.query.status);
        }
        if (req.query.priority && PRIORITIES.includes(req.query.priority)) {
            filters.push(`c.priority = ?`);
            params.push(req.query.priority);
        }
        if (req.query.category_id) {
            filters.push(`c.category_id = ?`);
            params.push(Number(req.query.category_id));
        }

        const whereFilters = filters.length ? ` AND ${filters.join(' AND ')}` : '';
        const [rows] = await db.query(
            `SELECT
                c.*,
                f.block_name,
                f.flat_number,
                u.name AS resident_name,
                cc.name AS category_name,
                CASE WHEN c.sla_deadline IS NOT NULL AND c.status NOT IN ('Resolved', 'Closed') AND c.sla_deadline < NOW() THEN TRUE ELSE FALSE END AS is_overdue,
                CASE WHEN c.created_by_user_id = ? THEN TRUE ELSE FALSE END AS is_mine,
                (
                    SELECT GROUP_CONCAT(
                        CASE
                            WHEN ca.assignee_type = 'User' THEN u2.name
                            WHEN ca.assignee_type = 'Staff' THEN s.name
                            WHEN ca.assignee_type = 'Committee' THEN co.name
                        END
                        ORDER BY ca.is_primary DESC, ca.assigned_at ASC
                        SEPARATOR ', '
                    )
                    FROM Complaint_Assignees ca
                    LEFT JOIN Users u2 ON u2.id = ca.user_id
                    LEFT JOIN Staff s ON s.id = ca.staff_id
                    LEFT JOIN Committees co ON co.id = ca.committee_id
                    WHERE ca.complaint_id = c.id
                ) AS assigned_summary
             FROM Complaints c
             LEFT JOIN Flats f ON f.id = c.flat_id
             LEFT JOIN Users u ON u.id = c.created_by_user_id
             LEFT JOIN Complaint_Categories cc ON cc.id = c.category_id
             WHERE c.society_id = ?${accessClause}${whereFilters}
             ORDER BY c.created_at DESC`,
            [req.user.id, ...params]
        );

        return res.status(200).json({ success: true, complaints: rows.map(mapComplaintRow) });
    } catch (error) {
        console.error('getComplaints error:', error);
        return res.status(500).json({ success: false, message: 'Server error returning complaints' });
    }
};

exports.getComplaintDetail = async (req, res) => {
    try {
        const complaintId = Number(req.params.id);
        if (!complaintId) {
            return res.status(400).json({ success: false, message: 'Complaint id is required' });
        }

        const complaint = await getComplaintBase(complaintId, req.user.society_id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        if (req.user.role === 'RESIDENT' && complaint.created_by_user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const [assignees, messages, history] = await Promise.all([
            getComplaintAssignees(complaintId),
            getComplaintMessages(complaintId),
            getComplaintHistory(complaintId),
        ]);

        const [[recurring]] = await db.query(
            `SELECT COUNT(*) AS total
             FROM Complaints
             WHERE flat_id = ? AND category_id = ? AND id <> ?`,
            [complaint.flat_id, complaint.category_id, complaintId]
        );

        return res.status(200).json({
            success: true,
            complaint: mapComplaintRow({
                ...complaint,
                is_mine: complaint.created_by_user_id === req.user.id,
                assigned_summary: assignees.map((item) => item.name).filter(Boolean).join(', '),
            }),
            assignees,
            messages,
            history,
            recurring_count: Number(recurring.total || 0),
        });
    } catch (error) {
        console.error('getComplaintDetail error:', error);
        return res.status(500).json({ success: false, message: 'Server error returning complaint detail' });
    }
};

exports.updateComplaint = async (req, res) => {
    try {
        const complaintId = Number(req.params.id);
        const complaint = await getComplaintBase(complaintId, req.user.society_id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }

        const status = COMPLAINT_STATUSES.includes(req.body.status) ? req.body.status : complaint.status;
        const priority = PRIORITIES.includes(req.body.priority) ? req.body.priority : complaint.priority;
        const categoryId = req.body.category_id ? Number(req.body.category_id) : complaint.category_id;
        const slaDeadline = req.body.sla_deadline ? new Date(req.body.sla_deadline) : complaint.sla_deadline;
        const resolutionNote = normalizeOptionalString(req.body.resolution_note);

        await db.query(
            `UPDATE Complaints
             SET status = ?, priority = ?, category_id = ?, resolved_at = ?, closed_at = ?, sla_deadline = ?
             WHERE id = ? AND society_id = ?`,
            [
                status,
                priority,
                categoryId,
                status === 'Resolved' ? new Date() : null,
                status === 'Closed' ? new Date() : null,
                slaDeadline,
                complaintId,
                req.user.society_id,
            ]
        );

        if (status !== complaint.status) {
            await db.query(
                `INSERT INTO Complaint_Status_History (complaint_id, status, note, changed_by_user_id)
                 VALUES (?, ?, ?, ?)`,
                [complaintId, status, resolutionNote || `Status changed to ${status}`, req.user.id]
            );
        }

        if (resolutionNote) {
            await db.query(
                `INSERT INTO Complaint_Messages (complaint_id, sender_type, sender_user_id, message, attachments_json)
                 VALUES (?, 'Admin', ?, ?, '[]')`,
                [complaintId, req.user.id, resolutionNote]
            );
        }

        emitToRooms(
            buildComplaintRooms({ societyId: req.user.society_id, flatId: complaint.flat_id, residentUserId: complaint.created_by_user_id }),
            'complaint_updated',
            { complaint_id: complaintId, status, priority }
        );

        return res.status(200).json({ success: true, message: 'Complaint updated successfully' });
    } catch (error) {
        console.error('updateComplaint error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating complaint' });
    }
};

exports.assignComplaint = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const complaintId = Number(req.params.id);
        const complaint = await getComplaintBase(complaintId, req.user.society_id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }

        const assignees = Array.isArray(req.body.assignees) ? req.body.assignees : [];
        await connection.beginTransaction();
        await connection.query(`DELETE FROM Complaint_Assignees WHERE complaint_id = ?`, [complaintId]);

        let primaryUserId = null;

        if (assignees.length > 0) {
            const values = assignees.map((assignee, index) => {
                const assigneeType = ['User', 'Staff', 'Committee'].includes(assignee.assignee_type) ? assignee.assignee_type : 'User';
                const userId = assigneeType === 'User' ? Number(assignee.user_id) || null : null;
                const staffId = assigneeType === 'Staff' ? Number(assignee.staff_id) || null : null;
                const committeeId = assigneeType === 'Committee' ? Number(assignee.committee_id) || null : null;
                const isPrimary = index === 0 || Boolean(assignee.is_primary);

                if (!primaryUserId && assigneeType === 'User' && userId) {
                    primaryUserId = userId;
                }

                return [complaintId, assigneeType, userId, staffId, committeeId, isPrimary, req.user.id];
            });

            await connection.query(
                `INSERT INTO Complaint_Assignees (
                    complaint_id, assignee_type, user_id, staff_id, committee_id, is_primary, assigned_by_user_id
                ) VALUES ?`,
                [values]
            );
        }

        await connection.query(`UPDATE Complaints SET assigned_to = ? WHERE id = ?`, [primaryUserId, complaintId]);
        await connection.query(
            `INSERT INTO Complaint_Status_History (complaint_id, status, note, changed_by_user_id)
             VALUES (?, ?, 'Ticket assignment updated', ?)`,
            [complaintId, complaint.status, req.user.id]
        );
        await connection.commit();

        emitToRooms(
            buildComplaintRooms({ societyId: req.user.society_id, flatId: complaint.flat_id, residentUserId: complaint.created_by_user_id }),
            'complaint_updated',
            { complaint_id: complaintId, assigned: true }
        );

        return res.status(200).json({ success: true, message: 'Complaint assignees updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('assignComplaint error:', error);
        return res.status(500).json({ success: false, message: 'Server error assigning complaint' });
    } finally {
        connection.release();
    }
};

exports.addComplaintMessage = async (req, res) => {
    try {
        const complaintId = Number(req.params.id);
        const complaint = await getComplaintBase(complaintId, req.user.society_id);
        if (!complaint) {
            return res.status(404).json({ success: false, message: 'Complaint not found' });
        }
        if (req.user.role === 'RESIDENT' && complaint.created_by_user_id !== req.user.id) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }

        const message = normalizeOptionalString(req.body.message);
        const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        const senderStaffId = ['ADMIN', 'MANAGER'].includes(req.user.role) ? Number(req.body.sender_staff_id) || null : null;
        const senderType = senderStaffId ? 'Staff' : ['ADMIN', 'MANAGER'].includes(req.user.role) ? 'Admin' : 'Resident';

        if (!message) {
            return res.status(400).json({ success: false, message: 'Message is required' });
        }

        await db.query(
            `INSERT INTO Complaint_Messages (
                complaint_id, sender_type, sender_user_id, sender_staff_id, message, attachments_json
            ) VALUES (?, ?, ?, ?, ?, ?)`,
            [complaintId, senderType, senderType === 'Staff' ? null : req.user.id, senderStaffId, message, JSON.stringify(attachments)]
        );

        emitToRooms(
            buildComplaintRooms({ societyId: req.user.society_id, flatId: complaint.flat_id, residentUserId: complaint.created_by_user_id }),
            'complaint_message_added',
            { complaint_id: complaintId }
        );

        return res.status(201).json({ success: true, message: 'Complaint update posted successfully' });
    } catch (error) {
        console.error('addComplaintMessage error:', error);
        return res.status(500).json({ success: false, message: 'Server error posting complaint update' });
    }
};

exports.getSummary = async (req, res) => {
    try {
        await ensureDefaultCategories(req.user.society_id);
        await runEscalationSweep(req.user.society_id);

        const [openRows, overdueRows, totalRows, categoryRows, staffRows] = await Promise.all([
            db.query(`SELECT COUNT(*) AS total FROM Complaints WHERE society_id = ? AND status NOT IN ('Resolved', 'Closed')`, [req.user.society_id]),
            db.query(`SELECT COUNT(*) AS total FROM Complaints WHERE society_id = ? AND status NOT IN ('Resolved', 'Closed') AND sla_deadline IS NOT NULL AND sla_deadline < NOW()`, [req.user.society_id]),
            db.query(`SELECT 
                COUNT(*) AS total_ever,
                COUNT(CASE WHEN status IN ('Resolved', 'Closed') THEN 1 END) AS total_resolved
             FROM Complaints WHERE society_id = ?`, [req.user.society_id]),
            db.query(
                `SELECT COALESCE(cc.name, c.category, 'Others') AS label, COUNT(*) AS total
                 FROM Complaints c
                 LEFT JOIN Complaint_Categories cc ON cc.id = c.category_id
                 WHERE c.society_id = ? AND c.status NOT IN ('Resolved', 'Closed')
                 GROUP BY COALESCE(cc.name, c.category, 'Others')
                 ORDER BY total DESC`,
                [req.user.society_id]
            ),
            db.query(
                `SELECT
                    s.name,
                    s.type,
                    COUNT(DISTINCT ca.complaint_id) AS total_assigned,
                    COUNT(DISTINCT CASE WHEN c.status IN ('Resolved', 'Closed') THEN ca.complaint_id END) AS resolved_count
                 FROM Complaint_Assignees ca
                 JOIN Staff s ON s.id = ca.staff_id
                 JOIN Complaints c ON c.id = ca.complaint_id
                 WHERE c.society_id = ? AND ca.assignee_type = 'Staff'
                 GROUP BY s.id, s.name, s.type
                 ORDER BY total_assigned DESC, resolved_count DESC`,
                [req.user.society_id]
            ),
        ]);

        const totalEver = Number(totalRows[0][0].total_ever || 0);
        const totalResolved = Number(totalRows[0][0].total_resolved || 0);
        const successRate = totalEver > 0 ? Math.round((totalResolved / totalEver) * 100) : 100;

        return res.status(200).json({
            success: true,
            summary: {
                open_tickets: Number(openRows[0][0].total || 0),
                overdue_tickets: Number(overdueRows[0][0].total || 0),
                total_tickets: totalEver,
                success_rate: `${successRate}%`,
                category_breakdown: categoryRows[0].map((row) => ({ label: row.label, total: Number(row.total || 0) })),
                staff_performance: staffRows[0].map((row) => ({
                    name: row.name,
                    type: row.type,
                    total_assigned: Number(row.total_assigned || 0),
                    resolved_count: Number(row.resolved_count || 0),
                })),
            },
        });
    } catch (error) {
        console.error('getSummary error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching complaint summary' });
    }
};

exports.uploadAttachment = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Attachment file is required' });
    }

    return res.status(200).json({
        success: true,
        file: buildUploadedFilePayload(req, req.file),
    });
};
