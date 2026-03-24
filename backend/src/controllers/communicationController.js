const path = require('path');
const db = require('../config/db');

const NOTICE_TYPES = ['General', 'Urgent', 'Event', 'Maintenance', 'Emergency'];
const AUDIENCE_TYPES = ['AllResidents', 'Tower', 'Flats', 'Occupancy', 'Defaulters', 'Committee', 'Guards', 'CustomUsers'];
const DOCUMENT_CATEGORIES = ['Rules', 'Minutes', 'Bills', 'Forms', 'Other'];
const POLL_TYPES = ['YesNo', 'SingleChoice'];

const normalizeJsonValue = (value, fallback = []) => {
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

const normalizeOptionalString = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const parseDateTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const mapConversationRow = (row) => ({
    resident_id: row.resident_id,
    resident_name: row.resident_name,
    resident_phone: row.resident_phone,
    block_name: row.block_name || '',
    flat_number: row.flat_number || '',
    last_message: row.last_message,
    last_subject: row.last_subject || '',
    last_priority: row.last_priority,
    last_created_at: formatDateTime(row.last_created_at),
    unread_count: Number(row.unread_count || 0),
});

const mapMessageRow = (row) => ({
    id: row.id,
    sender_id: row.sender_id,
    receiver_id: row.receiver_id,
    sender_name: row.sender_name,
    receiver_name: row.receiver_name,
    subject: row.subject || '',
    content: row.content,
    priority: row.priority,
    attachments: normalizeJsonValue(row.attachments_json, []),
    is_read: Boolean(row.is_read),
    read_at: formatDateTime(row.read_at),
    created_at: formatDateTime(row.created_at),
});

const mapNoticeRow = (row) => ({
    id: row.id,
    title: row.title,
    content: row.content,
    notice_type: row.notice_type,
    audience_type: row.audience_type,
    audience_filters: normalizeJsonValue(row.audience_filters, {}),
    attachments: normalizeJsonValue(row.attachments_json, []),
    publish_at: formatDateTime(row.publish_at),
    published_at: formatDateTime(row.published_at || row.created_at),
    is_pinned: Boolean(row.is_pinned),
    requires_read_receipt: Boolean(row.requires_read_receipt),
    status: row.status,
    created_at: formatDateTime(row.created_at),
    created_by_name: row.created_by_name || 'Admin',
    read_count: Number(row.read_count || 0),
});

const mapPollRow = (row, optionsByPollId, responseCountByPollId) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    poll_type: row.poll_type,
    target_scope: row.target_scope,
    target_filters: normalizeJsonValue(row.target_filters, {}),
    starts_at: formatDateTime(row.starts_at),
    ends_at: formatDateTime(row.ends_at),
    status: row.status,
    created_at: formatDateTime(row.created_at),
    options: optionsByPollId.get(row.id) || [],
    response_count: responseCountByPollId.get(row.id) || 0,
});

const mapEventRow = (row, rsvpByEventId) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    venue: row.venue || '',
    target_scope: row.target_scope,
    target_filters: normalizeJsonValue(row.target_filters, {}),
    start_at: formatDateTime(row.start_at),
    end_at: formatDateTime(row.end_at),
    rsvp_required: Boolean(row.rsvp_required),
    status: row.status,
    created_at: formatDateTime(row.created_at),
    rsvp_summary: rsvpByEventId.get(row.id) || { Going: 0, Maybe: 0, NotGoing: 0 },
});

const mapDocumentRow = (row) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    category: row.category,
    file_url: row.file_url,
    target_scope: row.target_scope,
    is_pinned: Boolean(row.is_pinned),
    created_at: formatDateTime(row.created_at),
    created_by_name: row.created_by_name || 'Admin',
});

