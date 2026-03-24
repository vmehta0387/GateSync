const db = require('../config/db');

const COMMITTEE_TEMPLATES = [
    {
        key: 'CoreCommittee',
        label: 'Core Committee',
        description: 'Primary society leadership with governance, finances, and resident communication ownership.',
        default_roles: ['Chairman', 'Secretary', 'Treasurer', 'Member'],
    },
    {
        key: 'HousekeepingCommittee',
        label: 'Housekeeping Committee',
        description: 'Owns cleanliness, vendor supervision, and maintenance follow-through.',
        default_roles: ['Head', 'Supervisor', 'Member'],
    },
    {
        key: 'EventCommittee',
        label: 'Event Committee',
        description: 'Plans celebrations, resident engagement, and event execution.',
        default_roles: ['Coordinator', 'Volunteer', 'Member'],
    },
    {
        key: 'SecurityCommittee',
        label: 'Security Committee',
        description: 'Covers safety reviews, incidents, and security policy decisions.',
        default_roles: ['Head', 'Member'],
    },
    {
        key: 'Custom',
        label: 'Custom Committee',
        description: 'Create your own structure for any society-specific body or working group.',
        default_roles: ['Lead', 'Member'],
    },
];

const PERMISSION_SCOPES = ['Full', 'Communication', 'Finance', 'Tasks', 'ViewOnly', 'Custom'];
const TASK_STATUSES = ['Open', 'InProgress', 'Completed', 'Blocked'];
const TASK_PRIORITIES = ['Low', 'Medium', 'High'];
const COMMITTEE_STATUSES = ['Draft', 'Active', 'Inactive', 'Archived'];
const VOTE_TYPES = ['YesNo', 'SingleChoice'];
const DOCUMENT_CATEGORIES = ['Minutes', 'Budget', 'Policy', 'TaskFile', 'Other'];

const normalizeOptionalString = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const parseDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed.toISOString().slice(0, 10);
};

const parseDateTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDate = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

const formatDateTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const parseJson = (value, fallback = {}) => {
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

const buildPermissionPreset = (scope) => {
    switch (scope) {
        case 'Full':
            return {
                manage_members: true,
                send_notices: true,
                approve_budgets: true,
                manage_tasks: true,
                vote: true,
                manage_documents: true,
            };
        case 'Communication':
            return {
                send_notices: true,
                handle_complaints: true,
                manage_chat: true,
                vote: true,
            };
        case 'Finance':
            return {
                approve_budgets: true,
                view_financials: true,
                vote: true,
            };
        case 'Tasks':
            return {
                manage_tasks: true,
                update_progress: true,
                vote: true,
            };
        case 'ViewOnly':
            return {
                view_directory: true,
                vote: true,
            };
        default:
            return {};
    }
};

const mapCommitteeRow = (row) => ({
    id: row.id,
    committee_type: row.committee_type,
    name: row.name,
    description: row.description || '',
    is_public: Boolean(row.is_public),
    start_date: formatDate(row.start_date),
    end_date: formatDate(row.end_date),
    status: row.status,
    created_at: formatDateTime(row.created_at),
    created_by_name: row.created_by_name || 'Admin',
    member_count: Number(row.member_count || 0),
    open_task_count: Number(row.open_task_count || 0),
    live_vote_count: Number(row.live_vote_count || 0),
    document_count: Number(row.document_count || 0),
});

const mapMemberRow = (row) => ({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    phone_number: row.phone_number,
    email: row.email,
    user_role: row.user_role,
    role_title: row.role_title,
    permission_scope: row.permission_scope,
    permissions: parseJson(row.permissions_json, {}),
    tenure_start_date: formatDate(row.tenure_start_date),
    tenure_end_date: formatDate(row.tenure_end_date),
    is_primary_contact: Boolean(row.is_primary_contact),
    status: row.status,
});

const mapMessageRow = (row) => ({
    id: row.id,
    sender_id: row.sender_id,
    sender_name: row.sender_name,
    sender_role_title: row.sender_role_title || row.sender_role,
    content: row.content,
    attachments: parseJson(row.attachments_json, []),
    is_decision_log: Boolean(row.is_decision_log),
    created_at: formatDateTime(row.created_at),
});

const mapTaskRow = (row) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    status: row.status,
    priority: row.priority,
    due_date: formatDate(row.due_date),
    created_at: formatDateTime(row.created_at),
    assigned_member_id: row.assigned_member_id,
    assigned_to_name: row.assigned_to_name || null,
    assigned_role_title: row.assigned_role_title || null,
});

