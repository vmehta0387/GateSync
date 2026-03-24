const db = require('../config/db');

exports.getDeliveries = async (req, res) => {
    try {
        const { role, id: userId, society_id } = req.user;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        let query = `
            SELECT d.*, f.block_name, f.flat_number
            FROM Deliveries d
            JOIN Flats f ON d.flat_id = f.id
            WHERE d.society_id = ?
        `;
        let queryParams = [society_id];

        if (role === 'RESIDENT') {
            query += ` AND f.id IN (SELECT flat_id FROM User_Flats WHERE user_id = ?)`;
            queryParams.push(userId);
        }

        query += ` ORDER BY d.created_at DESC LIMIT ? OFFSET ?`;
        queryParams.push(limit, offset);

        const [deliveries] = await db.query(query, queryParams);
        return res.status(200).json({ success: true, deliveries });
    } catch (error) {
        console.error('getDeliveries error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving deliveries' });
    }
};

exports.createDelivery = async (req, res) => {
    try {
        const { flat_id, company_name, delivery_person } = req.body;
        await db.query(`INSERT INTO Deliveries (society_id, flat_id, company_name, delivery_person, status) VALUES (?, ?, ?, ?, 'Expected')`, 
            [req.user.society_id, flat_id, company_name, delivery_person]);
        return res.status(201).json({ success: true, message: 'Delivery expected logged successfully' });
    } catch (error) {
        console.error('createDelivery error:', error);
        return res.status(500).json({ success: false, message: 'Server error logging delivery' });
    }
};

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body; // 'Arrived', 'Delivered', 'Failed'
        
        let query = `UPDATE Deliveries SET status = ? `;
        if (status === 'Arrived') query += `, entry_time = NOW() `;
        if (status === 'Delivered' || status === 'Failed') query += `, exit_time = NOW() `;
        query += `WHERE id = ? AND society_id = ?`;

        await db.query(query, [status, id, req.user.society_id]);
        return res.status(200).json({ success: true, message: `Delivery marked as ${status}` });
    } catch (error) {
        console.error('updateDeliveryStatus error:', error);
        return res.status(500).json({ success: false, message: 'Server error updating delivery' });
    }
};
