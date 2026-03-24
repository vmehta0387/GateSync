const db = require('../config/db');
const { getIO } = require('../websocket/socket');

const BOOKING_STATUSES = ['Confirmed', 'Cancelled', 'Rejected', 'Completed'];
const PAYMENT_STATUSES = ['NotRequired', 'Pending', 'Paid', 'Failed'];

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
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toPositiveInteger = (value, fallback = 1) => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
};

const diffHours = (start, end) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
        return 0;
    }
    return (endDate.getTime() - startDate.getTime()) / 3600000;
};

const emitToRooms = (rooms, eventName, payload) => {
    try {
        const io = getIO();
        rooms.forEach((room) => io.to(room).emit(eventName, payload));
    } catch (error) {
        console.warn('Facility websocket emit skipped:', error.message);
    }
};

const buildFacilityRooms = ({ societyId, userId }) => [
    `society_${societyId}_facilities`,
    `society_${societyId}_admins`,
    userId ? `resident_${userId}` : null,
].filter(Boolean);

const mapFacilityRow = (row) => ({
    id: row.id,
    society_id: row.society_id,
    name: row.name,
    type: row.type || 'General',
    description: row.description || '',
    capacity: Number(row.capacity || 0),
    rules: row.rules || '',
    max_booking_hours: Number(row.max_booking_hours || 0),
    advance_booking_days: Number(row.advance_booking_days || 0),
    cancellation_hours: Number(row.cancellation_hours || 0),
    pricing: Number(row.pricing || 0),
    is_paid: Boolean(row.is_paid),
    is_active: Boolean(row.is_active),
    created_at: formatDateTime(row.created_at),
    upcoming_bookings: Number(row.upcoming_bookings || 0),
    confirmed_guests_today: Number(row.confirmed_guests_today || 0),
    maintenance_blocks: Number(row.maintenance_blocks || 0),
});

const mapBookingRow = (row) => ({
    id: row.id,
    society_id: row.society_id,
    facility_id: row.facility_id,
    facility_name: row.facility_name,
    facility_type: row.facility_type,
    user_id: row.user_id,
    user_name: row.user_name,
    user_phone: row.user_phone || '',
    guest_count: Number(row.guest_count || 0),
    total_amount: Number(row.total_amount || 0),
    payment_status: row.payment_status,
    notes: row.notes || '',
    start_time: formatDateTime(row.start_time),
    end_time: formatDateTime(row.end_time),
    status: row.status,
    cancelled_at: formatDateTime(row.cancelled_at),
    created_at: formatDateTime(row.created_at),
    flat_summary: row.flat_summary || '',
    is_cancellable: Boolean(row.is_cancellable),
});

const mapMaintenanceRow = (row) => ({
    id: row.id,
    facility_id: row.facility_id,
    facility_name: row.facility_name,
    start_time: formatDateTime(row.start_time),
    end_time: formatDateTime(row.end_time),
    reason: row.reason || '',
    created_by_name: row.created_by_name || '',
    created_at: formatDateTime(row.created_at),
});

const parseDateRange = (dateFrom, dateTo, fallbackDays = 14) => {
    const from = new Date(dateFrom || Date.now());
    const to = new Date(dateTo || (from.getTime() + fallbackDays * 24 * 3600000));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
        return null;
    }
    return { from, to };
};

const getFacilityById = async (societyId, facilityId) => {
    const [rows] = await db.query(
        `SELECT * FROM Facilities WHERE id = ? AND society_id = ?`,
        [facilityId, societyId]
    );
    return rows[0] || null;
};

const getOverlapGuestCount = async (facilityId, startTime, endTime, excludeBookingId = null) => {
    const [rows] = await db.query(
        `SELECT COALESCE(SUM(guest_count), 0) AS total_guests
         FROM Facility_Bookings
         WHERE facility_id = ?
           AND status = 'Confirmed'
           AND (? IS NULL OR id <> ?)
           AND start_time < ?
           AND end_time > ?`,
        [facilityId, excludeBookingId, excludeBookingId, endTime, startTime]
    );

    return Number(rows[0]?.total_guests || 0);
};

const hasMaintenanceConflict = async (facilityId, startTime, endTime, excludeBlockId = null) => {
    const [rows] = await db.query(
        `SELECT id
         FROM Facility_Maintenance_Blocks
         WHERE facility_id = ?
           AND (? IS NULL OR id <> ?)
           AND start_time < ?
           AND end_time > ?
         LIMIT 1`,
        [facilityId, excludeBlockId, excludeBlockId, endTime, startTime]
    );

    return rows.length > 0;
};