const mapVoteRow = (row, optionsByVoteId, countsByOptionId, userResponsesByVoteId) => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    decision_type: row.decision_type,
    status: row.status,
    closes_at: formatDateTime(row.closes_at),
    created_at: formatDateTime(row.created_at),
    created_by_name: row.created_by_name || 'Admin',
    selected_option_id: userResponsesByVoteId.get(row.id) || null,
    options: (optionsByVoteId.get(row.id) || []).map((option) => ({
        ...option,
        response_count: countsByOptionId.get(option.id) || 0,
    })),
});

const mapDocumentRow = (row) => ({
    id: row.id,
    title: row.title,
    category: row.category,
    file_url: row.file_url,
    uploaded_by_name: row.uploaded_by_name || 'Admin',
    created_at: formatDateTime(row.created_at),
});

const getCommitteeById = async (committeeId, societyId) => {
    const [rows] = await db.query(
        `SELECT c.*, creator.name AS created_by_name
         FROM Committees c
         LEFT JOIN Users creator ON creator.id = c.created_by
         WHERE c.id = ? AND c.society_id = ?`,
        [committeeId, societyId]
    );
    return rows[0] || null;
};

const getCommitteeMembers = async (committeeId) => {
    const [rows] = await db.query(
        `SELECT
            cm.*,
            u.name,
            u.phone_number,
            u.email,
            u.role AS user_role
         FROM Committee_Members cm
         JOIN Users u ON u.id = cm.user_id
         WHERE cm.committee_id = ?
         ORDER BY cm.is_primary_contact DESC, cm.role_title ASC, u.name ASC`,
        [committeeId]
    );
    return rows.map(mapMemberRow);
};

const getCommitteeMessagesData = async (committeeId) => {
    const [rows] = await db.query(
        `SELECT
            cm.id,
            cm.sender_id,
            cm.content,
            cm.attachments_json,
            cm.is_decision_log,
            cm.created_at,
            u.name AS sender_name,
            u.role AS sender_role,
            cmm.role_title AS sender_role_title
         FROM Committee_Messages cm
         JOIN Users u ON u.id = cm.sender_id
         LEFT JOIN Committee_Members cmm ON cmm.committee_id = cm.committee_id AND cmm.user_id = cm.sender_id
         WHERE cm.committee_id = ?
         ORDER BY cm.created_at DESC
         LIMIT 50`,
        [committeeId]
    );
    return rows.reverse().map(mapMessageRow);
};

const getCommitteeTasksData = async (committeeId) => {
    const [rows] = await db.query(
        `SELECT
            ct.*,
            cm.role_title AS assigned_role_title,
            u.name AS assigned_to_name
         FROM Committee_Tasks ct
         LEFT JOIN Committee_Members cm ON cm.id = ct.assigned_member_id
         LEFT JOIN Users u ON u.id = cm.user_id
         WHERE ct.committee_id = ?
         ORDER BY FIELD(ct.status, 'Open', 'InProgress', 'Blocked', 'Completed'), ct.due_date IS NULL, ct.due_date ASC, ct.created_at DESC`,
        [committeeId]
    );
    return rows.map(mapTaskRow);
};