const getAudienceQuery = ({ societyId, audienceType, filters = {} }) => {
    const params = [societyId];
    let query = `
        SELECT DISTINCT u.id, u.name, u.phone_number, u.role, f.block_name, f.flat_number, uf.type AS occupancy_type
        FROM Users u
        LEFT JOIN User_Flats uf ON uf.user_id = u.id
        LEFT JOIN Flats f ON f.id = uf.flat_id
        WHERE u.society_id = ?
    `;

    if (audienceType === 'AllResidents') {
        query += ` AND u.role = 'RESIDENT'`;
    } else if (audienceType === 'Tower') {
        const blocks = Array.isArray(filters.blocks) ? filters.blocks.filter(Boolean) : [];
        if (blocks.length === 0) {
            return { query: `${query} AND 1 = 0`, params };
        }
        query += ` AND u.role = 'RESIDENT' AND f.block_name IN (${blocks.map(() => '?').join(',')})`;
        params.push(...blocks);
    } else if (audienceType === 'Flats') {
        const flatIds = Array.isArray(filters.flat_ids) ? filters.flat_ids.map(Number).filter(Boolean) : [];
        if (flatIds.length === 0) {
            return { query: `${query} AND 1 = 0`, params };
        }
        query += ` AND u.role = 'RESIDENT' AND uf.flat_id IN (${flatIds.map(() => '?').join(',')})`;
        params.push(...flatIds);
    } else if (audienceType === 'Occupancy') {
        const occupancyTypes = Array.isArray(filters.occupancy_types) ? filters.occupancy_types.filter(Boolean) : [];
        if (occupancyTypes.length === 0) {
            return { query: `${query} AND 1 = 0`, params };
        }
        query += ` AND u.role = 'RESIDENT' AND uf.type IN (${occupancyTypes.map(() => '?').join(',')})`;
        params.push(...occupancyTypes);
    } else if (audienceType === 'Defaulters') {
        query += ` AND u.role = 'RESIDENT' AND uf.flat_id IN (
            SELECT DISTINCT flat_id FROM Invoices WHERE society_id = ? AND status IN ('Unpaid', 'Overdue', 'PartiallyPaid')
        )`;
        params.push(societyId);
    } else if (audienceType === 'Committee') {
        const committeeIds = Array.isArray(filters.committee_ids) ? filters.committee_ids.map(Number).filter(Boolean) : [];
        query = `
            SELECT DISTINCT u.id, u.name, u.phone_number, u.role, f.block_name, f.flat_number, uf.type AS occupancy_type
            FROM Committee_Members cm
            JOIN Committees c ON c.id = cm.committee_id
            JOIN Users u ON u.id = cm.user_id
            LEFT JOIN User_Flats uf ON uf.user_id = u.id
            LEFT JOIN Flats f ON f.id = uf.flat_id
            WHERE c.society_id = ? AND cm.status = 'Active'
        `;
        params.length = 0;
        params.push(societyId);
        if (committeeIds.length > 0) {
            query += ` AND c.id IN (${committeeIds.map(() => '?').join(',')})`;
            params.push(...committeeIds);
        }
    } else if (audienceType === 'Guards') {
        query += ` AND u.role = 'GUARD'`;
    } else if (audienceType === 'CustomUsers') {
        const userIds = Array.isArray(filters.user_ids) ? filters.user_ids.map(Number).filter(Boolean) : [];
        if (userIds.length === 0) {
            return { query: `${query} AND 1 = 0`, params };
        }
        query += ` AND u.id IN (${userIds.map(() => '?').join(',')})`;
        params.push(...userIds);
    } else {
        query += ` AND 1 = 0`;
    }

    return { query, params };
};

const resolveAudienceUsers = async ({ societyId, audienceType, filters }) => {
    const { query, params } = getAudienceQuery({ societyId, audienceType, filters });
    const [rows] = await db.query(query, params);
    return rows;
};