const fetchBookings = async ({ societyId, userId = null, status = null, facilityId = null }) => {
    const conditions = ['fb.society_id = ?'];
    const params = [societyId];

    if (userId) {
        conditions.push('fb.user_id = ?');
        params.push(userId);
    }

    if (status) {
        conditions.push('fb.status = ?');
        params.push(status);
    }

    if (facilityId) {
        conditions.push('fb.facility_id = ?');
        params.push(facilityId);
    }

    const [rows] = await db.query(
        `SELECT
            fb.*,
            f.name AS facility_name,
            f.type AS facility_type,
            f.cancellation_hours,
            u.name AS user_name,
            u.phone_number AS user_phone,
            (
                SELECT GROUP_CONCAT(DISTINCT CONCAT(fl.block_name, '-', fl.flat_number) ORDER BY fl.block_name, fl.flat_number SEPARATOR ', ')
                FROM User_Flats uf
                INNER JOIN Flats fl ON fl.id = uf.flat_id
                WHERE uf.user_id = u.id
            ) AS flat_summary,
            CASE
                WHEN fb.status = 'Confirmed'
                     AND TIMESTAMPDIFF(HOUR, NOW(), fb.start_time) >= COALESCE(f.cancellation_hours, 0)
                THEN 1
                ELSE 0
            END AS is_cancellable
         FROM Facility_Bookings fb
         INNER JOIN Facilities f ON f.id = fb.facility_id
         INNER JOIN Users u ON u.id = fb.user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY fb.start_time DESC`,
        params
    );

    return rows.map(mapBookingRow);
};

exports.getFacilities = async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT
                f.*,
                COUNT(DISTINCT CASE WHEN fb.status = 'Confirmed' AND fb.end_time >= NOW() THEN fb.id END) AS upcoming_bookings,
                COALESCE(SUM(CASE
                    WHEN fb.status = 'Confirmed'
                         AND DATE(fb.start_time) = CURDATE()
                    THEN fb.guest_count ELSE 0 END), 0) AS confirmed_guests_today,
                COUNT(DISTINCT CASE
                    WHEN mb.end_time >= NOW() THEN mb.id
                END) AS maintenance_blocks
             FROM Facilities f
             LEFT JOIN Facility_Bookings fb ON fb.facility_id = f.id
             LEFT JOIN Facility_Maintenance_Blocks mb ON mb.facility_id = f.id
             WHERE f.society_id = ?
             GROUP BY f.id
             ORDER BY f.is_active DESC, f.name ASC`,
            [req.user.society_id]
        );

        return res.status(200).json({ success: true, facilities: rows.map(mapFacilityRow) });
    } catch (error) {
        console.error('getFacilities error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching facilities' });
    }
};

exports.createFacility = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'Facility name is required' });
        }

        const capacity = toPositiveInteger(req.body.capacity, 1);
        const maxBookingHours = toPositiveInteger(req.body.max_booking_hours, 2);
        const advanceBookingDays = toPositiveInteger(req.body.advance_booking_days, 7);
        const cancellationHours = Math.max(0, Number(req.body.cancellation_hours || 0));
        const pricing = Math.max(0, Number(req.body.pricing || 0));

        const [result] = await db.query(
            `INSERT INTO Facilities (
                society_id, name, type, description, capacity, rules,
                max_booking_hours, advance_booking_days, cancellation_hours,
                pricing, is_paid, is_active
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                req.user.society_id,
                name,
                normalizeOptionalString(req.body.type) || 'General',
                normalizeOptionalString(req.body.description),
                capacity,
                normalizeOptionalString(req.body.rules),
                maxBookingHours,
                advanceBookingDays,
                cancellationHours,
                pricing,
                Boolean(req.body.is_paid),
                req.body.is_active !== false,
            ]
        );

        const facility = await getFacilityById(req.user.society_id, result.insertId);
        emitToRooms(
            buildFacilityRooms({ societyId: req.user.society_id }),
            'facility_created',
            { facility_id: result.insertId }
        );

        return res.status(201).json({
            success: true,
            message: 'Facility created successfully',
            facility: facility ? mapFacilityRow(facility) : null,
        });
    } catch (error) {
        console.error('createFacility error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating facility' });
    }
};

