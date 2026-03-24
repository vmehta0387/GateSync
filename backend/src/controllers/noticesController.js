const db = require('../config/db');

exports.createNotice = async (req, res) => {
    try {
        const { title, content } = req.body;
        const userId = req.user.id;

        if (!title || !content) {
            return res.status(400).json({ success: false, message: 'title and content are required' });
        }

        const [result] = await db.query(
            "INSERT INTO Notices (title, content, created_by) VALUES (?, ?, ?)",
            [title, content, userId]
        );

        // Optionally, trigger websocket event here to notify connected clients

        return res.status(201).json({ success: true, message: 'Notice broadcasted successfully', noticeId: result.insertId });
    } catch (error) {
        console.error('createNotice error:', error);
        return res.status(500).json({ success: false, message: 'Server error creating notice' });
    }
};

exports.getNotices = async (req, res) => {
    try {
        const query = `
            SELECT n.*, u.phone_number as admin_phone
            FROM Notices n
            JOIN Users u ON n.created_by = u.id
            ORDER BY n.created_at DESC
        `;
        const [notices] = await db.query(query);
        return res.status(200).json({ success: true, notices });
    } catch (error) {
        console.error('getNotices error:', error);
        return res.status(500).json({ success: false, message: 'Server error retrieving notices' });
    }
};
