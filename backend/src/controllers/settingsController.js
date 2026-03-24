const db = require('../config/db');

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

const MANAGER_ALLOWED_MODULES = ['dashboard', 'visitors', 'communication', 'complaints', 'staff', 'residents', 'facilities', 'security'];

exports.getManagers = async (req, res) => {
    try {
        const [managers] = await db.query(
            `SELECT id, name, email, phone_number, status, created_at
             FROM Users
             WHERE society_id = ? AND role = 'MANAGER'
             ORDER BY created_at DESC, id DESC`,
            [req.user.society_id]
        );

        return res.status(200).json({
            success: true,
            managers,
            meta: {
                allowed_modules: MANAGER_ALLOWED_MODULES,
            },
        });
    } catch (error) {
        console.error('getManagers error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving managers' });
    }
};

exports.createManager = async (req, res) => {
    try {
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim() || null;
        const phone_number = String(req.body.phone_number || '').trim();
        const status = String(req.body.status || 'ACTIVE').trim().toUpperCase();

        if (!name || !phone_number) {
            return res.status(400).json({ success: false, message: 'Manager name and phone number are required' });
        }

        if (!/^\d{10}$/.test(phone_number)) {
            return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits' });
        }

        if (!['ACTIVE', 'INACTIVE'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid manager status' });
        }

        const [existingUsers] = await db.query('SELECT id FROM Users WHERE phone_number = ?', [phone_number]);
        if (existingUsers.length > 0) {
            return res.status(409).json({ success: false, message: 'This phone number is already linked to another user account' });
        }

        const [result] = await db.query(
            `INSERT INTO Users (society_id, name, email, phone_number, role, status)
             VALUES (?, ?, ?, ?, 'MANAGER', ?)`,
            [req.user.society_id, name, email, phone_number, status]
        );

        return res.status(201).json({
            success: true,
            message: 'Manager added successfully',
            manager_id: result.insertId,
        });
    } catch (error) {
        console.error('createManager error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating manager' });
    }
};

exports.updateManager = async (req, res) => {
    try {
        const managerId = Number(req.params.id);
        const name = String(req.body.name || '').trim();
        const email = String(req.body.email || '').trim() || null;
        const phone_number = String(req.body.phone_number || '').trim();
        const status = String(req.body.status || 'ACTIVE').trim().toUpperCase();

        const [managers] = await db.query(
            `SELECT id FROM Users WHERE id = ? AND society_id = ? AND role = 'MANAGER' LIMIT 1`,
            [managerId, req.user.society_id]
        );

        if (!managers.length) {
            return res.status(404).json({ success: false, message: 'Manager not found' });
        }

        if (!name || !phone_number) {
            return res.status(400).json({ success: false, message: 'Manager name and phone number are required' });
        }

        if (!/^\d{10}$/.test(phone_number)) {
            return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits' });
        }

        if (!['ACTIVE', 'INACTIVE'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid manager status' });
        }

        const [duplicateUsers] = await db.query(
            'SELECT id FROM Users WHERE phone_number = ? AND id <> ? LIMIT 1',
            [phone_number, managerId]
        );

        if (duplicateUsers.length > 0) {
            return res.status(409).json({ success: false, message: 'This phone number is already linked to another user account' });
        }

        await db.query(
            `UPDATE Users
             SET name = ?, email = ?, phone_number = ?, status = ?
             WHERE id = ? AND society_id = ? AND role = 'MANAGER'`,
            [name, email, phone_number, status, managerId, req.user.society_id]
        );

        return res.status(200).json({ success: true, message: 'Manager updated successfully' });
    } catch (error) {
        console.error('updateManager error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating manager' });
    }
};

exports.getSettings = async (req, res) => {
    try {
        const [society] = await db.query(`SELECT config_settings FROM Societies WHERE id = ?`, [req.user.society_id]);
        return res.status(200).json({
            success: true,
            settings: normalizeSettings(society[0]?.config_settings)
        });
    } catch (error) {
        console.error('getSettings error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving settings' });
    }
};

exports.updateSettings = async (req, res) => {
    try {
        const settings = req.body.settings ?? req.body.config_settings ?? {};
        await db.query(
            `UPDATE Societies SET config_settings = ? WHERE id = ?`,
            [JSON.stringify(settings), req.user.society_id]
        );
        return res.status(200).json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        console.error('updateSettings error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating settings' });
    }
};
