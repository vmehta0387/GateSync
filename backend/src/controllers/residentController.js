const db = require('../config/db');

const RESIDENT_ACCESS_ROLES = ['Primary', 'Secondary'];

const normalizeResidentDate = (rawValue) => {
    if (!rawValue) return null;

    const stringValue = String(rawValue).trim();
    if (!stringValue) return null;

    const isoMatch = stringValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const year = Number(isoMatch[1]);
        return year >= 1900 ? stringValue : null;
    }

    const parsedDate = new Date(stringValue);
    if (Number.isNaN(parsedDate.getTime())) {
        return null;
    }

    const year = parsedDate.getUTCFullYear();
    if (year < 1900) {
        return null;
    }

    return parsedDate.toISOString().split('T')[0];
};

const normalizeAccessRole = (rawValue) => (
    RESIDENT_ACCESS_ROLES.includes(String(rawValue || '').trim())
        ? String(rawValue).trim()
        : 'Primary'
);

const ensureFlatAccessRoleAvailable = async ({ flatId, accessRole, userId = null }) => {
    const [rows] = await db.query(
        `SELECT uf.user_id
         FROM user_flats uf
         INNER JOIN users u ON u.id = uf.user_id
         WHERE uf.flat_id = ?
           AND uf.access_role = ?
           AND u.role = 'RESIDENT'
           AND (? IS NULL OR uf.user_id <> ?)
         LIMIT 1`,
        [flatId, accessRole, userId, userId]
    );

    return rows.length === 0;
};

exports.getResidentById = async (req, res) => {
    try {
        const { id } = req.params;
        const [users] = await db.query(
            'SELECT * FROM users WHERE id = ? AND society_id = ?',
            [id, req.user.society_id]
        );
        if (users.length === 0) {
            return res.status(404).json({ success: false, message: 'Resident not found' });
        }

        const user = users[0];
        const [flats] = await db.query(
            'SELECT uf.*, f.block_name, f.flat_number, f.flat_type FROM user_flats uf JOIN flats f ON uf.flat_id = f.id WHERE uf.user_id = ?',
            [id]
        );
        const flatData = flats[0] || {};

        const [vehicles] = await db.query(
            'SELECT vehicle_type, vehicle_number, parking_slot FROM vehicles WHERE user_id = ?',
            [id]
        );

        const [familyRows] = await db.query(
            'SELECT name, age, relation, phone FROM family_members WHERE user_id = ?',
            [id]
        );
        const family = familyRows.map((member) => ({
            ...member,
            phone_number: member.phone || ''
        }));

        const access = {
            can_approve_visitors: !!user.can_approve_visitors,
            can_view_bills: !!user.can_view_bills,
            can_raise_complaints: !!user.can_raise_complaints
        };

        return res.status(200).json({
            success: true,
            resident: {
                basic: {
                    name: user.name || '',
                    email: user.email || '',
                    phone_number: user.phone_number || ''
                },
                flat: {
                    block_name: flatData.block_name || '',
                    flat_number: flatData.flat_number || '',
                    flat_type: flatData.flat_type || '',
                    floor: '',
                    occupancy_type: flatData.type || 'Owner',
                    access_role: flatData.access_role || 'Primary',
                    move_in_date: flatData.move_in_date ? new Date(flatData.move_in_date).toISOString().split('T')[0] : '',
                    move_out_date: flatData.move_out_date ? new Date(flatData.move_out_date).toISOString().split('T')[0] : '',
                    flat_id: flatData.flat_id || ''
                },
                identity: {
                    id_type: user.id_type || 'Aadhaar',
                    id_number: user.id_number || '',
                    id_proof_url: user.id_proof_url || ''
                },
                emergency: {
                    emergency_name: user.emergency_name || '',
                    emergency_relation: user.emergency_relation || '',
                    emergency_phone: user.emergency_phone || ''
                },
                notifications: {
                    push_notifications: !!user.push_notifications,
                    sms_alerts: !!user.sms_alerts,
                    whatsapp_alerts: !!user.whatsapp_alerts
                },
                access,
                permissions: access,
                vehicles,
                family
            }
        });
    } catch (error) {
        console.error('getResidentById Error:', error);
        return res.status(500).json({ success: false, message: 'Server error' });
    }
};

