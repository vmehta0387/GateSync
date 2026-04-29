const db = require('../config/db');
const { ensureSocietySubscription } = require('../services/subscriptionService');

exports.createSociety = async (req, res) => {
    let connection;
    try {
        const {
            name, address, society_type, towers_count, floors_per_tower, total_flats,
            amenities, config_settings, subscription_plan,
            admin,
            gates,
        } = req.body;

        if (!name || !admin || !admin.phone) {
            return res.status(400).json({ success: false, message: 'Society name and admin phone are required' });
        }

        if (!/^\d{10}$/.test(String(admin.phone || '').trim())) {
            return res.status(400).json({ success: false, message: 'Admin phone number must be exactly 10 digits' });
        }

        if (!Number(total_flats) || Number(total_flats) <= 0) {
            return res.status(400).json({ success: false, message: 'Declared units/flats must be greater than 0' });
        }

        const [existingAdmins] = await db.query(
            'SELECT id FROM users WHERE phone_number = ? LIMIT 1',
            [String(admin.phone).trim()]
        );
        if (existingAdmins.length > 0) {
            return res.status(409).json({
                success: false,
                message: 'This admin phone number is already mapped to an account. Please use a different number or contact support.',
            });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        const [societyResult] = await connection.query(
            `INSERT INTO societies
            (name, address, society_type, towers_count, floors_per_tower, total_flats, amenities, config_settings, subscription_plan)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name,
                address || '',
                society_type || 'Apartment',
                Number(towers_count || 0),
                Number(floors_per_tower || 0),
                Number(total_flats || 0),
                JSON.stringify(amenities || []),
                JSON.stringify(config_settings || {}),
                subscription_plan || 'Free',
            ]
        );

        const societyId = societyResult.insertId;

        await connection.query(
            `INSERT INTO users (society_id, name, email, phone_number, role, status)
             VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE')`,
            [societyId, admin.name || '', admin.email || '', String(admin.phone).trim()]
        );

        if (Array.isArray(gates) && gates.length > 0) {
            const gateValues = gates
                .filter((gate) => gate && String(gate.name || '').trim())
                .map((gate) => [societyId, String(gate.name).trim(), gate.gate_type || 'Main']);
            if (gateValues.length > 0) {
                await connection.query(
                    'INSERT INTO gates (society_id, name, gate_type) VALUES ?',
                    [gateValues]
                );
            }
        }

        await ensureSocietySubscription(societyId, connection);

        await connection.commit();
        return res.status(201).json({
            success: true,
            message: 'Society onboarding started successfully. Admin can now login using OTP.',
            societyId,
            next_step: {
                login_phone: String(admin.phone).trim(),
                login_path: '/',
            },
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('public createSociety error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating society onboarding request' });
    } finally {
        if (connection) connection.release();
    }
};
