const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { isExpoPushToken } = require('../services/pushNotificationService');
const { sendSms } = require('../services/smsService');
const { checkVerification, startVerification } = require('../services/twilioService');

async function fetchUserWithSociety(userId) {
    const [users] = await db.query(`
        SELECT u.*, s.name AS society_name
        FROM users u
        LEFT JOIN societies s ON s.id = u.society_id
        WHERE u.id = ?
        LIMIT 1
    `, [userId]);
    return users[0] || null;
}

// Fallback OTP storage when Twilio Verify is not configured.
const otpStore = new Map();

exports.sendOtp = async (req, res) => {
    try {
        const { phone_number } = req.body;
        
        if (!phone_number) {
            return res.status(400).json({ success: false, message: 'Phone number is required' });
        }

        // Validate 10 digits strictly
        if (!/^\d{10}$/.test(phone_number)) {
            return res.status(400).json({ success: false, message: 'Phone number must be exactly 10 digits' });
        }

        // Check if user exists in DB before sending OTP
        const [users] = await db.query('SELECT id, status FROM users WHERE phone_number = ?', [phone_number]);
        if (users.length === 0) {
            return res.status(403).json({ success: false, message: 'Phone number is not registered. Please contact your society Admin.' });
        }

        if (users[0].status && users[0].status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'This account is inactive. Please contact your society admin.' });
        }

        let otpMessage = 'OTP sent successfully';
        if (process.env.TWILIO_VERIFY_SERVICE_SID) {
            const verifyResult = await startVerification({ to: phone_number, channel: 'sms' });
            if (!verifyResult.success) {
                return res.status(500).json({ success: false, message: verifyResult.message || 'Unable to send OTP via Twilio Verify' });
            }
        } else {
            const otp = Math.floor(100000 + Math.random() * 900000).toString();
            otpStore.set(phone_number, otp);
            const smsResult = await sendSms({
                to: phone_number,
                body: `GateSync OTP: ${otp}. It expires in 10 minutes. Do not share this code with anyone.`,
            });

            if (!smsResult.success) {
                return res.status(500).json({
                    success: false,
                    message: smsResult.error || smsResult.reason || 'Unable to send OTP via Twilio SMS',
                });
            }
            otpMessage = 'OTP sent successfully';
        }

        return res.status(200).json({
            success: true,
            message: otpMessage,
        });
    } catch (error) {
        console.error('sendOtp error:', error);
        return res.status(500).json({ success: false, message: 'Server error sending OTP' });
    }
};

exports.verifyOtp = async (req, res) => {
    try {
        const { phone_number, otp } = req.body;

        if (!phone_number || !otp) {
            return res.status(400).json({ success: false, message: 'Phone number and OTP are required' });
        }

        if (process.env.TWILIO_VERIFY_SERVICE_SID) {
            const verifyResult = await checkVerification({ to: phone_number, code: otp });
            if (!verifyResult.success || !verifyResult.valid) {
                return res.status(401).json({ success: false, message: verifyResult.message || 'Invalid or expired OTP' });
            }
        } else {
            const storedOtp = otpStore.get(phone_number);
            if (!storedOtp || storedOtp !== otp) {
                return res.status(401).json({ success: false, message: 'Invalid or expired OTP' });
            }
        }

        // Clear OTP
        otpStore.delete(phone_number);

        // Check if user exists
        const [users] = await db.query('SELECT id FROM users WHERE phone_number = ?', [phone_number]);
        let user = users[0];

        if (!user) {
            return res.status(403).json({ success: false, message: 'Phone number is not registered. Please contact Admin.' });
        }

        user = await fetchUserWithSociety(user.id);

        if (user.status && user.status !== 'ACTIVE') {
            return res.status(403).json({ success: false, message: 'This account is inactive. Please contact your society admin.' });
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, role: user.role, phone_number: user.phone_number, society_id: user.society_id, name: user.name || '' },
            process.env.JWT_SECRET || 'supersecret_jwt_gatepulse_token',
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user.id,
                name: user.name || '',
                phone_number: user.phone_number,
                role: user.role,
                society_id: user.society_id,
                society_name: user.society_name || ''
            }
        });
    } catch (error) {
        console.error('verifyOtp error:', error);
        return res.status(500).json({ success: false, message: 'Server error verifying OTP' });
    }
};

exports.getMe = async (req, res) => {
    try {
        const user = await fetchUserWithSociety(req.user.id);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        return res.status(200).json({
            success: true,
            user: {
                id: user.id,
                name: user.name || '',
                phone_number: user.phone_number,
                role: user.role,
                society_id: user.society_id,
                society_name: user.society_name || ''
            }
        });
    } catch (error) {
        console.error('getMe error:', error);
        return res.status(500).json({ success: false, message: 'Server error fetching profile' });
    }
};

exports.registerPushToken = async (req, res) => {
    try {
        const expo_push_token = String(req.body.expo_push_token || '').trim();
        const installation_id = String(req.body.installation_id || '').trim() || null;
        const platform = ['android', 'ios'].includes(String(req.body.platform || '').toLowerCase())
            ? String(req.body.platform).toLowerCase()
            : 'unknown';
        const app_role = ['RESIDENT', 'GUARD'].includes(String(req.body.app_role || '').toUpperCase())
            ? String(req.body.app_role).toUpperCase()
            : 'OTHER';
        const device_name = String(req.body.device_name || '').trim() || null;

        if (!isExpoPushToken(expo_push_token)) {
            return res.status(400).json({ success: false, message: 'A valid Expo push token is required' });
        }

        await db.query(
            `INSERT INTO user_device_tokens (
                user_id, expo_push_token, installation_id, platform, app_role, device_name, is_active, last_seen_at
            ) VALUES (?, ?, ?, ?, ?, ?, TRUE, NOW())
            ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                installation_id = VALUES(installation_id),
                platform = VALUES(platform),
                app_role = VALUES(app_role),
                device_name = VALUES(device_name),
                is_active = TRUE,
                last_seen_at = NOW()`,
            [req.user.id, expo_push_token, installation_id, platform, app_role, device_name]
        );

        return res.status(200).json({ success: true, message: 'Push token registered successfully' });
    } catch (error) {
        console.error('registerPushToken error:', error);
        return res.status(500).json({ success: false, message: 'Server error registering push token' });
    }
};

exports.unregisterPushToken = async (req, res) => {
    try {
        const expo_push_token = String(req.body.expo_push_token || '').trim();
        const installation_id = String(req.body.installation_id || '').trim();

        if (!expo_push_token && !installation_id) {
            return res.status(400).json({ success: false, message: 'Push token or installation id is required' });
        }

        const conditions = ['user_id = ?'];
        const params = [req.user.id];

        if (expo_push_token) {
            conditions.push('expo_push_token = ?');
            params.push(expo_push_token);
        }

        if (installation_id) {
            conditions.push('installation_id = ?');
            params.push(installation_id);
        }

        await db.query(
            `UPDATE user_device_tokens
             SET is_active = FALSE, last_seen_at = NOW()
             WHERE ${conditions.join(' AND ')}`,
            params
        );

        return res.status(200).json({ success: true, message: 'Push token unregistered successfully' });
    } catch (error) {
        console.error('unregisterPushToken error:', error);
        return res.status(500).json({ success: false, message: 'Server error unregistering push token' });
    }
};