const fetchTargets = async (societyId) => {
    const [towers, flats, residents, guards, defaulters, committees] = await Promise.all([
        db.query(`SELECT DISTINCT block_name FROM Flats WHERE society_id = ? ORDER BY block_name`, [societyId]),
        db.query(`SELECT id, block_name, flat_number FROM Flats WHERE society_id = ? ORDER BY block_name, flat_number`, [societyId]),
        db.query(`
            SELECT DISTINCT u.id, u.name, u.phone_number, uf.type AS occupancy_type, f.block_name, f.flat_number
            FROM Users u
            LEFT JOIN User_Flats uf ON uf.user_id = u.id
            LEFT JOIN Flats f ON f.id = uf.flat_id
            WHERE u.society_id = ? AND u.role = 'RESIDENT'
            ORDER BY f.block_name, f.flat_number, u.name
        `, [societyId]),
        db.query(`SELECT id, name, phone_number FROM Users WHERE society_id = ? AND role = 'GUARD' ORDER BY name`, [societyId]),
        db.query(`
            SELECT DISTINCT u.id
            FROM Users u
            JOIN User_Flats uf ON uf.user_id = u.id
            JOIN Invoices i ON i.flat_id = uf.flat_id
            WHERE u.society_id = ? AND u.role = 'RESIDENT' AND i.status IN ('Unpaid', 'Overdue', 'PartiallyPaid')
        `, [societyId]),
        db.query(`SELECT id, name, committee_type FROM Committees WHERE society_id = ? AND status = 'Active' ORDER BY name`, [societyId]),
    ]);

    return {
        towers: towers[0].map((row) => row.block_name),
        flats: flats[0],
        residents: residents[0],
        guards: guards[0],
        committees: committees[0],
        segments: {
            occupancy_types: ['Owner', 'Tenant', 'Family', 'Co-owner'],
            defaulter_user_ids: defaulters[0].map((row) => row.id),
            audience_types: AUDIENCE_TYPES,
            notice_types: NOTICE_TYPES,
        },
    };
};

exports.getHubOverview = async (req, res) => {
    try {
        const { society_id: societyId } = req.user;
        const [noticeCount, unreadMessages, urgentNotices, activePolls, scheduledEvents, documentCount, recentItems, targets] = await Promise.all([
            db.query(`SELECT COUNT(*) AS total FROM Notices WHERE society_id = ? AND status IN ('Published', 'Scheduled')`, [societyId]),
            db.query(`SELECT COUNT(*) AS total FROM Messages WHERE society_id = ? AND receiver_id = ? AND is_read = FALSE`, [societyId, req.user.id]),
            db.query(`SELECT COUNT(*) AS total FROM Notices WHERE society_id = ? AND (notice_type IN ('Urgent', 'Emergency') OR is_pinned = TRUE)`, [societyId]),
            db.query(`SELECT COUNT(*) AS total FROM Communication_Polls WHERE society_id = ? AND status IN ('Draft', 'Live')`, [societyId]),
            db.query(`SELECT COUNT(*) AS total FROM Community_Events WHERE society_id = ? AND status IN ('Draft', 'Scheduled', 'Live')`, [societyId]),
            db.query(`SELECT COUNT(*) AS total FROM Shared_Documents WHERE society_id = ?`, [societyId]),
            db.query(`
                SELECT 'Notice' AS item_type, id, title, created_at, notice_type AS priority_label
                FROM Notices
                WHERE society_id = ?
                UNION ALL
                SELECT 'Document' AS item_type, id, title, created_at, category AS priority_label
                FROM Shared_Documents
                WHERE society_id = ?
                ORDER BY created_at DESC
                LIMIT 8
            `, [societyId, societyId]),
            fetchTargets(societyId),
        ]);

        return res.status(200).json({
            success: true,
            overview: {
                notice_count: Number(noticeCount[0][0].total || 0),
                unread_messages: Number(unreadMessages[0][0].total || 0),
                urgent_items: Number(urgentNotices[0][0].total || 0),
                active_polls: Number(activePolls[0][0].total || 0),
                scheduled_events: Number(scheduledEvents[0][0].total || 0),
                document_count: Number(documentCount[0][0].total || 0),
            },
            inbox: recentItems[0].map((item) => ({
                item_type: item.item_type,
                id: item.id,
                title: item.title,
                created_at: formatDateTime(item.created_at),
                priority_label: item.priority_label,
            })),
            targets,
        });
    } catch (error) {
        console.error('getHubOverview error:', error);
        return res.status(500).json({ success: false, message: 'Server error loading communication hub' });
    }
};