exports.getResidents = async (req, res) => {
    try {
        const [residents] = await db.query(`
            SELECT u.id, u.name, u.email, u.phone_number, UPPER(u.status) AS status, u.kyc_status,
                   uf.flat_id, COALESCE(uf.type, 'Unassigned') as occupancy_type,
                   COALESCE(uf.access_role, 'Primary') as access_role, f.block_name, f.flat_number
            FROM users u
            LEFT JOIN user_flats uf ON u.id = uf.user_id
            LEFT JOIN flats f ON uf.flat_id = f.id
            WHERE u.society_id = ? AND u.role = 'RESIDENT'
            ORDER BY u.name ASC
        `, [req.user.society_id]);
        return res.status(200).json({ success: true, residents });
    } catch (error) {
        console.error('getResidents error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving residents' });
    }
};

exports.getMyFlats = async (req, res) => {
    try {
        const [flats] = await db.query(`
            SELECT uf.flat_id, uf.type, uf.access_role, f.block_name, f.flat_number
            FROM user_flats uf
            JOIN flats f ON uf.flat_id = f.id
            WHERE uf.user_id = ?
            ORDER BY f.block_name, f.flat_number
        `, [req.user.id]);

        return res.status(200).json({ success: true, flats });
    } catch (error) {
        console.error('getMyFlats error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving resident flats' });
    }
};

exports.getImportantContacts = async (req, res) => {
    try {
        const [admins] = await db.query(
            `SELECT id, name, phone_number, role
             FROM users
             WHERE society_id = ? AND role = 'ADMIN' AND status = 'ACTIVE'
             ORDER BY created_at ASC, id ASC`,
            [req.user.society_id]
        );

        const [managers] = await db.query(
            `SELECT id, name, phone_number, role
             FROM users
             WHERE society_id = ? AND role = 'MANAGER' AND status = 'ACTIVE'
             ORDER BY created_at ASC, id ASC`,
            [req.user.society_id]
        );

        const [serviceStaff] = await db.query(
            `SELECT
                s.id,
                s.name,
                s.phone,
                s.type,
                s.assignment_scope,
                s.shift_timing,
                s.work_start_time,
                s.work_end_time
             FROM staff s
             WHERE s.society_id = ?
               AND s.is_blacklisted = 0
               AND s.type IN ('Security', 'Cleaner', 'Plumber', 'Electrician')
             ORDER BY
                FIELD(s.type, 'Security', 'Cleaner', 'Plumber', 'Electrician'),
                s.name ASC`,
            [req.user.society_id]
        );

        return res.status(200).json({
            success: true,
            contacts: {
                admins: admins.map((admin) => ({
                    id: admin.id,
                    name: admin.name,
                    phone_number: admin.phone_number || '',
                    role: admin.role,
                    label: 'Society admin',
                })),
                managers: managers.map((manager) => ({
                    id: manager.id,
                    name: manager.name,
                    phone_number: manager.phone_number || '',
                    role: manager.role,
                    label: 'Society manager',
                })),
                service_staff: serviceStaff.map((staff) => ({
                    id: staff.id,
                    name: staff.name,
                    phone_number: staff.phone || '',
                    type: staff.type,
                    assignment_scope: staff.assignment_scope,
                    shift_timing: staff.shift_timing || '',
                    work_start_time: staff.work_start_time || '',
                    work_end_time: staff.work_end_time || '',
                })),
            },
        });
    } catch (error) {
        console.error('getImportantContacts error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving important contacts' });
    }
};