const getCommitteeVotesData = async (committeeId, currentUserId) => {
    const [votes, options, counts, responses] = await Promise.all([
        db.query(
            `SELECT cv.*, u.name AS created_by_name
             FROM Committee_Votes cv
             LEFT JOIN Users u ON u.id = cv.created_by
             WHERE cv.committee_id = ?
             ORDER BY cv.created_at DESC`,
            [committeeId]
        ),
        db.query(
            `SELECT vote_id, id, option_text
             FROM Committee_Vote_Options
             WHERE vote_id IN (SELECT id FROM Committee_Votes WHERE committee_id = ?)
             ORDER BY id`,
            [committeeId]
        ),
        db.query(
            `SELECT option_id, COUNT(*) AS total
             FROM Committee_Vote_Responses
             WHERE vote_id IN (SELECT id FROM Committee_Votes WHERE committee_id = ?)
             GROUP BY option_id`,
            [committeeId]
        ),
        db.query(
            `SELECT vote_id, option_id
             FROM Committee_Vote_Responses
             WHERE vote_id IN (SELECT id FROM Committee_Votes WHERE committee_id = ?) AND user_id = ?`,
            [committeeId, currentUserId]
        ),
    ]);

    const optionsByVoteId = new Map();
    options[0].forEach((row) => {
        const existing = optionsByVoteId.get(row.vote_id) || [];
        existing.push({ id: row.id, option_text: row.option_text });
        optionsByVoteId.set(row.vote_id, existing);
    });

    const countsByOptionId = new Map(counts[0].map((row) => [row.option_id, Number(row.total)]));
    const userResponsesByVoteId = new Map(responses[0].map((row) => [row.vote_id, row.option_id]));

    return votes[0].map((row) => mapVoteRow(row, optionsByVoteId, countsByOptionId, userResponsesByVoteId));
};

const getCommitteeDocumentsData = async (committeeId) => {
    const [rows] = await db.query(
        `SELECT
            cd.*,
            u.name AS uploaded_by_name
         FROM Committee_Documents cd
         LEFT JOIN Users u ON u.id = cd.uploaded_by
         WHERE cd.committee_id = ?
         ORDER BY cd.created_at DESC`,
        [committeeId]
    );
    return rows.map(mapDocumentRow);
};

const getAvailableMembers = async (societyId) => {
    const [rows] = await db.query(
        `SELECT
            u.id,
            u.name,
            u.phone_number,
            u.email,
            u.role,
            f.block_name,
            f.flat_number
         FROM Users u
         LEFT JOIN User_Flats uf ON uf.user_id = u.id
         LEFT JOIN Flats f ON f.id = uf.flat_id
         WHERE u.society_id = ? AND u.role IN ('ADMIN', 'RESIDENT', 'GUARD')
         ORDER BY FIELD(u.role, 'ADMIN', 'RESIDENT', 'GUARD'), u.name ASC`,
        [societyId]
    );

    return rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone_number: row.phone_number,
        email: row.email,
        role: row.role,
        block_name: row.block_name || '',
        flat_number: row.flat_number || '',
    }));
};

const replaceCommitteeMembers = async (connection, committeeId, societyId, members = []) => {
    await connection.query(`DELETE FROM Committee_Members WHERE committee_id = ?`, [committeeId]);

    if (!Array.isArray(members) || members.length === 0) {
        return;
    }

    const userIds = members.map((member) => Number(member.user_id)).filter(Boolean);
    const [validUsers] = await connection.query(
        `SELECT id FROM Users WHERE society_id = ? AND id IN (${userIds.map(() => '?').join(',')})`,
        [societyId, ...userIds]
    );
    const validUserIds = new Set(validUsers.map((row) => row.id));

    const values = members
        .map((member) => {
            const userId = Number(member.user_id);
            if (!validUserIds.has(userId)) {
                return null;
            }

            const permissionScope = PERMISSION_SCOPES.includes(member.permission_scope) ? member.permission_scope : 'ViewOnly';
            const permissionPayload = permissionScope === 'Custom'
                ? parseJson(member.permissions, {})
                : buildPermissionPreset(permissionScope);

            return [
                committeeId,
                userId,
                normalizeOptionalString(member.role_title) || 'Member',
                permissionScope,
                JSON.stringify(permissionPayload),
                parseDate(member.tenure_start_date),
                parseDate(member.tenure_end_date),
                Boolean(member.is_primary_contact),
                member.status === 'Inactive' ? 'Inactive' : 'Active',
            ];
        })
        .filter(Boolean);

    if (values.length > 0) {
        await connection.query(
            `INSERT INTO Committee_Members (
                committee_id, user_id, role_title, permission_scope, permissions_json,
                tenure_start_date, tenure_end_date, is_primary_contact, status
            ) VALUES ?`,
            [values]
        );
    }
};