exports.getTargets = async (req, res) => {
    try {
        const targets = await fetchTargets(req.user.society_id);
        return res.status(200).json({ success: true, targets });
    } catch (error) {
        console.error('getTargets error:', error);
        return res.status(500).json({ success: false, message: 'Server error loading communication targets' });
    }
};

exports.getMessages = async (req, res) => {
    try {
        const { society_id: societyId } = req.user;
        const [rows] = await db.query(`
            SELECT
                other_user.id AS resident_id,
                other_user.name AS resident_name,
                other_user.phone_number AS resident_phone,
                f.block_name,
                f.flat_number,
                MAX(m.created_at) AS last_created_at,
                SUBSTRING_INDEX(GROUP_CONCAT(m.content ORDER BY m.created_at DESC SEPARATOR '|||'), '|||', 1) AS last_message,
                SUBSTRING_INDEX(GROUP_CONCAT(COALESCE(m.subject, '') ORDER BY m.created_at DESC SEPARATOR '|||'), '|||', 1) AS last_subject,
                SUBSTRING_INDEX(GROUP_CONCAT(m.priority ORDER BY m.created_at DESC SEPARATOR '|||'), '|||', 1) AS last_priority,
                SUM(CASE WHEN m.receiver_id = ? AND m.is_read = FALSE THEN 1 ELSE 0 END) AS unread_count
            FROM Messages m
            JOIN Users other_user ON other_user.id = CASE WHEN m.sender_id = ? THEN m.receiver_id ELSE m.sender_id END
            LEFT JOIN User_Flats uf ON uf.user_id = other_user.id
            LEFT JOIN Flats f ON f.id = uf.flat_id
            WHERE m.society_id = ?
              AND m.message_type = 'Direct'
              AND (m.sender_id = ? OR m.receiver_id = ?)
              AND other_user.id IS NOT NULL
            GROUP BY other_user.id, other_user.name, other_user.phone_number, f.block_name, f.flat_number
            ORDER BY last_created_at DESC
        `, [req.user.id, req.user.id, societyId, req.user.id, req.user.id]);

        return res.status(200).json({ success: true, conversations: rows.map(mapConversationRow) });
    } catch (error) {
        console.error('getMessages error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching messages' });
    }
};

exports.getThreadMessages = async (req, res) => {
    try {
        const residentId = Number(req.params.userId);
        if (!residentId) {
            return res.status(400).json({ success: false, message: 'Resident id is required' });
        }

        const [messages] = await db.query(`
            SELECT
                m.*,
                sender.name AS sender_name,
                receiver.name AS receiver_name
            FROM Messages m
            LEFT JOIN Users sender ON sender.id = m.sender_id
            LEFT JOIN Users receiver ON receiver.id = m.receiver_id
            WHERE m.society_id = ?
              AND m.message_type = 'Direct'
              AND (
                (m.sender_id = ? AND m.receiver_id = ?)
                OR
                (m.sender_id = ? AND m.receiver_id = ?)
              )
            ORDER BY m.created_at ASC
        `, [req.user.society_id, req.user.id, residentId, residentId, req.user.id]);

        await db.query(
            `UPDATE Messages
             SET is_read = TRUE, read_at = NOW()
             WHERE society_id = ? AND sender_id = ? AND receiver_id = ? AND is_read = FALSE`,
            [req.user.society_id, residentId, req.user.id]
        );

        return res.status(200).json({ success: true, messages: messages.map(mapMessageRow) });
    } catch (error) {
        console.error('getThreadMessages error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching thread messages' });
    }
};