exports.updateFacility = async (req, res) => {
    try {
        const facilityId = Number(req.params.id);
        const facility = await getFacilityById(req.user.society_id, facilityId);
        if (!facility) {
            return res.status(404).json({ success: false, message: 'Facility not found' });
        }

        const name = String(req.body.name || facility.name || '').trim();
        if (!name) {
            return res.status(400).json({ success: false, message: 'Facility name is required' });
        }

        const capacity = toPositiveInteger(req.body.capacity, facility.capacity || 1);
        const maxBookingHours = toPositiveInteger(req.body.max_booking_hours, facility.max_booking_hours || 2);
        const advanceBookingDays = toPositiveInteger(req.body.advance_booking_days, facility.advance_booking_days || 7);
        const cancellationHours = Math.max(0, Number(req.body.cancellation_hours ?? facility.cancellation_hours ?? 0));
        const pricing = Math.max(0, Number(req.body.pricing ?? facility.pricing ?? 0));

        await db.query(
            `UPDATE Facilities
             SET name = ?, type = ?, description = ?, capacity = ?, rules = ?,
                 max_booking_hours = ?, advance_booking_days = ?, cancellation_hours = ?,
                 pricing = ?, is_paid = ?, is_active = ?
             WHERE id = ? AND society_id = ?`,
            [
                name,
                normalizeOptionalString(req.body.type) || facility.type || 'General',
                normalizeOptionalString(req.body.description),
                capacity,
                normalizeOptionalString(req.body.rules),
                maxBookingHours,
                advanceBookingDays,
                cancellationHours,
                pricing,
                req.body.is_paid === undefined ? Boolean(facility.is_paid) : Boolean(req.body.is_paid),
                req.body.is_active === undefined ? Boolean(facility.is_active) : Boolean(req.body.is_active),
                facilityId,
                req.user.society_id,
            ]
        );

        emitToRooms(
            buildFacilityRooms({ societyId: req.user.society_id }),
            'facility_updated',
            { facility_id: facilityId }
        );

        const updated = await getFacilityById(req.user.society_id, facilityId);
        return res.status(200).json({
            success: true,
            message: 'Facility updated successfully',
            facility: updated ? mapFacilityRow(updated) : null,
        });
    } catch (error) {
        console.error('updateFacility error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating facility' });
    }
};

exports.getAvailability = async (req, res) => {
    try {
        const facilityId = Number(req.query.facility_id);
        if (!facilityId) {
            return res.status(400).json({ success: false, message: 'facility_id is required' });
        }

        const facility = await getFacilityById(req.user.society_id, facilityId);
        if (!facility) {
            return res.status(404).json({ success: false, message: 'Facility not found' });
        }

        const range = parseDateRange(req.query.date_from, req.query.date_to, 7);
        if (!range) {
            return res.status(400).json({ success: false, message: 'Invalid date range' });
        }

        const [bookings] = await db.query(
            `SELECT
                fb.*,
                f.name AS facility_name,
                f.type AS facility_type,
                u.name AS user_name,
                u.phone_number AS user_phone,
                '' AS flat_summary,
                0 AS is_cancellable
             FROM Facility_Bookings fb
             INNER JOIN Facilities f ON f.id = fb.facility_id
             INNER JOIN Users u ON u.id = fb.user_id
             WHERE fb.facility_id = ?
               AND fb.status IN ('Confirmed', 'Completed')
               AND fb.start_time < ?
               AND fb.end_time > ?
             ORDER BY fb.start_time ASC`,
            [facilityId, range.to, range.from]
        );

        const [maintenanceBlocks] = await db.query(
            `SELECT
                mb.*,
                f.name AS facility_name,
                u.name AS created_by_name
             FROM Facility_Maintenance_Blocks mb
             INNER JOIN Facilities f ON f.id = mb.facility_id
             LEFT JOIN Users u ON u.id = mb.created_by
             WHERE mb.facility_id = ?
               AND mb.start_time < ?
               AND mb.end_time > ?
             ORDER BY mb.start_time ASC`,
            [facilityId, range.to, range.from]
        );

        return res.status(200).json({
            success: true,
            facility: mapFacilityRow(facility),
            bookings: bookings.map(mapBookingRow),
            maintenance_blocks: maintenanceBlocks.map(mapMaintenanceRow),
            date_from: range.from.toISOString(),
            date_to: range.to.toISOString(),
        });
    } catch (error) {
        console.error('getAvailability error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching availability' });
    }
};

