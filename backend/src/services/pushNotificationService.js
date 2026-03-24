const db = require('../config/db');

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

const normalizeUserIds = (userIds = []) => (
    [...new Set(
        userIds
            .map((value) => Number(value))
            .filter((value) => Number.isInteger(value) && value > 0)
    )]
);

const isExpoPushToken = (value) => typeof value === 'string' && /^ExponentPushToken\[[^\]]+\]$/.test(value.trim());

const chunk = (items, size) => {
    const result = [];
    for (let index = 0; index < items.length; index += size) {
        result.push(items.slice(index, index + size));
    }
    return result;
};

const deactivateTokens = async (tokens = []) => {
    const normalizedTokens = [...new Set(tokens.filter(Boolean))];
    if (!normalizedTokens.length) {
        return;
    }

    const placeholders = normalizedTokens.map(() => '?').join(', ');
    await db.query(
        `UPDATE User_Device_Tokens
         SET is_active = FALSE
         WHERE expo_push_token IN (${placeholders})`,
        normalizedTokens
    );
};

const fetchActiveTokensForUsers = async (userIds = []) => {
    const normalizedIds = normalizeUserIds(userIds);
    if (!normalizedIds.length) {
        return [];
    }

    const placeholders = normalizedIds.map(() => '?').join(', ');
    const [rows] = await db.query(
        `SELECT DISTINCT expo_push_token
         FROM User_Device_Tokens
         WHERE is_active = TRUE AND user_id IN (${placeholders})`,
        normalizedIds
    );

    return rows
        .map((row) => row.expo_push_token)
        .filter(isExpoPushToken);
};

const postExpoMessages = async (messages = []) => {
    if (!messages.length) {
        return { attempted: 0, sent: 0, invalid_tokens: [] };
    }

    const invalidTokens = [];
    let sent = 0;

    for (const batch of chunk(messages, 100)) {
        const response = await fetch(EXPO_PUSH_ENDPOINT, {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(batch),
        });

        const payload = await response.json().catch(() => null);
        const tickets = Array.isArray(payload?.data) ? payload.data : [];

        batch.forEach((message, index) => {
            const ticket = tickets[index];
            if (ticket?.status === 'ok') {
                sent += 1;
                return;
            }

            if (ticket?.details?.error === 'DeviceNotRegistered') {
                invalidTokens.push(message.to);
            }
        });
    }

    if (invalidTokens.length) {
        await deactivateTokens(invalidTokens);
    }

    return {
        attempted: messages.length,
        sent,
        invalid_tokens: invalidTokens,
    };
};

async function sendPushToUsers({ userIds = [], title, body, data = {}, sound = 'default' }) {
    const tokens = await fetchActiveTokensForUsers(userIds);
    if (!tokens.length) {
        return { attempted: 0, sent: 0, invalid_tokens: [] };
    }

    const messages = tokens.map((token) => ({
        to: token,
        title,
        body,
        data,
        sound,
    }));

    return postExpoMessages(messages);
}

async function getFlatResidentUserIds(flatId) {
    const [rows] = await db.query(
        `SELECT DISTINCT u.id
         FROM User_Flats uf
         INNER JOIN Users u ON u.id = uf.user_id
         WHERE uf.flat_id = ? AND u.role = 'RESIDENT' AND u.status = 'ACTIVE' AND COALESCE(u.push_notifications, 1) = 1`,
        [flatId]
    );

    return rows.map((row) => row.id);
}

async function getSocietyGuardUserIds(societyId) {
    const [rows] = await db.query(
        `SELECT id
         FROM Users
         WHERE society_id = ? AND role = 'GUARD' AND status = 'ACTIVE'`,
        [societyId]
    );

    return rows.map((row) => row.id);
}

async function sendPushToFlatResidents({ flatId, title, body, data = {} }) {
    const residentUserIds = await getFlatResidentUserIds(flatId);
    return sendPushToUsers({ userIds: residentUserIds, title, body, data });
}

async function sendPushToSocietyGuards({ societyId, title, body, data = {} }) {
    const guardUserIds = await getSocietyGuardUserIds(societyId);
    return sendPushToUsers({ userIds: guardUserIds, title, body, data });
}

module.exports = {
    isExpoPushToken,
    sendPushToUsers,
    sendPushToFlatResidents,
    sendPushToSocietyGuards,
};