exports.sendMessage = async (req, res) => {
    try {
        const receiverId = Number(req.body.receiver_id);
        const content = normalizeOptionalString(req.body.content);
        const subject = normalizeOptionalString(req.body.subject);
        const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        const priority = ['Normal', 'High', 'Emergency'].includes(req.body.priority) ? req.body.priority : 'Normal';

        if (!receiverId || !content) {
            return res.status(400).json({ success: false, message: 'Receiver and message content are required' });
        }

        await db.query(
            `INSERT INTO Messages (
                society_id, sender_id, receiver_id, subject, content, priority, message_type, attachments_json, delivered_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'Direct', ?, NOW())`,
            [req.user.society_id, req.user.id, receiverId, subject, content, priority, JSON.stringify(attachments)]
        );

        return res.status(201).json({ success: true, message: 'Direct message sent successfully' });
    } catch (error) {
        console.error('sendMessage error:', error);
        return res.status(500).json({ success: false, message: 'Server error sending message' });
    }
};

exports.sendBroadcast = async (req, res) => {
    try {
        const title = normalizeOptionalString(req.body.title);
        const body = normalizeOptionalString(req.body.body || req.body.content);
        const noticeType = NOTICE_TYPES.includes(req.body.notice_type) ? req.body.notice_type : 'General';
        const audienceType = AUDIENCE_TYPES.includes(req.body.audience_type) ? req.body.audience_type : 'AllResidents';
        const audienceFilters = req.body.audience_filters || {};
        const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        const publishAt = parseDateTime(req.body.publish_at);
        const isPinned = Boolean(req.body.is_pinned);
        const requiresReadReceipt = req.body.requires_read_receipt !== false;
        const status = publishAt && publishAt.getTime() > Date.now() ? 'Scheduled' : 'Published';

        if (!title || !body) {
            return res.status(400).json({ success: false, message: 'Title and notice description are required' });
        }

        const recipients = await resolveAudienceUsers({
            societyId: req.user.society_id,
            audienceType,
            filters: audienceFilters,
        });

        const [result] = await db.query(
            `INSERT INTO Notices (
                society_id, title, content, created_by, notice_type, audience_type, audience_filters,
                attachments_json, publish_at, published_at, is_pinned, requires_read_receipt, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.society_id,
                title,
                body,
                req.user.id,
                noticeType,
                audienceType,
                JSON.stringify(audienceFilters),
                JSON.stringify(attachments),
                publishAt,
                status === 'Published' ? new Date() : null,
                isPinned,
                requiresReadReceipt,
                status,
            ]
        );

        return res.status(201).json({
            success: true,
            message: status === 'Scheduled' ? 'Notice scheduled successfully' : 'Broadcast notice created successfully',
            notice_id: result.insertId,
            recipient_count: recipients.length,
        });
    } catch (error) {
        console.error('sendBroadcast error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating broadcast notice' });
    }
};

exports.getNotices = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT
                n.*,
                creator.name AS created_by_name,
                COUNT(nr.user_id) AS read_count
            FROM Notices n
            LEFT JOIN Users creator ON creator.id = n.created_by
            LEFT JOIN Notice_Reads nr ON nr.notice_id = n.id
            WHERE n.society_id = ?
            GROUP BY n.id, creator.name
            ORDER BY n.is_pinned DESC, COALESCE(n.publish_at, n.created_at) DESC
        `, [req.user.society_id]);

        return res.status(200).json({ success: true, notices: rows.map(mapNoticeRow) });
    } catch (error) {
        console.error('getNotices error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching notices' });
    }
};

exports.sendEmergencyAlert = async (req, res) => {
    try {
        const content = normalizeOptionalString(req.body.content || req.body.message);
        const audienceType = AUDIENCE_TYPES.includes(req.body.audience_type) ? req.body.audience_type : 'AllResidents';
        const audienceFilters = req.body.audience_filters || {};

        if (!content) {
            return res.status(400).json({ success: false, message: 'Emergency message is required' });
        }

        const recipients = await resolveAudienceUsers({
            societyId: req.user.society_id,
            audienceType,
            filters: audienceFilters,
        });

        if (recipients.length > 0) {
            const values = recipients.map((user) => [
                req.user.society_id,
                req.user.id,
                user.id,
                'Emergency Alert',
                content,
                'Emergency',
                'Emergency',
                JSON.stringify([]),
            ]);

            await db.query(
                `INSERT INTO Messages (
                    society_id, sender_id, receiver_id, subject, content, priority, message_type, attachments_json
                ) VALUES ?`,
                [values]
            );
        }

        await db.query(
            `INSERT INTO Notices (
                society_id, title, content, created_by, notice_type, audience_type, audience_filters,
                attachments_json, publish_at, published_at, is_pinned, requires_read_receipt, status
            ) VALUES (?, 'Emergency Alert', ?, ?, 'Emergency', ?, ?, '[]', NOW(), NOW(), TRUE, TRUE, 'Published')`,
            [req.user.society_id, content, req.user.id, audienceType, JSON.stringify(audienceFilters)]
        );

        return res.status(201).json({
            success: true,
            message: 'Emergency alert broadcasted successfully',
            recipient_count: recipients.length,
        });
    } catch (error) {
        console.error('sendEmergencyAlert error:', error);
        return res.status(500).json({ success: false, message: 'Server error sending emergency alert' });
    }
};