exports.createBooking = async (req, res) => {
    try {
        const facilityId = Number(req.body.facility_id);
        const startTime = new Date(req.body.start_time);
        const endTime = new Date(req.body.end_time);
        const guestCount = toPositiveInteger(req.body.guest_count, 1);

        if (!facilityId || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || startTime >= endTime) {
            return res.status(400).json({ success: false, message: 'Valid facility and booking time range are required' });
        }

        const facility = await getFacilityById(req.user.society_id, facilityId);
        if (!facility || !facility.is_active) {
            return res.status(404).json({ success: false, message: 'Facility not available for booking' });
        }

        const bookingHours = diffHours(startTime, endTime);
        if (bookingHours <= 0 || bookingHours > Number(facility.max_booking_hours || 2)) {
            return res.status(400).json({
                success: false,
                message: `Bookings for ${facility.name} can be up to ${facility.max_booking_hours} hour(s) long`,
            });
        }

        const now = new Date();
        if (startTime <= now) {
            return res.status(400).json({ success: false, message: 'Bookings must start in the future' });
        }

        const advanceWindowEnd = new Date(now.getTime() + Number(facility.advance_booking_days || 7) * 24 * 3600000);
        if (startTime > advanceWindowEnd) {
            return res.status(400).json({
                success: false,
                message: `Bookings for ${facility.name} can be created up to ${facility.advance_booking_days} day(s) in advance`,
            });
        }

        if (guestCount > Number(facility.capacity || 1)) {
            return res.status(400).json({
                success: false,
                message: `${facility.name} allows up to ${facility.capacity} people per slot`,
            });
        }

        if (await hasMaintenanceConflict(facilityId, startTime, endTime)) {
            return res.status(409).json({
                success: false,
                message: `${facility.name} is blocked for maintenance during the selected slot`,
            });
        }

        const overlappingGuests = await getOverlapGuestCount(facilityId, startTime, endTime);
        if (overlappingGuests + guestCount > Number(facility.capacity || 1)) {
            return res.status(409).json({
                success: false,
                message: 'Selected slot is no longer available for the requested group size',
            });
        }

        const totalAmount = Number(facility.is_paid) ? Number((bookingHours * Number(facility.pricing || 0)).toFixed(2)) : 0;
        const paymentStatus = Number(facility.is_paid) ? 'Pending' : 'NotRequired';

        const [result] = await db.query(
            `INSERT INTO Facility_Bookings (
                society_id, facility_id, user_id, guest_count, total_amount,
                payment_status, notes, start_time, end_time, status
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Confirmed')`,
            [
                req.user.society_id,
                facilityId,
                req.user.id,
                guestCount,
                totalAmount,
                paymentStatus,
                normalizeOptionalString(req.body.notes),
                startTime,
                endTime,
            ]
        );

        const bookings = await fetchBookings({
            societyId: req.user.society_id,
            userId: req.user.role === 'RESIDENT' ? req.user.id : null,
            facilityId,
        });
        const booking = bookings.find((item) => item.id === result.insertId) || null;

        emitToRooms(
            buildFacilityRooms({ societyId: req.user.society_id, userId: req.user.id }),
            'facility_booking_updated',
            { booking_id: result.insertId, facility_id: facilityId }
        );

        return res.status(201).json({
            success: true,
            message: 'Facility booked successfully',
            booking,
        });
    } catch (error) {
        console.error('createBooking error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating booking' });
    }
};

exports.getBookings = async (req, res) => {
    try {
        const status = normalizeOptionalString(req.query.status);
        const facilityId = req.query.facility_id ? Number(req.query.facility_id) : null;
        const userId = req.user.role === 'RESIDENT' ? req.user.id : null;

        const bookings = await fetchBookings({
            societyId: req.user.society_id,
            userId,
            status,
            facilityId,
        });

        return res.status(200).json({ success: true, bookings });
    } catch (error) {
        console.error('getBookings error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching bookings' });
    }
};

