const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const http = require('http');
const path = require('path');
const { initWebSocket } = require('./websocket/socket');

dotenv.config();
require('./config/db');

const app = express();
const server = http.createServer(app);

// Initialize WebSockets
initWebSocket(server);

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
const authRoutes = require('./routes/authRoutes');
const visitorRoutes = require('./routes/visitorRoutes');
const complaintsRoutes = require('./routes/complaintsRoutes');
const noticesRoutes = require('./routes/noticesRoutes');
const billingRoutes = require('./routes/billingRoutes');
const superadminRoutes = require('./routes/superadminRoutes');
const deliveryRoutes = require('./routes/deliveryRoutes');
const communicationRoutes = require('./routes/communicationRoutes');
const committeeRoutes = require('./routes/committeeRoutes');
const staffRoutes = require('./routes/staffRoutes');
const residentRoutes = require('./routes/residentRoutes');
const facilityRoutes = require('./routes/facilityRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const securityRoutes = require('./routes/securityRoutes');

app.use('/api/v1/superadmin', superadminRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/visitors', visitorRoutes);
app.use('/api/v1/complaints', complaintsRoutes);
app.use('/api/v1/notices', noticesRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/deliveries', deliveryRoutes);
app.use('/api/v1/communication', communicationRoutes);
app.use('/api/v1/committees', committeeRoutes);
app.use('/api/v1/staff', staffRoutes);
app.use('/api/v1/residents', residentRoutes);
app.use('/api/v1/facilities', facilityRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/security', securityRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'GatePulse API is running' });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
