const db = require('../config/db');
const path = require('path');
const jwt = require('jsonwebtoken');
const { getIO } = require('../websocket/socket');
const { sendBulkSms } = require('../services/smsService');
const { sendPushToFlatResidents, sendPushToFlatApprovalResidents, sendPushToSocietyGuards } = require('../services/pushNotificationService');
const { buildUploadPublicPath } = require('../config/uploads');

const VISITOR_TYPES = ['Guest', 'Delivery', 'Cab', 'Service', 'Unknown'];
const DEFAULT_RULES = {
    visitorApprovalRequired: true,
    deliveryAutoEntry: false,
    cabApprovalRequired: true,
    serviceApprovalRequired: true,
    nightEntryRestriction: false,
    contactlessDeliveryEnabled: false,
    smsFallbackEnabled: false,
};

const FRONTEND_BASE_URL = process.env.FRONTEND_BASE_URL || process.env.APP_BASE_URL || 'http://localhost:3000';

const normalizeSettings = (rawSettings) => {
    if (!rawSettings) return {};
    if (typeof rawSettings === 'string') {
        try {
            return JSON.parse(rawSettings);
        } catch {
            return {};
        }
    }
    return rawSettings;
};

const normalizeOptionalString = (value) => {
    const normalized = String(value || '').trim();
    return normalized || null;
};

const normalizePhone = (value) => String(value || '').replace(/\D/g, '');

const normalizeFlatIds = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(
        value
            .map((item) => Number(item))
            .filter((item) => Number.isInteger(item) && item > 0)
    )];
};

const resolveFlatId = async ({ flat_id, block_name, flat_number, society_id }) => {
    if (flat_id) {
        return Number(flat_id);
    }

    if (!block_name || !flat_number) {
        return null;
    }

    const [flats] = await db.query(
        'SELECT id FROM flats WHERE society_id = ? AND block_name = ? AND flat_number = ?',
        [society_id, block_name, flat_number]
    );

    return flats[0]?.id || null;
};

const resolveFlatTargets = async ({ flat_ids, flat_id, block_name, flat_number, society_id }) => {
    const requestedFlatIds = normalizeFlatIds(flat_ids);

    if (requestedFlatIds.length > 0) {
        const placeholders = requestedFlatIds.map(() => '?').join(', ');
        const [rows] = await db.query(
            `SELECT id, block_name, flat_number
             FROM flats
             WHERE society_id = ? AND id IN (${placeholders})`,
            [society_id, ...requestedFlatIds]
        );

        if (rows.length !== requestedFlatIds.length) {
            return [];
        }

        const flatMap = new Map(rows.map((row) => [row.id, row]));
        return requestedFlatIds.map((id) => flatMap.get(id)).filter(Boolean);
    }

    const resolvedFlatId = await resolveFlatId({
        flat_id,
        block_name,
        flat_number,
        society_id,
    });

    if (!resolvedFlatId) {
        return [];
    }

    const [rows] = await db.query(
        `SELECT id, block_name, flat_number
         FROM flats
         WHERE id = ? AND society_id = ?
         LIMIT 1`,
        [resolvedFlatId, society_id]
    );

    return rows;
};

const getSocietyRules = async (societyId) => {
    const [rows] = await db.query(
        'SELECT config_settings FROM societies WHERE id = ?',
        [societyId]
    );

    return { ...DEFAULT_RULES, ...normalizeSettings(rows[0]?.config_settings) };
};

const buildUploadedFilePayload = (req, file) => {
    const relativePath = buildUploadPublicPath(file.path);
    return {
        file_name: file.filename,
        file_path: relativePath,
        url: `${req.protocol}://${req.get('host')}${relativePath}`,
        mime_type: file.mimetype,
        size: file.size,
    };
};

const buildPasscode = (logId) => `GP${String(logId).padStart(6, '0')}`;

const emitToRooms = (rooms, eventName, payload) => {
    try {
        const io = getIO();
        rooms.forEach((room) => io.to(room).emit(eventName, payload));
    } catch (error) {
        console.warn('WebSocket emit skipped:', error.message);
    }
};

const buildLiveRooms = ({ societyId, flatId, residentUserIds = [] }) => (
    [
        `flat_${flatId}`,
        `society_${societyId}_guards`,
        `society_${societyId}_admins`,
        ...residentUserIds.map((userId) => `resident_${userId}`),
    ]
);

const formatDateValue = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
};

const minutesBetween = (start, end) => {
    if (!start || !end) return null;
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
};