exports.updateBookingStatus = async (req, res) => {
    try {
        const bookingId = Number(req.params.id);
        const status = String(req.body.status || '').trim();
        const paymentStatus = normalizeOptionalString(req.body.payment_status);

        if (!BOOKING_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid booking status' });
        }

        if (paymentStatus && !PAYMENT_STATUSES.includes(paymentStatus)) {
            return res.status(400).json({ success: false, message: 'Invalid payment status' });
        }

        const [rows] = await db.query(
            `SELECT fb.*, f.name AS facility_name, f.cancellation_hours
             FROM Facility_Bookings fb
             INNER JOIN Facilities f ON f.id = fb.facility_id
             WHERE fb.id = ? AND fb.society_id = ?`,
            [bookingId, req.user.society_id]
        );

        const booking = rows[0];
        if (!booking) {
            return res.status(404).json({ success: false, message: 'Booking not found' });
        }

        if (req.user.role === 'RESIDENT') {
            if (booking.user_id !== req.user.id) {
                return res.status(403).json({ success: false, message: 'You can only manage your own bookings' });
            }
            if (status !== 'Cancelled') {
                return res.status(403).json({ success: false, message: 'Residents can only cancel bookings' });
            }

            const hoursUntilStart = diffHours(new Date(), booking.start_time);
            if (hoursUntilStart < Number(booking.cancellation_hours || 0)) {
                return res.status(400).json({
                    success: false,
                    message: `Bookings for ${booking.facility_name} can only be cancelled at least ${booking.cancellation_hours} hour(s) before start time`,
                });
            }
        }

        await db.query(
            `UPDATE Facility_Bookings
             SET status = ?, payment_status = COALESCE(?, payment_status),
                 notes = COALESCE(?, notes),
                 cancelled_at = CASE WHEN ? = 'Cancelled' THEN NOW() ELSE cancelled_at END
             WHERE id = ? AND society_id = ?`,
            [
                status,
                paymentStatus,
                normalizeOptionalString(req.body.notes),
                status,
                bookingId,
                req.user.society_id,
            ]
        );

        emitToRooms(
            buildFacilityRooms({ societyId: req.user.society_id, userId: booking.user_id }),
            'facility_booking_updated',
            { booking_id: bookingId, facility_id: booking.facility_id }
        );

        return res.status(200).json({ success: true, message: 'Booking updated successfully' });
    } catch (error) {
        console.error('updateBookingStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating booking' });
    }
};

exports.getMaintenanceBlocks = async (req, res) => {
    try {
        const facilityId = req.query.facility_id ? Number(req.query.facility_id) : null;
        const conditions = ['f.society_id = ?'];
        const params = [req.user.society_id];

        if (facilityId) {
            conditions.push('mb.facility_id = ?');
            params.push(facilityId);
        }

        const [rows] = await db.query(
            `SELECT
                mb.*,
                f.name AS facility_name,
                u.name AS created_by_name
             FROM Facility_Maintenance_Blocks mb
             INNER JOIN Facilities f ON f.id = mb.facility_id
             LEFT JOIN Users u ON u.id = mb.created_by
             WHERE ${conditions.join(' AND ')}
             ORDER BY mb.start_time ASC`,
            params
        );

        return res.status(200).json({ success: true, maintenance_blocks: rows.map(mapMaintenanceRow) });
    } catch (error) {
        console.error('getMaintenanceBlocks error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching maintenance schedule' });
    }
};

exports.createMaintenanceBlock = async (req, res) => {
    try {
        const facilityId = Number(req.body.facility_id);
        const startTime = new Date(req.body.start_time);
        const endTime = new Date(req.body.end_time);

        if (!facilityId || Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime()) || startTime >= endTime) {
            return res.status(400).json({ success: false, message: 'Valid facility and maintenance time range are required' });
        }

        const facility = await getFacilityById(req.user.society_id, facilityId);
        if (!facility) {
            return res.status(404).json({ success: false, message: 'Facility not found' });
        }

        if (await hasMaintenanceConflict(facilityId, startTime, endTime)) {
            return res.status(409).json({ success: false, message: 'A maintenance block already exists in the selected window' });
        }

        const [result] = await db.query(
            `INSERT INTO Facility_Maintenance_Blocks (facility_id, start_time, end_time, reason, created_by)
             VALUES (?, ?, ?, ?, ?)`,
            [
                facilityId,
                startTime,
                endTime,
                normalizeOptionalString(req.body.reason),
                req.user.id,
            ]
        );

        emitToRooms(
            buildFacilityRooms({ societyId: req.user.society_id }),
            'facility_maintenance_updated',
            { maintenance_block_id: result.insertId, facility_id: facilityId }
        );

        return res.status(201).json({ success: true, message: 'Maintenance block added successfully' });
    } catch (error) {
        console.error('createMaintenanceBlock error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating maintenance block' });
    }
};

