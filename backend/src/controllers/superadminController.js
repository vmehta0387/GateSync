const db = require('../config/db');

exports.getPlatformStats = async (req, res) => {
    try {
        const [[{ total_societies }]] = await db.query('SELECT COUNT(*) AS total_societies FROM societies');
        const [[{ total_users }]] = await db.query('SELECT COUNT(*) AS total_users FROM users WHERE role != "SUPERADMIN"');
        const [[{ total_revenue }]] = await db.query(`
            SELECT COALESCE(SUM(amount), 0) AS total_revenue FROM invoices WHERE status = 'Paid'
        `);

        return res.status(200).json({
            success: true,
            stats: {
                total_societies,
                total_users,
                total_revenue
            }
        });
    } catch (error) {
        console.error('getPlatformStats error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving stats' });
    }
};

exports.getSocieties = async (req, res) => {
    try {
        const [societies] = await db.query('SELECT * FROM societies ORDER BY created_at DESC');
        return res.status(200).json({ success: true, societies });
    } catch (error) {
        console.error('getSocieties error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving societies' });
    }
};

exports.onboardSociety = async (req, res) => {
    let connection;
    try {
        const {
            name, address, society_type, towers_count, floors_per_tower, total_flats,
            amenities, config_settings, subscription_plan,
            admin, // { name, email, phone }
            gates  // [{ name, gate_type }]
        } = req.body;

        if (!name || !admin || !admin.phone) {
            return res.status(400).json({ success: false, message: 'Society name and admin phone are required' });
        }

        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Create Society
        const [societyResult] = await connection.query(
            `INSERT INTO societies 
            (name, address, society_type, towers_count, floors_per_tower, total_flats, amenities, config_settings, subscription_plan) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                name, address || '', society_type || 'Apartment', towers_count || 0, 
                floors_per_tower || 0, total_flats || 0, JSON.stringify(amenities || []),
                JSON.stringify(config_settings || {}), subscription_plan || 'Free'
            ]
        );
        
        const societyId = societyResult.insertId;

        // 2. Create Root Admin for Society
        await connection.query(
            `INSERT INTO users (society_id, name, email, phone_number, role, status) 
             VALUES (?, ?, ?, ?, 'ADMIN', 'ACTIVE') 
             ON DUPLICATE KEY UPDATE society_id = VALUES(society_id), role = 'ADMIN', name = VALUES(name), email = VALUES(email)`,
            [societyId, admin.name || '', admin.email || '', admin.phone]
        );

        // 3. Create gates if provided
        if (gates && Array.isArray(gates) && gates.length > 0) {
            const gateValues = gates.map(g => [societyId, g.name, g.gate_type || 'Main']);
            await connection.query(
                `INSERT INTO gates (society_id, name, gate_type) VALUES ?`,
                [gateValues]
            );
        }

        await connection.commit();
        
        return res.status(201).json({
            success: true,
            message: 'Advanced Society onboarded successfully!',
            societyId
        });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('onboardSociety error:', error);
        return res.status(500).json({ success: false, message: 'Server error onboarding society' });
    } finally {
        if (connection) connection.release();
    }
};

exports.updateSocietyStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; 
        
        if (!['ACTIVE', 'SUSPENDED', 'INACTIVE'].includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status value' });
        }

        const [result] = await db.query(
            "UPDATE societies SET status = ? WHERE id = ?",
            [status, id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: 'Society not found' });
        }

        // Cascade status to tenant users
        await db.query(
            "UPDATE users SET status = ? WHERE society_id = ?",
            [status, id]
        );

        return res.status(200).json({ success: true, message: `Society status updated to ${status}` });
    } catch (error) {
        console.error('updateSocietyStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating status' });
    }
};

exports.getSocietyById = async (req, res) => {
    try {
        const { id } = req.params;
        const [societies] = await db.query('SELECT * FROM societies WHERE id = ?', [id]);
        if (societies.length === 0) return res.status(404).json({ success: false, message: 'Society not found' });
        
        // Also fetch the root admin
        const [users] = await db.query('SELECT name, email, phone_number FROM users WHERE society_id = ? AND role = "ADMIN"', [id]);
        const admin = users[0] || { name: '', email: '', phone_number: '' };

        // Also fetch gates
        const [gates] = await db.query('SELECT name, gate_type FROM gates WHERE society_id = ?', [id]);

        return res.status(200).json({ success: true, society: societies[0], admin, gates });
    } catch (error) {
        console.error('getSocietyById error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving society' });
    }
};

exports.generateFlats = async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const [societies] = await db.query('SELECT towers_count, floors_per_tower FROM societies WHERE id = ?', [id]);
        if (societies.length === 0) return res.status(404).json({ success: false, message: 'Society not found' });

        const towersCount = societies[0].towers_count || 1;
        const floorsCount = societies[0].floors_per_tower || 1;

        connection = await db.getConnection();
        await connection.beginTransaction();

        // Clear existing flats
        await connection.query('DELETE FROM flats WHERE society_id = ?', [id]);

        const towers = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
        const flatValues = [];
        
        for (let t = 0; t < Math.min(towersCount, 26); t++) {
            const blockName = `Tower ${towers[t]}`;
            for (let f = 1; f <= floorsCount; f++) {
                // assume 4 flats per floor algorithmically
                for(let num = 1; num <= 4; num++){
                    const flatNumber = `${f}0${num}`; // e.g., 101, 204
                    flatValues.push([id, blockName, flatNumber]);
                }
            }
        }

        if (flatValues.length > 0) {
            // chunk inserts
            for(let i = 0; i < flatValues.length; i+=100) {
                const chunk = flatValues.slice(i, i+100);
                await connection.query(
                    'INSERT INTO flats (society_id, block_name, flat_number) VALUES ?',
                    [chunk]
                );
            }
        }

        await connection.commit();
        return res.status(200).json({ success: true, message: `Successfully auto-generated and mapped ${flatValues.length} flats across ${towersCount} towers in the database!` });
    } catch (error) {
        if(connection) await connection.rollback();
        console.error('generateFlats error:', error);
        return res.status(500).json({ success: false, message: 'Server error generating flats structure' });
    } finally {
        if (connection) connection.release();
    }
};

exports.updateSociety = async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const {
            name, address, society_type, towers_count, floors_per_tower, total_flats,
            amenities, config_settings, subscription_plan,
            admin, // { name, email, phone_number }
            gates  // [{ name, gate_type }]
        } = req.body;

        connection = await db.getConnection();
        await connection.beginTransaction();

        // 1. Update Society
        await connection.query(
            `UPDATE societies SET 
            name=?, address=?, society_type=?, towers_count=?, floors_per_tower=?, total_flats=?, 
            amenities=?, config_settings=?, subscription_plan=?
            WHERE id=?`,
            [
                name, address, society_type, towers_count, floors_per_tower, total_flats,
                JSON.stringify(amenities || []), JSON.stringify(config_settings || {}), subscription_plan,
                id
            ]
        );

        // 2. Update Admin (assuming primary admin logic)
        if (admin && admin.phone_number) {
            await connection.query(
                `UPDATE users SET name=?, email=?, phone_number=? WHERE society_id=? AND role='ADMIN' LIMIT 1`,
                [admin.name || '', admin.email || '', admin.phone_number, id]
            );
        }

        // 3. Update gates by recreating them
        if (gates && Array.isArray(gates)) {
            await connection.query(`DELETE FROM gates WHERE society_id=?`, [id]);
            if (gates.length > 0) {
                const gateValues = gates.map(g => [id, g.name, g.gate_type || 'Main']);
                await connection.query(
                    `INSERT INTO gates (society_id, name, gate_type) VALUES ?`,
                    [gateValues]
                );
            }
        }

        await connection.commit();
        return res.status(200).json({ success: true, message: 'Society updated properly' });
    } catch (error) {
        if (connection) await connection.rollback();
        console.error('updateSociety error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating society' });
    } finally {
        if (connection) connection.release();
    }
};

