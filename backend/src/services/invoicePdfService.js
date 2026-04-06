const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { uploadsRoot, ensureUploadsRoot, buildUploadPublicPath } = require('../config/uploads');

const formatCurrency = (value) => `INR ${Number(value || 0).toFixed(2)}`;

const formatDate = (value) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';

    return new Intl.DateTimeFormat('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(date);
};

const ensureDirectory = (directoryPath) => {
    fs.mkdirSync(directoryPath, { recursive: true });
};

const safeValue = (value, fallback = '-') => {
    const normalized = String(value || '').trim();
    return normalized || fallback;
};

const drawSummaryRow = (doc, label, value, y, { bold = false } = {}) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11).text(label, 50, y, { width: 330 });
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(11).text(value, 380, y, { width: 170, align: 'right' });
};

const generateAndStoreInvoicePdf = async (payload) => {
    if (!payload?.id || !payload?.society_name) {
        throw new Error('Invalid invoice payload for PDF generation');
    }

    ensureUploadsRoot();
    const directoryPath = path.join(uploadsRoot, 'invoices', `society-${payload.society_id || 'default'}`);
    ensureDirectory(directoryPath);

    const fileName = `invoice-${payload.id}.pdf`;
    const filePath = path.join(directoryPath, fileName);
    const publicPath = buildUploadPublicPath(filePath);

    await new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const stream = fs.createWriteStream(filePath);
        doc.pipe(stream);

        doc.font('Helvetica-Bold').fontSize(24).fillColor('#1f4aa8').text('GateSync', 50, 48);
        doc.font('Helvetica').fontSize(11).fillColor('#4b5563').text('Invoice', 50, 78);

        doc.font('Helvetica-Bold').fontSize(12).fillColor('#111827').text(`Invoice #: ${safeValue(payload.invoice_number, `INV-${payload.id}`)}`, 380, 50, { width: 170, align: 'right' });
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`Status: ${safeValue(payload.status)}`, 380, 68, { width: 170, align: 'right' });
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`Invoice Date: ${formatDate(payload.invoice_date)}`, 380, 84, { width: 170, align: 'right' });
        doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(`Due Date: ${formatDate(payload.due_date)}`, 380, 98, { width: 170, align: 'right' });

        doc.moveTo(50, 125).lineTo(550, 125).strokeColor('#d1d5db').stroke();

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Society', 50, 142);
        doc.font('Helvetica').fontSize(10).fillColor('#374151').text(safeValue(payload.society_name), 50, 160);
        doc.text(safeValue(payload.society_address), 50, 174, { width: 240 });

        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Bill To', 320, 142);
        doc.font('Helvetica').fontSize(10).fillColor('#374151').text(safeValue(payload.resident_name, `Flat ${safeValue(payload.block_name)}-${safeValue(payload.flat_number)}`), 320, 160, { width: 230 });
        doc.text(`Flat: ${safeValue(payload.block_name)}-${safeValue(payload.flat_number)}`, 320, 174, { width: 230 });
        if (payload.resident_phone) {
            doc.text(`Phone: ${payload.resident_phone}`, 320, 188, { width: 230 });
        }

        let currentY = 228;
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#111827').text('Description', 50, currentY);
        doc.text('Amount', 430, currentY, { width: 120, align: 'right' });
        currentY += 14;
        doc.moveTo(50, currentY).lineTo(550, currentY).strokeColor('#e5e7eb').stroke();
        currentY += 10;

        const lineItems = Array.isArray(payload.line_items) && payload.line_items.length
            ? payload.line_items
            : [{ label: 'Maintenance Charges', amount: payload.subtotal_amount || payload.total_amount }];

        lineItems.forEach((item) => {
            if (currentY > 730) {
                doc.addPage();
                currentY = 70;
            }

            doc.font('Helvetica').fontSize(10).fillColor('#111827').text(safeValue(item.label), 50, currentY, { width: 360 });
            doc.text(formatCurrency(item.amount), 430, currentY, { width: 120, align: 'right' });
            currentY += 18;
        });

        currentY += 8;
        doc.moveTo(50, currentY).lineTo(550, currentY).strokeColor('#e5e7eb').stroke();
        currentY += 14;

        drawSummaryRow(doc, 'Subtotal', formatCurrency(payload.subtotal_amount), currentY);
        currentY += 18;
        drawSummaryRow(doc, 'Late Fee', formatCurrency(payload.penalty_amount), currentY);
        currentY += 18;
        drawSummaryRow(doc, 'Adjustments', `- ${formatCurrency(payload.adjustment_amount)}`, currentY);
        currentY += 18;
        drawSummaryRow(doc, 'Paid', `- ${formatCurrency(payload.paid_amount)}`, currentY);
        currentY += 18;
        drawSummaryRow(doc, 'Total Due', formatCurrency(payload.balance_amount), currentY, { bold: true });
        currentY += 24;

        if (payload.notes) {
            doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Notes', 50, currentY);
            currentY += 14;
            doc.font('Helvetica').fontSize(10).fillColor('#4b5563').text(payload.notes, 50, currentY, { width: 500 });
            currentY += 32;
        }

        doc.font('Helvetica').fontSize(9).fillColor('#6b7280').text(`Generated on ${formatDate(payload.generated_at || new Date().toISOString())}`, 50, Math.max(currentY, 760));

        doc.end();
        stream.on('finish', resolve);
        stream.on('error', reject);
        doc.on('error', reject);
    });

    return publicPath;
};

module.exports = {
    generateAndStoreInvoicePdf,
};
