const db = require('../config/db');

function buildQuotaError({ allowed, current, requested, remaining }) {
    const error = new Error(
        `Your subscription supports ${allowed} units. You already have ${current} units and tried to add ${requested} more.`
    );
    error.statusCode = 403;
    error.code = 'FLAT_QUOTA_EXCEEDED';
    error.details = {
        allowed_units: allowed,
        current_units: current,
        requested_new_units: requested,
        remaining_units: remaining,
    };
    return error;
}

async function getFlatQuotaSnapshot({ societyId, connection = db }) {
    const [[society]] = await connection.query(
        `SELECT total_flats
         FROM societies
         WHERE id = ?
         LIMIT 1`,
        [societyId]
    );

    if (!society) {
        const error = new Error('Society not found for flat quota validation');
        error.statusCode = 404;
        error.code = 'SOCIETY_NOT_FOUND';
        throw error;
    }

    const allowedUnits = Number(society.total_flats || 0);
    const [[countRow]] = await connection.query(
        'SELECT COUNT(*) AS total_units FROM flats WHERE society_id = ?',
        [societyId]
    );
    const currentUnits = Number(countRow?.total_units || 0);

    return {
        allowed_units: allowedUnits,
        current_units: currentUnits,
        remaining_units: Math.max(0, allowedUnits - currentUnits),
        has_limit: allowedUnits > 0,
    };
}

async function assertCanAddFlats({ societyId, requestedNewUnits = 1, connection = db }) {
    const reqUnits = Math.max(0, Number(requestedNewUnits || 0));
    if (reqUnits === 0) return;

    const snapshot = await getFlatQuotaSnapshot({ societyId, connection });
    if (!snapshot.has_limit) return;

    if (snapshot.current_units + reqUnits > snapshot.allowed_units) {
        throw buildQuotaError({
            allowed: snapshot.allowed_units,
            current: snapshot.current_units,
            requested: reqUnits,
            remaining: snapshot.remaining_units,
        });
    }
}

module.exports = {
    getFlatQuotaSnapshot,
    assertCanAddFlats,
};