exports.getPolls = async (req, res) => {
    try {
        const [polls, options, responses] = await Promise.all([
            db.query(`SELECT * FROM Communication_Polls WHERE society_id = ? ORDER BY created_at DESC`, [req.user.society_id]),
            db.query(`SELECT poll_id, id, option_text FROM Communication_Poll_Options WHERE poll_id IN (SELECT id FROM Communication_Polls WHERE society_id = ?) ORDER BY id`, [req.user.society_id]),
            db.query(`SELECT poll_id, COUNT(*) AS total FROM Communication_Poll_Responses WHERE poll_id IN (SELECT id FROM Communication_Polls WHERE society_id = ?) GROUP BY poll_id`, [req.user.society_id]),
        ]);

        const optionsByPollId = new Map();
        options[0].forEach((row) => {
            const existing = optionsByPollId.get(row.poll_id) || [];
            existing.push({ id: row.id, option_text: row.option_text });
            optionsByPollId.set(row.poll_id, existing);
        });

        const responseCountByPollId = new Map(responses[0].map((row) => [row.poll_id, Number(row.total)]));

        return res.status(200).json({
            success: true,
            polls: polls[0].map((row) => mapPollRow(row, optionsByPollId, responseCountByPollId)),
        });
    } catch (error) {
        console.error('getPolls error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching polls' });
    }
};

exports.createPoll = async (req, res) => {
    try {
        const title = normalizeOptionalString(req.body.title);
        const description = normalizeOptionalString(req.body.description);
        const pollType = POLL_TYPES.includes(req.body.poll_type) ? req.body.poll_type : 'YesNo';
        const targetScope = AUDIENCE_TYPES.includes(req.body.target_scope) ? req.body.target_scope : 'AllResidents';
        const targetFilters = req.body.target_filters || {};
        const startsAt = parseDateTime(req.body.starts_at);
        const endsAt = parseDateTime(req.body.ends_at);
        const options = pollType === 'YesNo'
            ? ['Yes', 'No']
            : Array.isArray(req.body.options) ? req.body.options.map((item) => String(item || '').trim()).filter(Boolean) : [];

        if (!title || options.length < 2) {
            return res.status(400).json({ success: false, message: 'Poll title and at least two options are required' });
        }

        const [result] = await db.query(
            `INSERT INTO Communication_Polls (
                society_id, title, description, poll_type, target_scope, target_filters, starts_at, ends_at, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Live', ?)`,
            [req.user.society_id, title, description, pollType, targetScope, JSON.stringify(targetFilters), startsAt, endsAt, req.user.id]
        );

        if (options.length > 0) {
            const values = options.map((optionText) => [result.insertId, optionText]);
            await db.query(
                `INSERT INTO Communication_Poll_Options (poll_id, option_text) VALUES ?`,
                [values]
            );
        }

        return res.status(201).json({ success: true, message: 'Poll created successfully', poll_id: result.insertId });
    } catch (error) {
        console.error('createPoll error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating poll' });
    }
};