exports.getTemplates = async (_req, res) => {
    return res.status(200).json({
        success: true,
        templates: COMMITTEE_TEMPLATES,
        permission_scopes: PERMISSION_SCOPES,
    });
};

exports.getCommittees = async (req, res) => {
    try {
        const [committees, availableMembers] = await Promise.all([
            db.query(
                `SELECT
                    c.*,
                    creator.name AS created_by_name,
                    COUNT(DISTINCT CASE WHEN cm.status = 'Active' THEN cm.id END) AS member_count,
                    COUNT(DISTINCT CASE WHEN ct.status IN ('Open', 'InProgress', 'Blocked') THEN ct.id END) AS open_task_count,
                    COUNT(DISTINCT CASE WHEN cv.status = 'Live' THEN cv.id END) AS live_vote_count,
                    COUNT(DISTINCT cd.id) AS document_count
                 FROM Committees c
                 LEFT JOIN Users creator ON creator.id = c.created_by
                 LEFT JOIN Committee_Members cm ON cm.committee_id = c.id
                 LEFT JOIN Committee_Tasks ct ON ct.committee_id = c.id
                 LEFT JOIN Committee_Votes cv ON cv.committee_id = c.id
                 LEFT JOIN Committee_Documents cd ON cd.committee_id = c.id
                 WHERE c.society_id = ?
                 GROUP BY c.id, creator.name
                 ORDER BY FIELD(c.status, 'Active', 'Draft', 'Inactive', 'Archived'), c.created_at DESC`,
                [req.user.society_id]
            ),
            getAvailableMembers(req.user.society_id),
        ]);

        return res.status(200).json({
            success: true,
            templates: COMMITTEE_TEMPLATES,
            permission_scopes: PERMISSION_SCOPES,
            committees: committees[0].map(mapCommitteeRow),
            available_members: availableMembers,
        });
    } catch (error) {
        console.error('getCommittees error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching committees' });
    }
};

exports.getPublicDirectory = async (req, res) => {
    try {
        const [committees] = await db.query(
            `SELECT *
             FROM Committees
             WHERE society_id = ? AND is_public = TRUE AND status = 'Active'
             ORDER BY name ASC`,
            [req.user.society_id]
        );

        const directory = await Promise.all(
            committees.map(async (committee) => ({
                ...mapCommitteeRow({ ...committee, created_by_name: null, member_count: 0, open_task_count: 0, live_vote_count: 0, document_count: 0 }),
                members: await getCommitteeMembers(committee.id),
            }))
        );

        return res.status(200).json({ success: true, committees: directory });
    } catch (error) {
        console.error('getPublicDirectory error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching committee directory' });
    }
};

exports.createCommittee = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const committeeType = normalizeOptionalString(req.body.committee_type) || 'Custom';
        const name = normalizeOptionalString(req.body.name);
        const description = normalizeOptionalString(req.body.description);
        const startDate = parseDate(req.body.start_date);
        const endDate = parseDate(req.body.end_date);
        const isPublic = req.body.is_public !== false;
        const status = COMMITTEE_STATUSES.includes(req.body.status) ? req.body.status : 'Active';
        const members = Array.isArray(req.body.members) ? req.body.members : [];

        if (!name) {
            return res.status(400).json({ success: false, message: 'Committee name is required' });
        }

        await connection.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO Committees (
                society_id, committee_type, name, description, is_public, start_date, end_date, status, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [req.user.society_id, committeeType, name, description, isPublic, startDate, endDate, status, req.user.id]
        );

        await replaceCommitteeMembers(connection, result.insertId, req.user.society_id, members);
        await connection.commit();

        return res.status(201).json({
            success: true,
            message: 'Committee created successfully',
            committee_id: result.insertId,
        });
    } catch (error) {
        await connection.rollback();
        console.error('createCommittee error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating committee' });
    } finally {
        connection.release();
    }
};