const mapVisitorLogRow = (row) => ({
    id: row.id,
    visitor_id: row.visitor_id,
    visitor_name: row.visitor_name,
    visitor_phone: row.visitor_phone,
    visitor_photo_url: row.visitor_photo_url || row.master_photo_url || '',
    block_name: row.block_name,
    flat_number: row.flat_number,
    flat_id: row.flat_id,
    purpose: row.purpose,
    visitor_type: row.purpose,
    status: row.status,
    passcode: row.passcode,
    expected_time: formatDateValue(row.expected_time),
    entry_time: formatDateValue(row.entry_time),
    exit_time: formatDateValue(row.exit_time),
    delivery_company: row.delivery_company || '',
    vehicle_number: row.vehicle_number || '',
    entry_method: row.entry_method || 'WalkIn',
    approval_type: row.approval_type || 'Manual',
    contactless_delivery: Boolean(row.contactless_delivery),
    requested_by_user_id: row.requested_by_user_id || null,
    approval_requested_at: formatDateValue(row.approval_requested_at),
    approval_decision_at: formatDateValue(row.approval_decision_at),
    duration_minutes: minutesBetween(row.entry_time, row.exit_time),
    is_vip: Boolean(row.is_vip),
    is_blacklisted: Boolean(row.is_blacklisted),
    is_watchlisted: Boolean(row.is_watchlisted),
    watchlist_reason: row.watchlist_reason || '',
  });

const validateVisitorType = (value) => {
    const normalized = String(value || '').trim();
    return VISITOR_TYPES.includes(normalized) ? normalized : null;
};

const validatePreApprovedPayload = (payload) => {
    const purpose = validateVisitorType(payload.purpose);
    const phone_number = normalizePhone(payload.phone_number);

    if (!payload.name || !phone_number || !purpose) {
        return { error: 'Visitor name, phone, and visitor type are required' };
    }

    return {
        value: {
            name: String(payload.name).trim(),
            phone_number,
            purpose,
            expected_time: normalizeOptionalString(payload.expected_time),
            delivery_company: normalizeOptionalString(payload.delivery_company),
            vehicle_number: normalizeOptionalString(payload.vehicle_number),
            visitor_photo_url: normalizeOptionalString(payload.visitor_photo_url),
            contactless_delivery: Boolean(payload.contactless_delivery),
        }
    };
};

const ensureVisitor = async ({ society_id, name, phone_number, visitor_photo_url }) => {
    const [visitors] = await db.query(
        `SELECT id, is_blacklisted, is_watchlisted, watchlist_reason
         FROM visitors
         WHERE society_id = ? AND phone_number = ?`,
        [society_id, phone_number]
    );

    if (visitors.length > 0) {
        const visitor = visitors[0];

        if (visitor.is_blacklisted) {
            return { error: 'Visitor is blacklisted and cannot enter' };
        }

        await db.query(
            `UPDATE visitors
             SET name = ?, photo_url = COALESCE(?, photo_url)
             WHERE id = ?`,
            [name, visitor_photo_url, visitor.id]
        );

        return {
            visitorId: visitor.id,
            is_watchlisted: Boolean(visitor.is_watchlisted),
            watchlist_reason: visitor.watchlist_reason || '',
        };
    }

    const [result] = await db.query(
        `INSERT INTO visitors (name, phone_number, society_id, photo_url)
         VALUES (?, ?, ?, ?)`,
        [name, phone_number, society_id, visitor_photo_url]
    );

    return {
        visitorId: result.insertId,
        is_watchlisted: false,
        watchlist_reason: '',
    };
};

const requireResidentFlatAccess = async (userId, flatId) => {
    const [rows] = await db.query(
        'SELECT flat_id FROM user_flats WHERE user_id = ? AND flat_id = ?',
        [userId, flatId]
    );

    return rows.length > 0;
};

const requireResidentApprovalAccess = async (userId, flatId) => {
    const [rows] = await db.query(
        `SELECT uf.flat_id
         FROM user_flats uf
         INNER JOIN users u ON u.id = uf.user_id
         WHERE uf.user_id = ? AND uf.flat_id = ? AND u.role = 'RESIDENT' AND u.status = 'ACTIVE'
           AND COALESCE(u.can_approve_visitors, 1) = 1
         LIMIT 1`,
        [userId, flatId]
    );

    return rows.length > 0;
};

const getFlatResidentUserIds = async (flatId) => {
    const [rows] = await db.query(
        `SELECT DISTINCT u.id
         FROM user_flats uf
         INNER JOIN users u ON u.id = uf.user_id
         WHERE uf.flat_id = ? AND u.role = 'RESIDENT' AND u.status = 'ACTIVE'`,
        [flatId]
    );

    return rows.map((row) => row.id);
};

const getFlatApprovalResidentUserIds = async (flatId) => {
    const [rows] = await db.query(
        `SELECT DISTINCT u.id
         FROM user_flats uf
         INNER JOIN users u ON u.id = uf.user_id
         WHERE uf.flat_id = ? AND u.role = 'RESIDENT' AND u.status = 'ACTIVE'
           AND COALESCE(u.can_approve_visitors, 1) = 1`,
        [flatId]
    );

    return rows.map((row) => row.id);
};

const getFlatResidentNotificationTargets = async (flatId) => {
    const [rows] = await db.query(
        `SELECT DISTINCT u.id, u.phone_number
         FROM user_flats uf
         INNER JOIN users u ON u.id = uf.user_id
         WHERE uf.flat_id = ? AND u.role = 'RESIDENT' AND u.status = 'ACTIVE'
           AND COALESCE(u.sms_alerts, 0) = 1 AND COALESCE(u.can_approve_visitors, 1) = 1`,
        [flatId]
    );

    return rows.map((row) => ({
        user_id: row.id,
        phone_number: row.phone_number,
    }));
};