exports.getEvents = async (req, res) => {
    try {
        const [events, rsvps] = await Promise.all([
            db.query(`SELECT * FROM Community_Events WHERE society_id = ? ORDER BY start_at DESC, created_at DESC`, [req.user.society_id]),
            db.query(`
                SELECT event_id, status, COUNT(*) AS total
                FROM Event_RSVPs
                WHERE event_id IN (SELECT id FROM Community_Events WHERE society_id = ?)
                GROUP BY event_id, status
            `, [req.user.society_id]),
        ]);

        const rsvpByEventId = new Map();
        rsvps[0].forEach((row) => {
            const existing = rsvpByEventId.get(row.event_id) || { Going: 0, Maybe: 0, NotGoing: 0 };
            existing[row.status] = Number(row.total);
            rsvpByEventId.set(row.event_id, existing);
        });

        return res.status(200).json({ success: true, events: events[0].map((row) => mapEventRow(row, rsvpByEventId)) });
    } catch (error) {
        console.error('getEvents error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching events' });
    }
};

exports.createEvent = async (req, res) => {
    try {
        const title = normalizeOptionalString(req.body.title);
        const description = normalizeOptionalString(req.body.description);
        const venue = normalizeOptionalString(req.body.venue);
        const targetScope = AUDIENCE_TYPES.includes(req.body.target_scope) ? req.body.target_scope : 'AllResidents';
        const targetFilters = req.body.target_filters || {};
        const startAt = parseDateTime(req.body.start_at);
        const endAt = parseDateTime(req.body.end_at);
        const rsvpRequired = Boolean(req.body.rsvp_required);

        if (!title || !startAt) {
            return res.status(400).json({ success: false, message: 'Event title and start time are required' });
        }

        const [result] = await db.query(
            `INSERT INTO Community_Events (
                society_id, title, description, venue, target_scope, target_filters, start_at, end_at, rsvp_required, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Scheduled', ?)`,
            [req.user.society_id, title, description, venue, targetScope, JSON.stringify(targetFilters), startAt, endAt, rsvpRequired, req.user.id]
        );

        return res.status(201).json({ success: true, message: 'Event created successfully', event_id: result.insertId });
    } catch (error) {
        console.error('createEvent error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating event' });
    }
};

exports.getDocuments = async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT d.*, creator.name AS created_by_name
            FROM Shared_Documents d
            LEFT JOIN Users creator ON creator.id = d.created_by
            WHERE d.society_id = ?
            ORDER BY d.is_pinned DESC, d.created_at DESC
        `, [req.user.society_id]);

        return res.status(200).json({ success: true, documents: rows.map(mapDocumentRow) });
    } catch (error) {
        console.error('getDocuments error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching documents' });
    }
};

exports.createDocument = async (req, res) => {
    try {
        const title = normalizeOptionalString(req.body.title);
        const description = normalizeOptionalString(req.body.description);
        const category = DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : 'Other';
        const fileUrl = normalizeOptionalString(req.body.file_url);
        const targetScope = AUDIENCE_TYPES.includes(req.body.target_scope) ? req.body.target_scope : 'AllResidents';
        const targetFilters = req.body.target_filters || {};
        const isPinned = Boolean(req.body.is_pinned);

        if (!title || !fileUrl) {
            return res.status(400).json({ success: false, message: 'Document title and file are required' });
        }

        const [result] = await db.query(
            `INSERT INTO Shared_Documents (
                society_id, title, description, category, file_url, target_scope, target_filters, is_pinned, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.society_id, title, description, category, fileUrl, targetScope, JSON.stringify(targetFilters), isPinned, req.user.id]
        );

        return res.status(201).json({ success: true, message: 'Document shared successfully', document_id: result.insertId });
    } catch (error) {
        console.error('createDocument error:', error);
        return res.status(500).json({ success: false, message: 'Server error sharing document' });
    }
};

exports.markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        await db.query(
            `UPDATE Messages SET is_read = TRUE, read_at = NOW() WHERE id = ? AND receiver_id = ?`,
            [id, req.user.id]
        );
        return res.status(200).json({ success: true, message: 'Message marked as read' });
    } catch (error) {
        console.error('markAsRead error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating message' });
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
