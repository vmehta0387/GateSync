const DEFAULT_ALLOWED_ORIGINS = [
    'https://gatesync.in',
    'https://www.gatesync.in',
    'https://admin.gatesync.in',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
];

function getAllowedOrigins() {
    const configuredOrigins = String(process.env.CORS_ORIGINS || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    return Array.from(new Set(configuredOrigins.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS));
}

function createCorsOriginDelegate(allowedOrigins = getAllowedOrigins()) {
    return (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            return callback(null, true);
        }

        console.warn(`CORS rejected origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'));
    };
}

const allowedOrigins = getAllowedOrigins();

const corsOptions = {
    origin: createCorsOriginDelegate(allowedOrigins),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
};

module.exports = {
    DEFAULT_ALLOWED_ORIGINS,
    getAllowedOrigins,
    createCorsOriginDelegate,
    corsOptions,
};