exports.updateCommittee = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const committeeId = Number(req.params.id);
        if (!committeeId) {
            return res.status(400).json({ success: false, message: 'Committee id is required' });
        }

        const existing = await getCommitteeById(committeeId, req.user.society_id);
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Committee not found' });
        }

        const committeeType = normalizeOptionalString(req.body.committee_type) || existing.committee_type;
        const name = normalizeOptionalString(req.body.name) || existing.name;
        const description = normalizeOptionalString(req.body.description);
        const startDate = req.body.start_date !== undefined ? parseDate(req.body.start_date) : formatDate(existing.start_date);
        const endDate = req.body.end_date !== undefined ? parseDate(req.body.end_date) : formatDate(existing.end_date);
        const isPublic = req.body.is_public == null ? Boolean(existing.is_public) : Boolean(req.body.is_public);
        const status = COMMITTEE_STATUSES.includes(req.body.status) ? req.body.status : existing.status;
        const members = Array.isArray(req.body.members) ? req.body.members : null;

        await connection.beginTransaction();
        await connection.query(
            `UPDATE Committees
             SET committee_type = ?, name = ?, description = ?, is_public = ?, start_date = ?, end_date = ?, status = ?
             WHERE id = ? AND society_id = ?`,
            [committeeType, name, description, isPublic, startDate, endDate, status, committeeId, req.user.society_id]
        );

        if (members) {
            await replaceCommitteeMembers(connection, committeeId, req.user.society_id, members);
        }

        await connection.commit();
        return res.status(200).json({ success: true, message: 'Committee updated successfully' });
    } catch (error) {
        await connection.rollback();
        console.error('updateCommittee error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating committee' });
    } finally {
        connection.release();
    }
};

exports.getCommitteeDetail = async (req, res) => {
    try {
        const committeeId = Number(req.params.id);
        if (!committeeId) {
            return res.status(400).json({ success: false, message: 'Committee id is required' });
        }

        const committee = await getCommitteeById(committeeId, req.user.society_id);
        if (!committee) {
            return res.status(404).json({ success: false, message: 'Committee not found' });
        }

        const [members, messages, tasks, votes, documents] = await Promise.all([
            getCommitteeMembers(committeeId),
            getCommitteeMessagesData(committeeId),
            getCommitteeTasksData(committeeId),
            getCommitteeVotesData(committeeId, req.user.id),
            getCommitteeDocumentsData(committeeId),
        ]);

        return res.status(200).json({
            success: true,
            committee: mapCommitteeRow({
                ...committee,
                created_by_name: committee.created_by_name,
                member_count: members.length,
                open_task_count: tasks.filter((task) => task.status !== 'Completed').length,
                live_vote_count: votes.filter((vote) => vote.status === 'Live').length,
                document_count: documents.length,
            }),
            members,
            messages,
            tasks,
            votes,
            documents,
        });
    } catch (error) {
        console.error('getCommitteeDetail error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching committee detail' });
    }
};

exports.getCommitteeMessages = async (req, res) => {
    try {
        const committeeId = Number(req.params.id);
        const committee = await getCommitteeById(committeeId, req.user.society_id);
        if (!committee) {
            return res.status(404).json({ success: false, message: 'Committee not found' });
        }

        const messages = await getCommitteeMessagesData(committeeId);
        return res.status(200).json({ success: true, messages });
    } catch (error) {
        console.error('getCommitteeMessages error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching committee chat' });
    }
};

exports.sendCommitteeMessage = async (req, res) => {
    try {
        const committeeId = Number(req.params.id);
        const content = normalizeOptionalString(req.body.content);
        const attachments = Array.isArray(req.body.attachments) ? req.body.attachments : [];
        const isDecisionLog = Boolean(req.body.is_decision_log);

        if (!committeeId || !content) {
            return res.status(400).json({ success: false, message: 'Committee and message content are required' });
        }

        const committee = await getCommitteeById(committeeId, req.user.society_id);
        if (!committee) {
            return res.status(404).json({ success: false, message: 'Committee not found' });
        }

        await db.query(
            `INSERT INTO Committee_Messages (committee_id, sender_id, content, attachments_json, is_decision_log)
             VALUES (?, ?, ?, ?, ?)`,
            [committeeId, req.user.id, content, JSON.stringify(attachments), isDecisionLog]
        );

        return res.status(201).json({ success: true, message: 'Committee message sent successfully' });
    } catch (error) {
        console.error('sendCommitteeMessage error:', error);
        return res.status(500).json({ success: false, message: 'Server error sending committee message' });
    }
};

