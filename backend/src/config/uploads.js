const fs = require('fs');
const path = require('path');

const uploadsRoot = process.env.UPLOADS_ROOT || '/var/app-data/gatesync/uploads';

function ensureUploadsRoot() {
    fs.mkdirSync(uploadsRoot, { recursive: true });
}

function buildUploadPublicPath(filePath) {
    const relativePath = path.relative(uploadsRoot, filePath).replace(/\\/g, '/');
    return `/uploads/${relativePath}`;
}

module.exports = {
    uploadsRoot,
    ensureUploadsRoot,
    buildUploadPublicPath,
};