exports.deleteMaintenanceBlock = async (req, res) => {
    try {
        const blockId = Number(req.params.id);
        const [rows] = await db.query(
            `SELECT mb.id, mb.facility_id, f.society_id
             FROM Facility_Maintenance_Blocks mb
             INNER JOIN Facilities f ON f.id = mb.facility_id
             WHERE mb.id = ? AND f.society_id = ?`,
            [blockId, req.user.society_id]
        );

        const block = rows[0];
        if (!block) {
            return res.status(404).json({ success: false, message: 'Maintenance block not found' });
        }

        await db.query(`DELETE FROM Facility_Maintenance_Blocks WHERE id = ?`, [blockId]);

        emitToRooms(
            buildFacilityRooms({ societyId: req.user.society_id }),
            'facility_maintenance_updated',
            { maintenance_block_id: blockId, facility_id: block.facility_id }
        );

        return res.status(200).json({ success: true, message: 'Maintenance block removed successfully' });
    } catch (error) {
        console.error('deleteMaintenanceBlock error:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting maintenance block' });
    }
};

exports.getFacilitySummary = async (req, res) => {
    try {
        const societyId = req.user.society_id;

        const [[counts]] = await db.query(
            `SELECT
                COUNT(*) AS total_facilities,
                COUNT(CASE WHEN is_active = 1 THEN 1 END) AS active_facilities
             FROM Facilities
             WHERE society_id = ?`,
            [societyId]
        );

        const [[bookingMetrics]] = await db.query(
            `SELECT
                COUNT(CASE WHEN status = 'Confirmed' AND start_time >= NOW() THEN 1 END) AS upcoming_bookings,
                COUNT(CASE WHEN status = 'Confirmed' AND end_time > NOW() AND start_time <= NOW() THEN 1 END) AS active_now,
                COALESCE(SUM(CASE WHEN payment_status = 'Paid' THEN total_amount ELSE 0 END), 0) AS revenue_generated
             FROM Facility_Bookings
             WHERE society_id = ?`,
            [societyId]
        );

        const [topFacilities] = await db.query(
            `SELECT
                f.id,
                f.name,
                COUNT(fb.id) AS total_bookings,
                COALESCE(SUM(fb.total_amount), 0) AS revenue
             FROM Facilities f
             LEFT JOIN Facility_Bookings fb
                ON fb.facility_id = f.id
               AND fb.status IN ('Confirmed', 'Completed')
             WHERE f.society_id = ?
             GROUP BY f.id
             ORDER BY total_bookings DESC, revenue DESC
             LIMIT 5`,
            [societyId]
        );

        const [peakHours] = await db.query(
            `SELECT
                LPAD(HOUR(start_time), 2, '0') AS hour_label,
                COUNT(*) AS total
             FROM Facility_Bookings
             WHERE society_id = ?
               AND status IN ('Confirmed', 'Completed')
             GROUP BY HOUR(start_time)
             ORDER BY total DESC, hour_label ASC
             LIMIT 5`,
            [societyId]
        );

        const [[maintenance]] = await db.query(
            `SELECT COUNT(*) AS scheduled_maintenance
             FROM Facility_Maintenance_Blocks mb
             INNER JOIN Facilities f ON f.id = mb.facility_id
             WHERE f.society_id = ?
               AND mb.end_time >= NOW()`,
            [societyId]
        );

        return res.status(200).json({
            success: true,
            summary: {
                total_facilities: Number(counts.total_facilities || 0),
                active_facilities: Number(counts.active_facilities || 0),
                upcoming_bookings: Number(bookingMetrics.upcoming_bookings || 0),
                active_now: Number(bookingMetrics.active_now || 0),
                scheduled_maintenance: Number(maintenance.scheduled_maintenance || 0),
                revenue_generated: Number(bookingMetrics.revenue_generated || 0),
                top_facilities: topFacilities.map((row) => ({
                    id: row.id,
                    name: row.name,
                    total_bookings: Number(row.total_bookings || 0),
                    revenue: Number(row.revenue || 0),
                })),
                peak_hours: peakHours.map((row) => ({
                    hour_label: `${row.hour_label}:00`,
                    total: Number(row.total || 0),
                })),
            },
        });
    } catch (error) {
        console.error('getFacilitySummary error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching facilities summary' });
    }
};
