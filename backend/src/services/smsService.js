const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';

const normalizePhoneNumber = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) {
        return `+91${digits}`;
    }
    if (digits.startsWith('91') && digits.length === 12) {
        return `+${digits}`;
    }
    if (digits.length >= 11) {
        return `+${digits}`;
    }
    return null;
};

const sendWithTwilio = async ({ to, body }) => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;

    if (!accountSid || !authToken || !from) {
        return {
            success: false,
            provider: 'twilio',
            skipped: true,
            reason: 'Twilio credentials are incomplete',
        };
    }

    const response = await fetch(`${TWILIO_API_BASE}/Accounts/${accountSid}/messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
            From: from,
            To: to,
            Body: body,
        }),
    });

    const payload = await response.json();
    if (!response.ok) {
        return {
            success: false,
            provider: 'twilio',
            error: payload.message || 'Twilio rejected the message',
            details: payload,
        };
    }

    return {
        success: true,
        provider: 'twilio',
        sid: payload.sid,
        status: payload.status,
    };
};

const sendWithMock = async ({ to, body }) => {
    console.log(`[Mock SMS] To ${to}: ${body}`);
    return {
        success: true,
        provider: 'mock',
        mocked: true,
    };
};

exports.sendSms = async ({ to, body }) => {
    const normalizedTo = normalizePhoneNumber(to);
    const messageBody = String(body || '').trim();

    if (!normalizedTo) {
        return {
            success: false,
            skipped: true,
            reason: 'Recipient phone number is invalid',
        };
    }

    if (!messageBody) {
        return {
            success: false,
            skipped: true,
            reason: 'SMS body is empty',
        };
    }

    const provider = String(process.env.SMS_PROVIDER || 'mock').trim().toLowerCase();

    try {
        if (provider === 'twilio') {
            return await sendWithTwilio({ to: normalizedTo, body: messageBody });
        }

        return await sendWithMock({ to: normalizedTo, body: messageBody });
    } catch (error) {
        console.error('sendSms error:', error);
        return {
            success: false,
            provider,
            error: error.message || 'SMS delivery failed',
        };
    }
};

exports.sendBulkSms = async ({ recipients, body }) => {
    const uniqueRecipients = [...new Set((recipients || []).map((value) => String(value || '').trim()).filter(Boolean))];
    const results = await Promise.all(uniqueRecipients.map((recipient) => exports.sendSms({ to: recipient, body })));
    return {
        attempted: uniqueRecipients.length,
        sent: results.filter((result) => result.success).length,
        results,
    };
};
