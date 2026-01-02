const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const path = require('path');
const connectDB = require('./db/connection');

// Load env vars
dotenv.config();

// Connect to database
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/branches', require('./routes/branchRoutes'));
app.use('/api/companies', require('./routes/companyRoutes'));
console.log('Company routes registered at /api/companies');
app.use('/api/trips', require('./routes/tripRoutes'));
app.use('/api/ledger', require('./routes/ledgerRoutes'));
app.use('/api/disputes', require('./routes/disputeRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/audit-logs', require('./routes/auditLogRoutes'));
app.use('/api/search', require('./routes/searchRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'TMS Backend API is running' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    message: err.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