exports.addResident = async (req, res) => {
    try {
        const payload = req.body;
        const permissionSource = payload.permissions || payload.access || {};

        const name = payload.basic?.name || payload.name;
        const email = payload.basic?.email || payload.email;
        const phone_number = payload.basic?.phone_number || payload.phone_number;
        let flat_id = payload.flat?.flat_id || payload.flat_id;
        const block_name = payload.flat?.block_name || payload.block_name;
        const flat_number = payload.flat?.flat_number || payload.flat_number;
        const flat_type = payload.flat?.flat_type || payload.flat_type || null;
        const occupancy_type = payload.flat?.occupancy_type || payload.occupancy_type || 'Owner';
        const access_role = normalizeAccessRole(payload.flat?.access_role || payload.access_role);
        const move_in_date = normalizeResidentDate(payload.flat?.move_in_date);
        const move_out_date = normalizeResidentDate(payload.flat?.move_out_date);

        const id_type = payload.identity?.id_type || null;
        const id_number = payload.identity?.id_number || null;
        const id_proof_url = payload.identity?.id_proof_url || null;

        const e_name = payload.emergency?.emergency_name || null;
        const e_relation = payload.emergency?.emergency_relation || null;
        const e_phone = payload.emergency?.emergency_phone || null;

        const push = payload.notifications?.push_notifications ?? true;
        const sms = payload.notifications?.sms_alerts ?? true;
        const whatsapp = payload.notifications?.whatsapp_alerts ?? false;

        const c_visitors = permissionSource.can_approve_visitors ?? true;
        const c_bills = permissionSource.can_view_bills ?? true;
        const c_complaints = permissionSource.can_raise_complaints ?? true;

        const [users] = await db.query('SELECT id FROM users WHERE phone_number = ?', [phone_number]);
        let userId;

        if (users.length > 0) {
            userId = users[0].id;
        } else {
            const [userResult] = await db.query(`
                INSERT INTO users (
                    society_id, name, email, phone_number, role, kyc_status,
                    id_type, id_number, id_proof_url,
                    emergency_name, emergency_relation, emergency_phone,
                    push_notifications, sms_alerts, whatsapp_alerts,
                    can_approve_visitors, can_view_bills, can_raise_complaints
                ) VALUES (?, ?, ?, ?, 'RESIDENT', 'Pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                req.user.society_id, name, email, phone_number,
                id_type, id_number, id_proof_url,
                e_name, e_relation, e_phone,
                push, sms, whatsapp,
                c_visitors, c_bills, c_complaints
            ]);
            userId = userResult.insertId;
        }

        if (!flat_id && block_name && flat_number) {
            const [flats] = await db.query(
                'SELECT id FROM flats WHERE society_id = ? AND block_name = ? AND flat_number = ?',
                [req.user.society_id, block_name, flat_number]
            );
            if (flats.length > 0) {
                flat_id = flats[0].id;
                if (flat_type) {
                    await db.query(
                        'UPDATE flats SET flat_type = ? WHERE id = ? AND society_id = ?',
                        [flat_type, flat_id, req.user.society_id]
                    );
                }
            } else {
                const [flatResult] = await db.query(
                    'INSERT INTO flats (society_id, block_name, flat_number, flat_type) VALUES (?, ?, ?, ?)',
                    [req.user.society_id, block_name, flat_number, flat_type]
                );
                flat_id = flatResult.insertId;
            }
        }

        if (!flat_id) {
            return res.status(400).json({ success: false, message: 'Flat information (Tower/Flat Number) is required' });
        }

        const accessRoleAvailable = await ensureFlatAccessRoleAvailable({
            flatId: flat_id,
            accessRole: access_role,
            userId,
        });

        if (!accessRoleAvailable) {
            return res.status(409).json({
                success: false,
                message: `${access_role} resident access is already assigned for this flat`,
            });
        }

        await db.query('DELETE FROM user_flats WHERE user_id = ?', [userId]);
        await db.query(`
            INSERT INTO user_flats (user_id, flat_id, type, access_role, move_in_date, move_out_date)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [userId, flat_id, occupancy_type, access_role, move_in_date, move_out_date]);

        if (payload.vehicles && Array.isArray(payload.vehicles)) {
            for (const vehicle of payload.vehicles) {
                if (!vehicle.vehicle_number) continue;
                await db.query(`
                    INSERT INTO vehicles (user_id, flat_id, vehicle_type, vehicle_number, parking_slot)
                    VALUES (?, ?, ?, ?, ?)
                `, [userId, flat_id, vehicle.vehicle_type || 'Car', vehicle.vehicle_number, vehicle.parking_slot || null]);
            }
        }

        if (payload.family && Array.isArray(payload.family)) {
            for (const member of payload.family) {
                if (!member.name) continue;
                await db.query(`
                    INSERT INTO family_members (user_id, name, age, relation, phone)
                    VALUES (?, ?, ?, ?, ?)
                `, [userId, member.name, member.age || null, member.relation || null, member.phone || member.phone_number || null]);
            }
        }

        return res.status(201).json({ success: true, message: 'Resident and all complex mappings added successfully' });
    } catch (error) {
        console.error('addResident error:', error);
        return res.status(500).json({ success: false, message: 'Server error adding resident with complex payload' });
    }
};

exports.updateResident = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            status,
            kyc_status,
            name,
            email,
            phone_number,
            basic,
            flat,
            identity,
            emergency,
            notifications,
            permissions,
            access,
            vehicles,
            family
        } = req.body;
        const permissionSource = permissions || access || {};

        if (status || kyc_status || (!basic && (name || email || phone_number))) {
            let query = 'UPDATE users SET ';
            const updates = [];
            const queryParams = [];

            if (status) {
                updates.push('status = ?');
                queryParams.push(status);
            }
            if (kyc_status) {
                updates.push('kyc_status = ?');
                queryParams.push(kyc_status);
            }
            if (name) {
                updates.push('name = ?');
                queryParams.push(name);
            }
            if (email) {
                updates.push('email = ?');
                queryParams.push(email);
            }
            if (phone_number) {
                updates.push('phone_number = ?');
                queryParams.push(phone_number);
            }

            if (updates.length > 0) {
                query += `${updates.join(', ')} WHERE id = ? AND society_id = ?`;
                queryParams.push(id, req.user.society_id);
                await db.query(query, queryParams);
            }
            return res.status(200).json({ success: true, message: 'Resident status updated successfully' });
        }

        if (basic) {
            let flatIdResolved = flat?.flat_id || null;
            const moveInDate = normalizeResidentDate(flat?.move_in_date);
            const moveOutDate = normalizeResidentDate(flat?.move_out_date);
            const accessRole = normalizeAccessRole(flat?.access_role);

            await db.query(`
                UPDATE users SET
                    name = ?, phone_number = ?, email = ?,
                    id_type = ?, id_number = ?, id_proof_url = ?,
                    emergency_name = ?, emergency_relation = ?, emergency_phone = ?,
                    push_notifications = ?, sms_alerts = ?, whatsapp_alerts = ?,
                    can_approve_visitors = ?, can_view_bills = ?, can_raise_complaints = ?
                WHERE id = ? AND society_id = ?
            `, [
                basic.name, basic.phone_number, basic.email || null,
                identity?.id_type || null, identity?.id_number || null, identity?.id_proof_url || null,
                emergency?.emergency_name || null, emergency?.emergency_relation || null, emergency?.emergency_phone || null,
                notifications?.push_notifications ? 1 : 0, notifications?.sms_alerts ? 1 : 0, notifications?.whatsapp_alerts ? 1 : 0,
                permissionSource.can_approve_visitors ? 1 : 0, permissionSource.can_view_bills ? 1 : 0, permissionSource.can_raise_complaints ? 1 : 0,
                id, req.user.society_id
            ]);

            if (flat && flat.block_name && flat.flat_number) {
                const [existingFlat] = await db.query(
                    'SELECT id FROM flats WHERE society_id = ? AND block_name = ? AND flat_number = ?',
                    [req.user.society_id, flat.block_name, flat.flat_number]
                );

                if (existingFlat.length > 0) {
                    flatIdResolved = existingFlat[0].id;
                    await db.query(
                        'UPDATE flats SET flat_type = ? WHERE id = ? AND society_id = ?',
                        [flat.flat_type || null, flatIdResolved, req.user.society_id]
                    );
                } else {
                    const [flatResult] = await db.query(
                        'INSERT INTO flats (society_id, block_name, flat_number, flat_type) VALUES (?, ?, ?, ?)',
                        [req.user.society_id, flat.block_name, flat.flat_number, flat.flat_type || null]
                    );
                    flatIdResolved = flatResult.insertId;
                }

                const accessRoleAvailable = await ensureFlatAccessRoleAvailable({
                    flatId: flatIdResolved,
                    accessRole: accessRole,
                    userId: Number(id),
                });

                if (!accessRoleAvailable) {
                    return res.status(409).json({
                        success: false,
                        message: `${accessRole} resident access is already assigned for this flat`,
                    });
                }

                await db.query('DELETE FROM user_flats WHERE user_id = ?', [id]);
                await db.query(
                    'INSERT INTO user_flats (user_id, flat_id, type, access_role, move_in_date, move_out_date) VALUES (?, ?, ?, ?, ?, ?)',
                    [id, flatIdResolved, flat.occupancy_type || 'Owner', accessRole, moveInDate, moveOutDate]
                );
            }

            if (!flatIdResolved) {
                const [existingUserFlat] = await db.query('SELECT flat_id FROM user_flats WHERE user_id = ? LIMIT 1', [id]);
                flatIdResolved = existingUserFlat[0]?.flat_id || null;
            }

            await db.query('DELETE FROM vehicles WHERE user_id = ?', [id]);
            if (vehicles && Array.isArray(vehicles) && flatIdResolved) {
                for (const vehicle of vehicles) {
                    if (!vehicle.vehicle_number) continue;
                    await db.query(
                        'INSERT INTO vehicles (user_id, flat_id, vehicle_type, vehicle_number, parking_slot) VALUES (?, ?, ?, ?, ?)',
                        [id, flatIdResolved, vehicle.vehicle_type || 'Car', vehicle.vehicle_number, vehicle.parking_slot || null]
                    );
                }
            }

            await db.query('DELETE FROM family_members WHERE user_id = ?', [id]);
            if (family && Array.isArray(family)) {
                for (const member of family) {
                    if (!member.name) continue;
                    await db.query(
                        'INSERT INTO family_members (user_id, name, age, relation, phone) VALUES (?, ?, ?, ?, ?)',
                        [id, member.name, member.age || null, member.relation || null, member.phone || member.phone_number || null]
                    );
                }
            }

            return res.status(200).json({ success: true, message: 'Deep profile overwrite successful.' });
        }

        return res.status(400).json({ success: false, message: 'Invalid payload' });
    } catch (error) {
        console.error('updateResident error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating resident' });
    }
};

