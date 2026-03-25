const db = require('../config/db');

const formatDateTime = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const toNumber = (value) => Number(value || 0);

exports.getDashboardSummary = async (req, res) => {
    try {
        const societyId = req.user.society_id;

        if (!societyId) {
            return res.status(400).json({
                success: false,
                message: 'Dashboard summary is only available for society-scoped users',
            });
        }

        const [
            [overviewRows],
            [duesRows],
            [gateRows],
            [complaintRows],
            [securityRows],
            [staffRows],
            [facilityRows],
            [communicationRows],
            [recentVisitors],
            [urgentComplaints],
            [activeIncidents],
            [upcomingBookings],
        ] = await Promise.all([
            db.query(
                `SELECT
                    COUNT(DISTINCT CASE WHEN u.role = 'RESIDENT' THEN u.id END) AS residents_total,
                    COUNT(DISTINCT CASE WHEN u.role = 'RESIDENT' THEN uf.flat_id END) AS occupied_flats,
                    COUNT(DISTINCT CASE WHEN u.role = 'RESIDENT' AND COALESCE(u.kyc_status, 'Pending') = 'Pending' THEN u.id END) AS pending_kyc
                 FROM users u
                 LEFT JOIN user_flats uf ON uf.user_id = u.id
                 WHERE u.society_id = ?`,
                [societyId]
            ),
            db.query(
                `SELECT
                    COUNT(*) AS unpaid_invoices,
                    COALESCE(SUM(COALESCE(balance_amount, amount)), 0) AS pending_dues_amount
                 FROM invoices
                 WHERE society_id = ? AND status IN ('Unpaid', 'Overdue', 'PartiallyPaid')`,
                [societyId]
            ),
            db.query(
                `SELECT
                    COUNT(CASE WHEN DATE(COALESCE(vl.entry_time, vl.approval_requested_at, vl.expected_time)) = CURDATE() THEN 1 END) AS visitors_today,
                    COUNT(CASE WHEN vl.status = 'CheckedIn' THEN 1 END) AS inside_now,
                    COUNT(CASE WHEN vl.status = 'Pending' THEN 1 END) AS pending_approvals,
                    COUNT(CASE WHEN vl.purpose = 'Delivery' AND DATE(COALESCE(vl.entry_time, vl.approval_requested_at, vl.expected_time)) = CURDATE() THEN 1 END) AS deliveries_today,
                    COUNT(CASE WHEN v.is_watchlisted = 1 AND DATE(COALESCE(vl.entry_time, vl.approval_requested_at, vl.expected_time)) = CURDATE() THEN 1 END) AS watchlist_alerts_today
                 FROM visitor_logs vl
                 INNER JOIN visitors v ON v.id = vl.visitor_id
                 WHERE v.society_id = ?`,
                [societyId]
            ),
            db.query(
                `SELECT
                    COUNT(CASE WHEN status NOT IN ('Resolved', 'Closed') THEN 1 END) AS open_tickets,
                    COUNT(CASE WHEN status NOT IN ('Resolved', 'Closed') AND sla_deadline IS NOT NULL AND sla_deadline < NOW() THEN 1 END) AS overdue_tickets,
                    COUNT(CASE WHEN status NOT IN ('Resolved', 'Closed') AND priority = 'High' THEN 1 END) AS high_priority_open,
                    COUNT(CASE WHEN (resolved_at IS NOT NULL AND resolved_at >= DATE_SUB(NOW(), INTERVAL 7 DAY))
                                    OR (closed_at IS NOT NULL AND closed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) THEN 1 END) AS resolved_this_week
                 FROM complaints
                 WHERE society_id = ?`,
                [societyId]
            ),
            db.query(
                `SELECT
                    (
                        SELECT COUNT(*)
                        FROM guard_shifts
                        WHERE society_id = ? AND status = 'OnDuty'
                    ) AS guards_on_duty,
                    (
                        SELECT COUNT(*)
                        FROM security_incidents
                        WHERE society_id = ? AND status IN ('Open', 'InReview')
                    ) AS open_incidents,
                    (
                        SELECT COUNT(*)
                        FROM security_incidents
                        WHERE society_id = ? AND status IN ('Open', 'InReview') AND severity = 'Critical'
                    ) AS critical_incidents,
                    (
                        SELECT COUNT(*)
                        FROM guard_activity ga
                        INNER JOIN users u ON u.id = ga.guard_id
                        WHERE u.society_id = ? AND ga.action_type = 'Patrol' AND DATE(ga.timestamp) = CURDATE()
                    ) AS patrols_today`,
                [societyId, societyId, societyId, societyId]
            ),
            db.query(
                `SELECT
                    COUNT(DISTINCT s.id) AS total_staff,
                    COUNT(DISTINCT CASE WHEN active_logs.id IS NOT NULL THEN s.id END) AS inside_now,
                    COUNT(DISTINCT CASE WHEN s.is_blacklisted = 1 THEN s.id END) AS blacklisted,
                    COUNT(DISTINCT CASE WHEN s.linked_user_id IS NOT NULL THEN s.id END) AS guard_enabled
                 FROM staff s
                 LEFT JOIN staff_logs active_logs
                    ON active_logs.staff_id = s.id
                   AND active_logs.exit_time IS NULL
                 WHERE s.society_id = ?`,
                [societyId]
            ),
            db.query(
                `SELECT
                    COUNT(DISTINCT CASE WHEN f.is_active = 1 THEN f.id END) AS active_facilities,
                    COUNT(DISTINCT CASE WHEN fb.status = 'Confirmed' AND fb.start_time >= NOW() THEN fb.id END) AS upcoming_bookings,
                    COUNT(DISTINCT CASE WHEN fb.status = 'Confirmed' AND fb.start_time <= NOW() AND fb.end_time > NOW() THEN fb.id END) AS active_now,
                    COUNT(DISTINCT CASE WHEN mb.end_time >= NOW() THEN mb.id END) AS scheduled_maintenance
                 FROM facilities f
                 LEFT JOIN facility_bookings fb ON fb.facility_id = f.id
                 LEFT JOIN facility_maintenance_blocks mb ON mb.facility_id = f.id
                 WHERE f.society_id = ?`,
                [societyId]
            ),
            db.query(
                `SELECT
                    COUNT(CASE WHEN (notice_type IN ('Urgent', 'Emergency') OR is_pinned = 1) AND status IN ('Published', 'Scheduled') THEN 1 END) AS urgent_notices,
                    COUNT(CASE WHEN status IN ('Draft', 'Live') THEN 1 END) AS active_polls,
                    (
                        SELECT COUNT(*)
                        FROM messages
                        WHERE society_id = ? AND receiver_id = ? AND is_read = FALSE
                    ) AS unread_messages,
                    (
                        SELECT COUNT(*)
                        FROM community_events
                        WHERE society_id = ? AND status IN ('Draft', 'Scheduled', 'Live')
                    ) AS scheduled_events
                 FROM notices
                 WHERE society_id = ?`,
                [societyId, req.user.id, societyId, societyId]
            ),
            db.query(
                `SELECT
                    vl.id,
                    v.name AS visitor_name,
                    f.block_name,
                    f.flat_number,
                    vl.purpose,
                    vl.status,
                    vl.passcode,
                    vl.vehicle_number,
                    v.is_watchlisted,
                    v.watchlist_reason,
                    COALESCE(vl.entry_time, vl.approval_requested_at, vl.expected_time) AS timeline_at
                 FROM visitor_logs vl
                 INNER JOIN visitors v ON v.id = vl.visitor_id
                 INNER JOIN flats f ON f.id = vl.flat_id
                 WHERE v.society_id = ?
                 ORDER BY COALESCE(vl.entry_time, vl.approval_requested_at, vl.expected_time, vl.id) DESC, vl.id DESC
                 LIMIT 6`,
                [societyId]
            ),
            db.query(
                `SELECT
                    c.id,
                    c.ticket_id,
                    c.priority,
                    c.status,
                    c.created_at,
                    cc.name AS category_name,
                    u.name AS resident_name,
                    f.block_name,
                    f.flat_number,
                    CASE
                        WHEN c.sla_deadline IS NOT NULL AND c.status NOT IN ('Resolved', 'Closed') AND c.sla_deadline < NOW() THEN TRUE
                        ELSE FALSE
                    END AS is_overdue
                 FROM complaints c
                 LEFT JOIN complaint_categories cc ON cc.id = c.category_id
                 LEFT JOIN users u ON u.id = c.created_by_user_id
                 LEFT JOIN flats f ON f.id = c.flat_id
                 WHERE c.society_id = ? AND c.status NOT IN ('Resolved', 'Closed')
                 ORDER BY
                    CASE
                        WHEN c.sla_deadline IS NOT NULL AND c.sla_deadline < NOW() THEN 0
                        WHEN c.priority = 'High' THEN 1
                        ELSE 2
                    END,
                    c.created_at DESC
                 LIMIT 6`,
                [societyId]
            ),
            db.query(
                `SELECT
                    id,
                    title,
                    category,
                    severity,
                    status,
                    location,
                    occurred_at
                 FROM security_incidents
                 WHERE society_id = ? AND status IN ('Open', 'InReview')
                 ORDER BY
                    CASE severity
                        WHEN 'Critical' THEN 0
                        WHEN 'High' THEN 1
                        WHEN 'Medium' THEN 2
                        ELSE 3
                    END,
                    occurred_at DESC
                 LIMIT 5`,
                [societyId]
            ),
            db.query(
                `SELECT
                    fb.id,
                    f.name AS facility_name,
                    u.name AS resident_name,
                    fb.start_time,
                    fb.end_time,
                    fb.status,
                    fb.payment_status
                 FROM facility_bookings fb
                 INNER JOIN facilities f ON f.id = fb.facility_id
                 INNER JOIN users u ON u.id = fb.user_id
                 WHERE fb.society_id = ? AND fb.status = 'Confirmed' AND fb.start_time >= NOW()
                 ORDER BY fb.start_time ASC
                 LIMIT 5`,
                [societyId]
            ),
        ]);

        return res.status(200).json({
            success: true,
            summary: {
                overview: {
                    residents_total: toNumber(overviewRows[0]?.residents_total),
                    occupied_flats: toNumber(overviewRows[0]?.occupied_flats),
                    pending_kyc: toNumber(overviewRows[0]?.pending_kyc),
                    unpaid_invoices: toNumber(duesRows[0]?.unpaid_invoices),
                    pending_dues_amount: toNumber(duesRows[0]?.pending_dues_amount),
                },
                gate: {
                    visitors_today: toNumber(gateRows[0]?.visitors_today),
                    inside_now: toNumber(gateRows[0]?.inside_now),
                    pending_approvals: toNumber(gateRows[0]?.pending_approvals),
                    deliveries_today: toNumber(gateRows[0]?.deliveries_today),
                    watchlist_alerts_today: toNumber(gateRows[0]?.watchlist_alerts_today),
                },
                complaints: {
                    open_tickets: toNumber(complaintRows[0]?.open_tickets),
                    overdue_tickets: toNumber(complaintRows[0]?.overdue_tickets),
                    high_priority_open: toNumber(complaintRows[0]?.high_priority_open),
                    resolved_this_week: toNumber(complaintRows[0]?.resolved_this_week),
                },
                security: {
                    guards_on_duty: toNumber(securityRows[0]?.guards_on_duty),
                    open_incidents: toNumber(securityRows[0]?.open_incidents),
                    critical_incidents: toNumber(securityRows[0]?.critical_incidents),
                    patrols_today: toNumber(securityRows[0]?.patrols_today),
                },
                staff: {
                    total_staff: toNumber(staffRows[0]?.total_staff),
                    inside_now: toNumber(staffRows[0]?.inside_now),
                    blacklisted: toNumber(staffRows[0]?.blacklisted),
                    guard_enabled: toNumber(staffRows[0]?.guard_enabled),
                },
                facilities: {
                    active_facilities: toNumber(facilityRows[0]?.active_facilities),
                    upcoming_bookings: toNumber(facilityRows[0]?.upcoming_bookings),
                    active_now: toNumber(facilityRows[0]?.active_now),
                    scheduled_maintenance: toNumber(facilityRows[0]?.scheduled_maintenance),
                },
                communication: {
                    urgent_notices: toNumber(communicationRows[0]?.urgent_notices),
                    unread_messages: toNumber(communicationRows[0]?.unread_messages),
                    active_polls: toNumber(communicationRows[0]?.active_polls),
                    scheduled_events: toNumber(communicationRows[0]?.scheduled_events),
                },
                recent_visitors: recentVisitors.map((row) => ({
                    id: row.id,
                    visitor_name: row.visitor_name,
                    block_name: row.block_name,
                    flat_number: row.flat_number,
                    purpose: row.purpose,
                    status: row.status,
                    passcode: row.passcode,
                    vehicle_number: row.vehicle_number || '',
                    is_watchlisted: Boolean(row.is_watchlisted),
                    watchlist_reason: row.watchlist_reason || '',
                    timeline_at: formatDateTime(row.timeline_at),
                })),
                urgent_complaints: urgentComplaints.map((row) => ({
                    id: row.id,
                    ticket_id: row.ticket_id,
                    category_name: row.category_name || 'Others',
                    resident_name: row.resident_name || 'Resident',
                    block_name: row.block_name || '',
                    flat_number: row.flat_number || '',
                    priority: row.priority,
                    status: row.status,
                    is_overdue: Boolean(row.is_overdue),
                    created_at: formatDateTime(row.created_at),
                })),
                active_incidents: activeIncidents.map((row) => ({
                    id: row.id,
                    title: row.title,
                    category: row.category,
                    severity: row.severity,
                    status: row.status,
                    location: row.location || '',
                    occurred_at: formatDateTime(row.occurred_at),
                })),
                upcoming_bookings: upcomingBookings.map((row) => ({
                    id: row.id,
                    facility_name: row.facility_name,
                    resident_name: row.resident_name,
                    start_time: formatDateTime(row.start_time),
                    end_time: formatDateTime(row.end_time),
                    status: row.status,
                    payment_status: row.payment_status,
                })),
            },
        });
    } catch (error) {
        console.error('getDashboardSummary error:', error);
        return res.status(500).json({ success: false, message: 'Server error generating dashboard summary' });
    }
};
