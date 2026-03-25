const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { uploadsRoot, ensureUploadsRoot } = require('../config/uploads');

function ensureDirectory(directoryPath) {
    fs.mkdirSync(directoryPath, { recursive: true });
}

function sanitizeFilename(filename) {
    return filename.replace(/[^a-zA-Z0-9.-]/g, '_');
}

function createStorage(subdirectory) {
    return multer.diskStorage({
        destination: (req, file, callback) => {
            const destinationPath = path.join(uploadsRoot, subdirectory);
            ensureUploadsRoot();
            ensureDirectory(destinationPath);
            callback(null, destinationPath);
        },
        filename: (req, file, callback) => {
            const extension = path.extname(file.originalname);
            const baseName = path.basename(file.originalname, extension);
            callback(null, `${Date.now()}-${sanitizeFilename(baseName)}${extension}`);
        },
    });
}

function createUploader({ subdirectory, allowedMimeTypes }) {
    return multer({
        storage: createStorage(subdirectory),
        limits: {
            fileSize: 8 * 1024 * 1024,
        },
        fileFilter: (req, file, callback) => {
            if (allowedMimeTypes.includes(file.mimetype)) {
                callback(null, true);
                return;
            }

            callback(new Error('Unsupported file type'));
        },
    });
}

exports.uploadStaffPhoto = createUploader({
    subdirectory: 'staff/photos',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
});

exports.uploadStaffDocument = createUploader({
    subdirectory: 'staff/documents',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'],
});

exports.uploadVisitorPhoto = createUploader({
    subdirectory: 'visitors/photos',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'],
});

exports.uploadCommunicationAttachment = createUploader({
    subdirectory: 'communication/attachments',
    allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/jpg',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
    ],
});

exports.uploadComplaintAttachment = createUploader({
    subdirectory: 'complaints/attachments',
    allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/jpg',
        'application/pdf',
        'video/mp4',
        'video/quicktime',
        'text/plain',
    ],
});

exports.uploadSecurityIncidentAttachment = createUploader({
    subdirectory: 'security/incidents',
    allowedMimeTypes: [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/jpg',
        'application/pdf',
        'video/mp4',
        'video/quicktime',
        'text/plain',
    ],
});