const buildApprovalDecisionToken = ({ logId, flatId, societyId }) => jwt.sign(
    {
        type: 'VISITOR_APPROVAL',
        log_id: logId,
        flat_id: flatId,
        society_id: societyId,
    },
    process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token',
    { expiresIn: '4h' }
);

const buildApprovalDecisionLink = ({ token, decision }) => (
    `${FRONTEND_BASE_URL}/visitor-approval?token=${encodeURIComponent(token)}&decision=${encodeURIComponent(decision)}`
);

const sendApprovalFallbackSms = async ({
    flatId,
    societyId,
    logId,
    visitorName,
    visitorType,
    blockName,
    flatNumber,
}) => {
    const recipients = await getFlatResidentNotificationTargets(flatId);
    if (recipients.length === 0) {
        return {
            attempted: 0,
            sent: 0,
            enabled: true,
            skipped: true,
            reason: 'No resident SMS recipients are enabled for this flat',
        };
    }

    const token = buildApprovalDecisionToken({ logId, flatId, societyId });
    const approveLink = buildApprovalDecisionLink({ token, decision: 'approve' });
    const denyLink = buildApprovalDecisionLink({ token, decision: 'deny' });
    const message = `GatePulse: ${visitorName} (${visitorType}) is waiting at ${blockName}-${flatNumber}. Approve: ${approveLink} Deny: ${denyLink}`;
    const delivery = await sendBulkSms({
        recipients: recipients.map((recipient) => recipient.phone_number),
        body: message,
    });

    return {
        ...delivery,
        enabled: true,
        approve_link: approveLink,
        deny_link: denyLink,
    };
};

const notifyPushSafely = async (task) => {
    try {
        await task();
    } catch (error) {
        console.warn('Push notification skipped:', error.message);
    }
};

const applyVisitorDecision = async ({ logId, nextStatus, approvalType = 'Manual' }) => {
    const [logs] = await db.query(
        `SELECT
            vl.id,
            vl.flat_id,
            vl.entry_method,
            v.society_id,
            v.name AS visitor_name,
            vl.purpose,
            f.block_name,
            f.flat_number
         FROM visitor_logs vl
         JOIN visitors v ON v.id = vl.visitor_id
         JOIN flats f ON f.id = vl.flat_id
         WHERE vl.id = ? AND vl.status = 'Pending'`,
        [logId]
    );

    const log = logs[0];
    if (!log) {
        return { error: 'Pending visitor request not found', code: 404 };
    }

    const resolvedStatus = nextStatus === 'Approved' && log.entry_method === 'WalkIn'
        ? 'CheckedIn'
        : nextStatus;

    await db.query(
        `UPDATE visitor_logs
         SET status = ?, approval_type = ?, approval_decision_at = NOW(),
             entry_time = CASE
                 WHEN ? = 'CheckedIn' THEN COALESCE(entry_time, NOW())
                 ELSE entry_time
             END
         WHERE id = ?`,
        [resolvedStatus, approvalType, resolvedStatus, logId]
    );

    const residentUserIds = await getFlatResidentUserIds(log.flat_id);
    const approvalResidentUserIds = await getFlatApprovalResidentUserIds(log.flat_id);
    emitToRooms(
        buildLiveRooms({
            societyId: log.society_id,
            flatId: log.flat_id,
            residentUserIds,
        }),
        'visitor_status_updated',
        {
            log_id: logId,
            flat_id: log.flat_id,
            status: resolvedStatus,
            visitor_name: log.visitor_name,
            visitor_type: log.purpose,
        }
    );

    await notifyPushSafely(async () => {
        if (resolvedStatus === 'CheckedIn') {
            await sendPushToSocietyGuards({
                societyId: log.society_id,
                title: 'Visitor approved',
                body: `${log.visitor_name} has been approved for ${log.block_name}-${log.flat_number}.`,
                data: { type: 'visitor_status_updated', log_id: logId, status: resolvedStatus, flat_id: log.flat_id },
            });
        } else if (resolvedStatus === 'Denied') {
            await sendPushToSocietyGuards({
                societyId: log.society_id,
                title: 'Visitor denied',
                body: `${log.visitor_name} was denied for ${log.block_name}-${log.flat_number}.`,
                data: { type: 'visitor_status_updated', log_id: logId, status: resolvedStatus, flat_id: log.flat_id },
            });
        }
    });

    if (approvalResidentUserIds.length && resolvedStatus === 'Denied') {
        await notifyPushSafely(async () => {
            await sendPushToFlatResidents({
                flatId: log.flat_id,
                title: 'Visitor denied',
                body: `${log.visitor_name} was denied for ${log.block_name}-${log.flat_number}.`,
                data: { type: 'visitor_status_updated', log_id: logId, flat_id: log.flat_id, status: resolvedStatus },
            });
        });
    }

    return { log, status: resolvedStatus };
};

