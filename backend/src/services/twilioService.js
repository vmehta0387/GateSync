const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01';
const TWILIO_VERIFY_BASE = 'https://verify.twilio.com/v2';

const normalizePhoneNumber = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 10) return `+91${digits}`;
    if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
    if (digits.length >= 11) return `+${digits}`;
    return null;
};

const getBasicAuthHeader = () => {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!accountSid || !authToken) {
        return null;
    }

    return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
};

async function postForm(url, body) {
    const authHeader = getBasicAuthHeader();
    if (!authHeader) {
        return { success: false, message: 'Twilio account credentials are incomplete' };
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Authorization: authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body),
    });

    const payload = await response.json();
    if (!response.ok) {
        return {
            success: false,
            message: payload.message || 'Twilio request failed',
            details: payload,
        };
    }

    return { success: true, payload };
}

async function startVerification({ to, channel = 'sms' }) {
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    const normalizedTo = normalizePhoneNumber(to);
    if (!serviceSid) {
        return { success: false, message: 'Twilio Verify Service SID is missing' };
    }
    if (!normalizedTo) {
        return { success: false, message: 'Recipient phone number is invalid' };
    }

    const result = await postForm(`${TWILIO_VERIFY_BASE}/Services/${serviceSid}/Verifications`, {
        To: normalizedTo,
        Channel: channel,
    });

    if (!result.success) {
        return result;
    }

    return {
        success: true,
        sid: result.payload.sid,
        status: result.payload.status,
        to: normalizedTo,
    };
}

async function checkVerification({ to, code }) {
    const serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    const normalizedTo = normalizePhoneNumber(to);
    if (!serviceSid) {
        return { success: false, message: 'Twilio Verify Service SID is missing' };
    }
    if (!normalizedTo || !code) {
        return { success: false, message: 'Phone number and code are required' };
    }

    const result = await postForm(`${TWILIO_VERIFY_BASE}/Services/${serviceSid}/VerificationCheck`, {
        To: normalizedTo,
        Code: String(code || '').trim(),
    });

    if (!result.success) {
        return result;
    }

    return {
        success: true,
        sid: result.payload.sid,
        status: result.payload.status,
        valid: result.payload.status === 'approved',
    };
}

async function createCall({ to, from, url, statusCallback }) {
    const normalizedTo = normalizePhoneNumber(to);
    const normalizedFrom = normalizePhoneNumber(from);
    if (!normalizedTo || !normalizedFrom) {
        return { success: false, message: 'Twilio call requires valid from and to numbers' };
    }
    if (!url) {
        return { success: false, message: 'Twilio call callback URL is required' };
    }

    const result = await postForm(`${TWILIO_API_BASE}/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`, {
        To: normalizedTo,
        From: normalizedFrom,
        Url: url,
        ...(statusCallback ? { StatusCallback: statusCallback } : {}),
    });

    if (!result.success) {
        return result;
    }

    return {
        success: true,
        sid: result.payload.sid,
        status: result.payload.status,
        to: normalizedTo,
        from: normalizedFrom,
    };
}

module.exports = {
    normalizePhoneNumber,
    startVerification,
    checkVerification,
    createCall,
};