exports.createCommitteeTask = async (req, res) => {
    try {
        const committeeId = Number(req.params.id);
        const title = normalizeOptionalString(req.body.title);
        const description = normalizeOptionalString(req.body.description);
        const dueDate = parseDate(req.body.due_date);
        const status = TASK_STATUSES.includes(req.body.status) ? req.body.status : 'Open';
        const priority = TASK_PRIORITIES.includes(req.body.priority) ? req.body.priority : 'Medium';
        const assignedMemberId = Number(req.body.assigned_member_id) || null;

        if (!committeeId || !title) {
            return res.status(400).json({ success: false, message: 'Committee and task title are required' });
        }

        const committee = await getCommitteeById(committeeId, req.user.society_id);
        if (!committee) {
            return res.status(404).json({ success: false, message: 'Committee not found' });
        }

        await db.query(
            `INSERT INTO Committee_Tasks (
                committee_id, title, description, assigned_member_id, due_date, status, priority, created_by
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [committeeId, title, description, assignedMemberId, dueDate, status, priority, req.user.id]
        );

        return res.status(201).json({ success: true, message: 'Committee task created successfully' });
    } catch (error) {
        console.error('createCommitteeTask error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating committee task' });
    }
};

exports.updateCommitteeTask = async (req, res) => {
    try {
        const taskId = Number(req.params.taskId);
        if (!taskId) {
            return res.status(400).json({ success: false, message: 'Task id is required' });
        }

        const status = TASK_STATUSES.includes(req.body.status) ? req.body.status : null;
        const priority = TASK_PRIORITIES.includes(req.body.priority) ? req.body.priority : null;
        const dueDate = req.body.due_date !== undefined ? parseDate(req.body.due_date) : undefined;
        const assignedMemberId = req.body.assigned_member_id !== undefined ? Number(req.body.assigned_member_id) || null : undefined;

        const [rows] = await db.query(
            `SELECT ct.id
             FROM Committee_Tasks ct
             JOIN Committees c ON c.id = ct.committee_id
             WHERE ct.id = ? AND c.society_id = ?`,
            [taskId, req.user.society_id]
        );

        if (!rows[0]) {
            return res.status(404).json({ success: false, message: 'Task not found' });
        }

        const updates = [];
        const params = [];

        if (status) {
            updates.push('status = ?');
            params.push(status);
        }
        if (priority) {
            updates.push('priority = ?');
            params.push(priority);
        }
        if (dueDate !== undefined) {
            updates.push('due_date = ?');
            params.push(dueDate);
        }
        if (assignedMemberId !== undefined) {
            updates.push('assigned_member_id = ?');
            params.push(assignedMemberId);
        }

        if (updates.length === 0) {
            return res.status(400).json({ success: false, message: 'No task updates provided' });
        }

        params.push(taskId);
        await db.query(`UPDATE Committee_Tasks SET ${updates.join(', ')} WHERE id = ?`, params);

        return res.status(200).json({ success: true, message: 'Task updated successfully' });
    } catch (error) {
        console.error('updateCommitteeTask error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating committee task' });
    }
};

exports.createCommitteeVote = async (req, res) => {
    const connection = await db.getConnection();
    try {
        const committeeId = Number(req.params.id);
        const title = normalizeOptionalString(req.body.title);
        const description = normalizeOptionalString(req.body.description);
        const decisionType = VOTE_TYPES.includes(req.body.decision_type) ? req.body.decision_type : 'YesNo';
        const closesAt = parseDateTime(req.body.closes_at);
        const status = ['Draft', 'Live', 'Closed'].includes(req.body.status) ? req.body.status : 'Live';
        const options = decisionType === 'YesNo'
            ? ['Yes', 'No']
            : Array.isArray(req.body.options)
                ? req.body.options.map((item) => String(item || '').trim()).filter(Boolean)
                : [];

        if (!committeeId || !title || options.length < 2) {
            return res.status(400).json({ success: false, message: 'Vote title and at least two options are required' });
        }

        const committee = await getCommitteeById(committeeId, req.user.society_id);
        if (!committee) {
            return res.status(404).json({ success: false, message: 'Committee not found' });
        }

        await connection.beginTransaction();
        const [result] = await connection.query(
            `INSERT INTO Committee_Votes (committee_id, title, description, decision_type, status, closes_at, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [committeeId, title, description, decisionType, status, closesAt, req.user.id]
        );

        const optionValues = options.map((optionText) => [result.insertId, optionText]);
        await connection.query(
            `INSERT INTO Committee_Vote_Options (vote_id, option_text) VALUES ?`,
            [optionValues]
        );

        await connection.commit();
        return res.status(201).json({ success: true, message: 'Committee vote created successfully', vote_id: result.insertId });
    } catch (error) {
        await connection.rollback();
        console.error('createCommitteeVote error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating committee vote' });
    } finally {
        connection.release();
    }
};