const createWalkInLog = async ({ req, flatTarget, payload, rules: providedRules, visitorInfo: providedVisitorInfo }) => {
    const flatId = Number(flatTarget?.id || 0);
    if (!flatId) {
        return { error: 'A valid flat is required for walk-in visitors' };
    }

    const rules = providedRules || await getSocietyRules(req.user.society_id);
    const visitorInfo = providedVisitorInfo || await ensureVisitor({
        society_id: req.user.society_id,
        name: payload.name,
        phone_number: payload.phone_number,
        visitor_photo_url: payload.visitor_photo_url,
    });

    if (visitorInfo.error) {
        return { error: visitorInfo.error };
    }

    const now = new Date();
    const currentHour = now.getHours();
    const nightRestricted = Boolean(rules.nightEntryRestriction) && (currentHour >= 23 || currentHour < 5);

    let approvalRequired = Boolean(rules.visitorApprovalRequired);
    let autoEntry = false;

    if (payload.purpose === 'Delivery') {
        autoEntry = Boolean(rules.deliveryAutoEntry) && !nightRestricted;
        approvalRequired = !autoEntry;
    }

    if (payload.purpose === 'Cab') {
        approvalRequired = Boolean(rules.cabApprovalRequired ?? true) || nightRestricted;
    }

    if (payload.purpose === 'Service') {
        approvalRequired = Boolean(rules.serviceApprovalRequired ?? true) || nightRestricted;
    }

    if (payload.purpose === 'Unknown') {
        approvalRequired = true;
    }

    const status = autoEntry ? 'CheckedIn' : approvalRequired ? 'Pending' : 'CheckedIn';
    const approvalType = autoEntry ? 'Auto' : 'Manual';
    const entryMethod = autoEntry ? 'DeliveryAuto' : 'WalkIn';

    const [result] = await db.query(
        `INSERT INTO visitor_logs (
            visitor_id, flat_id, status, purpose, expected_time, passcode, approval_type, entry_method,
            delivery_company, vehicle_number, visitor_photo_url, contactless_delivery,
            requested_by_user_id, approval_requested_at, approval_decision_at, entry_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            visitorInfo.visitorId,
            flatId,
            status,
            payload.purpose,
            payload.expected_time,
            null,
            approvalType,
            entryMethod,
            payload.delivery_company,
            payload.vehicle_number,
            payload.visitor_photo_url,
            payload.contactless_delivery,
            null,
            approvalRequired ? now : null,
            autoEntry ? now : null,
            status === 'CheckedIn' ? now : null,
        ]
    );

    const residentUserIds = await getFlatResidentUserIds(flatId);
    const flat = flatTarget?.block_name
        ? flatTarget
        : { block_name: '', flat_number: '' };
    let smsFallback = {
        attempted: 0,
        sent: 0,
        enabled: Boolean(rules.smsFallbackEnabled),
        skipped: !rules.smsFallbackEnabled,
        reason: rules.smsFallbackEnabled ? 'SMS fallback not required' : 'SMS fallback disabled',
    };

    if (approvalRequired && rules.smsFallbackEnabled) {
        smsFallback = await sendApprovalFallbackSms({
            flatId,
            societyId: req.user.society_id,
            logId: result.insertId,
            visitorName: payload.name,
            visitorType: payload.purpose,
            blockName: flat.block_name,
            flatNumber: flat.flat_number,
        });
    }

    const baseEvent = {
        log_id: result.insertId,
        flat_id: flatId,
        visitor_name: payload.name,
        visitor_type: payload.purpose,
        status,
        delivery_company: payload.delivery_company,
        vehicle_number: payload.vehicle_number,
        requires_approval: approvalRequired,
        sms_fallback_sent: smsFallback.sent,
    };

    emitToRooms(
        buildLiveRooms({
            societyId: req.user.society_id,
            flatId,
            residentUserIds,
        }),
        approvalRequired ? 'visitor_pending_approval' : 'visitor_status_updated',
        baseEvent
    );

    await notifyPushSafely(async () => {
        if (approvalRequired) {
            await sendPushToFlatApprovalResidents({
                flatId,
                title: 'Visitor waiting at gate',
                body: `${payload.name} (${payload.purpose}) is waiting at ${flat.block_name}-${flat.flat_number}.`,
                data: { type: 'visitor_pending_approval', log_id: result.insertId, flat_id: flatId, status },
            });
            return;
        }

        await sendPushToFlatResidents({
            flatId,
            title: 'Visitor entered society',
            body: `${payload.name} (${payload.purpose}) checked in at ${flat.block_name}-${flat.flat_number}.`,
            data: { type: 'visitor_status_updated', log_id: result.insertId, flat_id: flatId, status },
        });
    });

    return {
        success: true,
        log_id: result.insertId,
        flat_id: flatId,
        block_name: flat.block_name || '',
        flat_number: flat.flat_number || '',
        status,
        approval_required: approvalRequired,
        auto_entry: autoEntry,
        sms_fallback: smsFallback,
        is_watchlisted: visitorInfo.is_watchlisted,
        watchlist_reason: visitorInfo.watchlist_reason,
    };
};

exports.getLogs = async (req, res) => {
    try {
        const { role, id: userId, society_id: societyId } = req.user;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const offset = (page - 1) * limit;

        let query = `
            SELECT
                vl.*,
                v.name AS visitor_name,
                v.phone_number AS visitor_phone,
                v.photo_url AS master_photo_url,
                v.is_vip,
                v.is_blacklisted,
                v.is_watchlisted,
                v.watchlist_reason,
                f.block_name,
                f.flat_number
            FROM visitor_logs vl
            JOIN visitors v ON vl.visitor_id = v.id
            JOIN flats f ON vl.flat_id = f.id
        `;

        let countQuery = `
            SELECT COUNT(*) AS total
            FROM visitor_logs vl
            JOIN visitors v ON vl.visitor_id = v.id
            JOIN flats f ON vl.flat_id = f.id
        `;

        const whereClauses = ['v.society_id = ?'];
        const queryParams = [societyId];
        const countParams = [societyId];

        if (role === 'RESIDENT') {
            query += ' JOIN user_flats uf ON uf.flat_id = f.id ';
            countQuery += ' JOIN user_flats uf ON uf.flat_id = f.id ';
            whereClauses.push('uf.user_id = ?');
            queryParams.push(userId);
            countParams.push(userId);
        }

        if (req.query.status) {
            whereClauses.push('vl.status = ?');
            queryParams.push(req.query.status);
            countParams.push(req.query.status);
        }

        if (req.query.visitor_type) {
            whereClauses.push('vl.purpose = ?');
            queryParams.push(req.query.visitor_type);
            countParams.push(req.query.visitor_type);
        }

        if (req.query.flat_id) {
            whereClauses.push('vl.flat_id = ?');
            queryParams.push(Number(req.query.flat_id));
            countParams.push(Number(req.query.flat_id));
        }

        if (req.query.active_only === 'true') {
            whereClauses.push(`vl.status IN ('Approved', 'CheckedIn', 'Pending')`);
        }

        if (req.query.date_from) {
            whereClauses.push('DATE(COALESCE(vl.entry_time, vl.expected_time, vl.approval_requested_at)) >= ?');
            queryParams.push(req.query.date_from);
            countParams.push(req.query.date_from);
        }

        if (req.query.date_to) {
            whereClauses.push('DATE(COALESCE(vl.entry_time, vl.expected_time, vl.approval_requested_at)) <= ?');
            queryParams.push(req.query.date_to);
            countParams.push(req.query.date_to);
        }

        if (req.query.search) {
            const searchTerm = `%${String(req.query.search).trim()}%`;
            whereClauses.push('(v.name LIKE ? OR v.phone_number LIKE ? OR f.block_name LIKE ? OR f.flat_number LIKE ? OR vl.passcode LIKE ? OR vl.vehicle_number LIKE ?)');
            queryParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
            countParams.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
        }

        const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';
        query += `${whereSql} ORDER BY COALESCE(vl.entry_time, vl.expected_time, vl.approval_requested_at, vl.id) DESC, vl.id DESC LIMIT ? OFFSET ?`;
        countQuery += whereSql;
        queryParams.push(limit, offset);

        const [logs] = await db.query(query, queryParams);
        const [countResult] = await db.query(countQuery, countParams);

        return res.status(200).json({
            success: true,
            total: countResult[0].total,
            page,
            limit,
            logs: logs.map(mapVisitorLogRow),
        });
    } catch (error) {
        console.error('getLogs error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching visitor logs' });
    }
};

exports.getPendingApprovals = async (req, res) => {
    try {
        const { role, id: userId, society_id: societyId } = req.user;
        let query = `
            SELECT
                vl.*,
                v.name AS visitor_name,
                v.phone_number AS visitor_phone,
                v.photo_url AS master_photo_url,
                v.is_vip,
                v.is_blacklisted,
                v.is_watchlisted,
                v.watchlist_reason,
                f.block_name,
                f.flat_number
            FROM visitor_logs vl
            JOIN visitors v ON vl.visitor_id = v.id
            JOIN flats f ON vl.flat_id = f.id
        `;
        const params = [societyId];
        const whereClauses = ['v.society_id = ?', `vl.status = 'Pending'`];

        if (role === 'RESIDENT') {
            query += ' JOIN user_flats uf ON uf.flat_id = f.id ';
            whereClauses.push('uf.user_id = ?');
            params.push(userId);
        }

        query += ` WHERE ${whereClauses.join(' AND ')} ORDER BY COALESCE(vl.approval_requested_at, vl.id) DESC, vl.id DESC`;
        const [logs] = await db.query(query, params);
        return res.status(200).json({ success: true, approvals: logs.map(mapVisitorLogRow) });
    } catch (error) {
        console.error('getPendingApprovals error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching pending approvals' });
    }
};

exports.getRules = async (req, res) => {
    try {
        const settings = await getSocietyRules(req.user.society_id);
        return res.status(200).json({ success: true, rules: settings });
    } catch (error) {
        console.error('getRules error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving visitor rules' });
    }
};

exports.updateRules = async (req, res) => {
    try {
        const currentRules = await getSocietyRules(req.user.society_id);
        const nextRules = { ...currentRules, ...req.body.rules };

        await db.query(
            `UPDATE societies SET config_settings = ? WHERE id = ?`,
            [JSON.stringify(nextRules), req.user.society_id]
        );

        return res.status(200).json({ success: true, message: 'Visitor rules updated successfully', rules: nextRules });
    } catch (error) {
        console.error('updateRules error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating visitor rules' });
    }
};

exports.uploadVisitorPhoto = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Visitor photo is required' });
    }

    return res.status(200).json({
        success: true,
        message: 'Visitor photo uploaded successfully',
        file: buildUploadedFilePayload(req, req.file),
    });
};

exports.preApproveVisitor = async (req, res) => {
    try {
        const validation = validatePreApprovedPayload(req.body);
        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }

        const flatId = await resolveFlatId({
            flat_id: req.body.flat_id,
            block_name: req.body.block_name,
            flat_number: req.body.flat_number,
            society_id: req.user.society_id,
        });

        if (!flatId) {
            return res.status(400).json({ success: false, message: 'A valid flat is required' });
        }

        if (req.user.role === 'RESIDENT') {
            const allowed = await requireResidentApprovalAccess(req.user.id, flatId);
            if (!allowed) {
                return res.status(403).json({ success: false, message: 'You need resident approval access for this flat' });
            }
        }

        const visitorInfo = await ensureVisitor({
            society_id: req.user.society_id,
            name: validation.value.name,
            phone_number: validation.value.phone_number,
            visitor_photo_url: validation.value.visitor_photo_url,
        });

        if (visitorInfo.error) {
            return res.status(403).json({ success: false, message: visitorInfo.error });
        }

        const now = new Date();
        const [logResult] = await db.query(
            `INSERT INTO visitor_logs (
                visitor_id, flat_id, status, purpose, expected_time, approval_type, entry_method,
                delivery_company, vehicle_number, visitor_photo_url, contactless_delivery,
                requested_by_user_id, approval_requested_at, approval_decision_at
            ) VALUES (?, ?, 'Approved', ?, ?, 'Manual', 'PreApproved', ?, ?, ?, ?, ?, ?, ?)`,
            [
                visitorInfo.visitorId,
                flatId,
                validation.value.purpose,
                validation.value.expected_time,
                validation.value.delivery_company,
                validation.value.vehicle_number,
                validation.value.visitor_photo_url,
                validation.value.contactless_delivery,
                req.user.id,
                now,
                now,
            ]
        );

        const passcode = buildPasscode(logResult.insertId);
        await db.query('UPDATE visitor_logs SET passcode = ? WHERE id = ?', [passcode, logResult.insertId]);

        emitToRooms(
            buildLiveRooms({
                societyId: req.user.society_id,
                flatId,
            }),
            'visitor_status_updated',
            {
                log_id: logResult.insertId,
                flat_id: flatId,
                visitor_name: validation.value.name,
                visitor_type: validation.value.purpose,
                status: 'Approved',
                passcode,
            }
        );

        await notifyPushSafely(async () => {
            await sendPushToSocietyGuards({
                societyId: req.user.society_id,
                title: 'Pre-approved visitor ready',
                body: `${validation.value.name} has a gate pass for flat ${flatId}.`,
                data: { type: 'visitor_status_updated', log_id: logResult.insertId, flat_id: flatId, status: 'Approved', passcode },
            });
        });

        return res.status(201).json({
            success: true,
            message: 'Visitor pre-approved',
            passcode,
            log_id: logResult.insertId,
            is_watchlisted: visitorInfo.is_watchlisted,
            watchlist_reason: visitorInfo.watchlist_reason,
        });
    } catch (error) {
        console.error('preApprove error:', error);
        return res.status(500).json({ success: false, message: 'Server error pre-approving visitor' });
    }
};

exports.createWalkInVisitor = async (req, res) => {
    try {
        const validation = validatePreApprovedPayload(req.body);
        if (validation.error) {
            return res.status(400).json({ success: false, message: validation.error });
        }

        const flatTargets = await resolveFlatTargets({
            flat_ids: req.body.flat_ids,
            flat_id: req.body.flat_id,
            block_name: req.body.block_name,
            flat_number: req.body.flat_number,
            society_id: req.user.society_id,
        });

        if (!flatTargets.length) {
            return res.status(400).json({ success: false, message: 'A valid flat is required for walk-in visitors' });
        }

        if (validation.value.purpose !== 'Delivery' && flatTargets.length > 1) {
            return res.status(400).json({ success: false, message: 'Multiple flats can only be selected for delivery visitors' });
        }

        const rules = await getSocietyRules(req.user.society_id);
        const visitorInfo = await ensureVisitor({
            society_id: req.user.society_id,
            name: validation.value.name,
            phone_number: validation.value.phone_number,
            visitor_photo_url: validation.value.visitor_photo_url,
        });

        if (visitorInfo.error) {
            return res.status(400).json({ success: false, message: visitorInfo.error });
        }

        const results = [];
        for (const flatTarget of flatTargets) {
            const result = await createWalkInLog({
                req,
                flatTarget,
                payload: validation.value,
                rules,
                visitorInfo,
            });

            if (result.error) {
                return res.status(400).json({ success: false, message: result.error });
            }

            results.push(result);
        }

        const approvalRequiredCount = results.filter((result) => result.approval_required).length;
        const checkedInCount = results.filter((result) => result.status === 'CheckedIn').length;
        const createdLogIds = results.map((result) => result.log_id);
        const targetFlats = results.map((result) => ({
            flat_id: result.flat_id,
            block_name: result.block_name,
            flat_number: result.flat_number,
        }));

        let message = approvalRequiredCount > 0
            ? 'Resident approval requested'
            : 'Visitor checked in successfully';

        if (results.length > 1) {
            message = approvalRequiredCount > 0
                ? `Resident approval requested for ${approvalRequiredCount} flats`
                : `Visitor checked in for ${checkedInCount} flats`;
        }

        return res.status(201).json({
            success: true,
            message,
            log_id: results[0]?.log_id || null,
            log_ids: createdLogIds,
            target_flats: targetFlats,
            target_flats_count: results.length,
            approval_required: approvalRequiredCount > 0,
            approval_required_count: approvalRequiredCount,
            checked_in_count: checkedInCount,
            auto_entry: approvalRequiredCount === 0,
            sms_fallback: {
                sent: results.reduce((total, result) => total + Number(result.sms_fallback?.sent || 0), 0),
                attempted: results.reduce((total, result) => total + Number(result.sms_fallback?.attempted || 0), 0),
                enabled: results.some((result) => Boolean(result.sms_fallback?.enabled)),
            },
            is_watchlisted: visitorInfo.is_watchlisted,
            watchlist_reason: visitorInfo.watchlist_reason,
        });
    } catch (error) {
        console.error('createWalkInVisitor error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating visitor request' });
    }
};

exports.approveVisitor = async (req, res) => {
    try {
        const logId = Number(req.params.id || req.body.log_id);
        if (!logId) {
            return res.status(400).json({ success: false, message: 'Visitor log id is required' });
        }

        const [logs] = await db.query(
            `SELECT vl.id, vl.flat_id
             FROM visitor_logs vl
             WHERE vl.id = ? AND vl.status = 'Pending'`,
            [logId]
        );

        const log = logs[0];
        if (!log) {
            return res.status(404).json({ success: false, message: 'Pending visitor request not found' });
        }

        if (req.user.role === 'RESIDENT') {
            const allowed = await requireResidentApprovalAccess(req.user.id, log.flat_id);
            if (!allowed) {
                return res.status(403).json({ success: false, message: 'You need resident approval access for this flat' });
            }
        }

        const decision = await applyVisitorDecision({ logId, nextStatus: 'Approved', approvalType: 'Manual' });
        if (decision.error) {
            return res.status(decision.code || 400).json({ success: false, message: decision.error });
        }

        return res.status(200).json({
            success: true,
            status: decision.status,
            message: decision.status === 'CheckedIn'
                ? 'Visitor approved and checked in successfully'
                : 'Visitor approved successfully',
        });
    } catch (error) {
        console.error('approveVisitor error:', error);
        return res.status(500).json({ success: false, message: 'Server error approving visitor' });
    }
};

exports.denyVisitor = async (req, res) => {
    try {
        const logId = Number(req.params.id || req.body.log_id);
        if (!logId) {
            return res.status(400).json({ success: false, message: 'Visitor log id is required' });
        }

        const [logs] = await db.query(
            `SELECT vl.id, vl.flat_id
             FROM visitor_logs vl
             WHERE vl.id = ? AND vl.status = 'Pending'`,
            [logId]
        );

        const log = logs[0];
        if (!log) {
            return res.status(404).json({ success: false, message: 'Pending visitor request not found' });
        }

        if (req.user.role === 'RESIDENT') {
            const allowed = await requireResidentApprovalAccess(req.user.id, log.flat_id);
            if (!allowed) {
                return res.status(403).json({ success: false, message: 'You need resident approval access for this flat' });
            }
        }

        const decision = await applyVisitorDecision({ logId, nextStatus: 'Denied', approvalType: 'Manual' });
        if (decision.error) {
            return res.status(decision.code || 400).json({ success: false, message: decision.error });
        }

        return res.status(200).json({ success: true, message: 'Visitor denied successfully' });
    } catch (error) {
        console.error('denyVisitor error:', error);
        return res.status(500).json({ success: false, message: 'Server error denying visitor' });
    }
};

exports.checkInVisitor = async (req, res) => {
    try {
        const { log_id, passcode } = req.body;

        if (log_id || passcode) {
            let result;
            let updatedLogId = Number(log_id || 0);

            if (passcode) {
                [result] = await db.query(
                    `UPDATE visitor_logs
                     SET status = 'CheckedIn', entry_time = NOW()
                     WHERE passcode = ? AND status = 'Approved'`,
                    [String(passcode).trim().toUpperCase()]
                );

                const [rows] = await db.query('SELECT id FROM visitor_logs WHERE passcode = ?', [String(passcode).trim().toUpperCase()]);
                updatedLogId = rows[0]?.id || 0;
            } else {
                [result] = await db.query(
                    `UPDATE visitor_logs
                     SET status = 'CheckedIn', entry_time = NOW()
                     WHERE id = ? AND status = 'Approved'`,
                    [Number(log_id)]
                );
            }

            if (result.affectedRows === 0) {
                return res.status(404).json({ success: false, message: 'Approved visitor pass not found or already used' });
            }

            const [rows] = await db.query(
                `SELECT vl.id, vl.flat_id, v.society_id, v.name AS visitor_name, f.block_name, f.flat_number
                 FROM visitor_logs vl
                 JOIN visitors v ON v.id = vl.visitor_id
                 JOIN flats f ON f.id = vl.flat_id
                 WHERE vl.id = ?`,
                [updatedLogId || Number(log_id)]
            );

            const log = rows[0];
            if (log) {
                emitToRooms(
                    buildLiveRooms({
                        societyId: log.society_id,
                        flatId: log.flat_id,
                    }),
                    'visitor_status_updated',
                    { log_id: log.id, flat_id: log.flat_id, status: 'CheckedIn' }
                );

                await notifyPushSafely(async () => {
                    await sendPushToFlatResidents({
                        flatId: log.flat_id,
                        title: 'Visitor entered society',
                        body: `${log.visitor_name} checked in at ${log.block_name}-${log.flat_number}.`,
                        data: { type: 'visitor_status_updated', log_id: log.id, flat_id: log.flat_id, status: 'CheckedIn' },
                    });
                });
            }

            return res.status(200).json({ success: true, message: 'Visitor checked in successfully' });
        }

        return exports.createWalkInVisitor(req, res);
    } catch (error) {
        console.error('checkIn error:', error);
        return res.status(500).json({ success: false, message: 'Server error checking in visitor' });
    }
};

exports.checkOutVisitor = async (req, res) => {
    try {
        const logId = Number(req.body.log_id);
        if (!logId) {
            return res.status(400).json({ success: false, message: 'log_id is required' });
        }

        const exitPhotoUrl = normalizeOptionalString(req.body.exit_photo_url);
        const [result] = await db.query(
            `UPDATE visitor_logs
             SET status = 'CheckedOut', exit_time = NOW(), exit_photo_url = COALESCE(?, exit_photo_url)
             WHERE id = ? AND status = 'CheckedIn'`,
            [exitPhotoUrl, logId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Active visitor not found for check-out' });
        }

        const [rows] = await db.query(
            `SELECT vl.id, vl.flat_id, v.society_id, v.name AS visitor_name, f.block_name, f.flat_number
             FROM visitor_logs vl
             JOIN visitors v ON v.id = vl.visitor_id
             JOIN flats f ON f.id = vl.flat_id
             WHERE vl.id = ?`,
            [logId]
        );

        const log = rows[0];
        if (log) {
            emitToRooms(
                buildLiveRooms({
                    societyId: log.society_id,
                    flatId: log.flat_id,
                }),
                'visitor_status_updated',
                { log_id: log.id, flat_id: log.flat_id, status: 'CheckedOut' }
            );

            await notifyPushSafely(async () => {
                await sendPushToFlatResidents({
                    flatId: log.flat_id,
                    title: 'Visitor checked out',
                    body: `${log.visitor_name} checked out from ${log.block_name}-${log.flat_number}.`,
                    data: { type: 'visitor_status_updated', log_id: log.id, flat_id: log.flat_id, status: 'CheckedOut' },
                });
            });
        }

        return res.status(200).json({ success: true, message: 'Visitor checked out successfully' });
    } catch (error) {
        console.error('checkOut error:', error);
        return res.status(500).json({ success: false, message: 'Server error checking out visitor' });
    }
};

exports.publicDecision = async (req, res) => {
    try {
        const token = String(req.body.token || req.query.token || '').trim();
        const decision = String(req.body.decision || req.query.decision || '').trim().toLowerCase();

        if (!token || !['approve', 'deny'].includes(decision)) {
            return res.status(400).json({ success: false, message: 'A valid token and decision are required' });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token'
        );

        if (decoded.type !== 'VISITOR_APPROVAL') {
            return res.status(400).json({ success: false, message: 'Invalid approval token' });
        }

        const logId = Number(decoded.log_id);
        const nextStatus = decision === 'approve' ? 'Approved' : 'Denied';
        const result = await applyVisitorDecision({
            logId,
            nextStatus,
            approvalType: 'SmsLink',
        });

        if (result.error) {
            return res.status(result.code || 400).json({ success: false, message: result.error });
        }

        return res.status(200).json({
            success: true,
            status: result.status || nextStatus,
            message: (result.status || nextStatus) === 'CheckedIn' ? 'Visitor approved and checked in successfully' : nextStatus === 'Approved' ? 'Visitor approved successfully' : 'Visitor denied successfully',
        });
    } catch (error) {
        console.error('publicDecision error:', error);
        return res.status(400).json({ success: false, message: 'Approval link is invalid or expired' });
    }
};

exports.setVisitorStatus = async (req, res) => {
    try {
        const {
            visitor_id,
            is_vip = false,
            is_blacklisted = false,
            is_watchlisted = false,
            watchlist_reason = '',
        } = req.body;

        await db.query(
            `UPDATE visitors
             SET is_vip = ?, is_blacklisted = ?, is_watchlisted = ?, watchlist_reason = ?
             WHERE id = ? AND society_id = ?`,
            [is_vip, is_blacklisted, is_watchlisted, watchlist_reason || null, visitor_id, req.user.society_id]
        );

        return res.status(200).json({ success: true, message: 'Visitor status updated successfully' });
    } catch (error) {
        console.error('setVisitorStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating visitor status' });
    }
};