exports.removeResidentMapping = async (req, res) => {
    try {
        const { id } = req.params;
        const { flat_id } = req.body;
        await db.query('DELETE FROM user_flats WHERE user_id = ? AND flat_id = ?', [id, flat_id]);
        return res.status(200).json({ success: true, message: 'Resident removed from flat' });
    } catch (error) {
        console.error('removeResident error:', error);
        return res.status(500).json({ success: false, message: 'Server error removing resident' });
    }
};

exports.deleteResident = async (req, res) => {
    try {
        const { id } = req.params;

        const [users] = await db.query(
            'SELECT id, role, society_id FROM users WHERE id = ? AND society_id = ? AND role = ? LIMIT 1',
            [id, req.user.society_id, 'RESIDENT']
        );

        if (!users.length) {
            return res.status(404).json({ success: false, message: 'Resident not found' });
        }

        await db.query('DELETE FROM family_members WHERE user_id = ?', [id]);
        await db.query('DELETE FROM vehicles WHERE user_id = ?', [id]);
        await db.query('DELETE FROM user_flats WHERE user_id = ?', [id]);
        await db.query('DELETE FROM users WHERE id = ? AND society_id = ?', [id, req.user.society_id]);

        return res.status(200).json({ success: true, message: 'Resident deleted successfully' });
    } catch (error) {
        console.error('deleteResident error:', error);
        return res.status(500).json({ success: false, message: 'Server error deleting resident' });
    }
};