exports.respondToCommitteeVote = async (req, res) => {
    try {
        const voteId = Number(req.params.voteId);
        const optionId = Number(req.body.option_id);

        if (!voteId || !optionId) {
            return res.status(400).json({ success: false, message: 'Vote and option are required' });
        }

        const [rows] = await db.query(
            `SELECT
                cv.id,
                cv.status,
                cv.closes_at,
                c.society_id,
                cm.id AS membership_id
             FROM Committee_Votes cv
             JOIN Committees c ON c.id = cv.committee_id
             LEFT JOIN Committee_Members cm ON cm.committee_id = c.id AND cm.user_id = ? AND cm.status = 'Active'
             WHERE cv.id = ?`,
            [req.user.id, voteId]
        );

        const vote = rows[0];
        if (!vote || vote.society_id !== req.user.society_id) {
            return res.status(404).json({ success: false, message: 'Vote not found' });
        }
        if (!vote.membership_id) {
            return res.status(403).json({ success: false, message: 'Only active committee members can vote' });
        }
        if (vote.status !== 'Live' || (vote.closes_at && new Date(vote.closes_at).getTime() < Date.now())) {
            return res.status(400).json({ success: false, message: 'Voting is closed for this decision' });
        }

        const [validOption] = await db.query(
            `SELECT id FROM Committee_Vote_Options WHERE id = ? AND vote_id = ?`,
            [optionId, voteId]
        );
        if (!validOption[0][0]) {
            return res.status(400).json({ success: false, message: 'Selected option is invalid' });
        }

        await db.query(
            `INSERT INTO Committee_Vote_Responses (vote_id, user_id, option_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE option_id = VALUES(option_id), responded_at = NOW()`,
            [voteId, req.user.id, optionId]
        );

        return res.status(200).json({ success: true, message: 'Vote submitted successfully' });
    } catch (error) {
        console.error('respondToCommitteeVote error:', error);
        return res.status(500).json({ success: false, message: 'Server error submitting committee vote' });
    }
};

exports.createCommitteeDocument = async (req, res) => {
    try {
        const committeeId = Number(req.params.id);
        const title = normalizeOptionalString(req.body.title);
        const category = DOCUMENT_CATEGORIES.includes(req.body.category) ? req.body.category : 'Other';
        const fileUrl = normalizeOptionalString(req.body.file_url);

        if (!committeeId || !title || !fileUrl) {
            return res.status(400).json({ success: false, message: 'Committee, document title, and file are required' });
        }

        const committee = await getCommitteeById(committeeId, req.user.society_id);
        if (!committee) {
            return res.status(404).json({ success: false, message: 'Committee not found' });
        }

        await db.query(
            `INSERT INTO Committee_Documents (committee_id, title, category, file_url, uploaded_by)
             VALUES (?, ?, ?, ?, ?)`,
            [committeeId, title, category, fileUrl, req.user.id]
        );

        return res.status(201).json({ success: true, message: 'Committee document added successfully' });
    } catch (error) {
        console.error('createCommitteeDocument error:', error);
        return res.status(500).json({ success: false, message: 'Server error adding committee document' });
    }
};
