require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const isProduction = process.env.NODE_ENV === 'production';
const jsonBodyLimit = process.env.JSON_BODY_LIMIT || (process.env.VERCEL ? '4mb' : '10mb');
let databaseConnectionPromise = null;

function parseAllowedOrigins() {
  const raw = process.env.FRONTEND_URL || 'http://localhost:8080';
  const origins = raw.split(',').map((s) => s.trim()).filter(Boolean);

  if (process.env.VERCEL_URL) {
    origins.push(`https://${process.env.VERCEL_URL}`);
  }

  return origins;
}

async function connectToDatabase() {
  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is required');
  }

  if (!databaseConnectionPromise) {
    databaseConnectionPromise = mongoose.connect(process.env.MONGODB_URI)
      .then(() => {
        console.log('MongoDB connected successfully');
        console.log('Database:', mongoose.connection.name);
        return mongoose.connection;
      })
      .catch((error) => {
        databaseConnectionPromise = null;
        throw error;
      });
  }

  return databaseConnectionPromise;
}

// Browser sends Origin; it must match exactly for cross-origin frontend deployments.
// Same-origin Vercel requests do not need CORS, but FRONTEND_URL supports separate domains.
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }

    const configured = parseAllowedOrigins();
    if (configured.includes(origin)) {
      return callback(null, true);
    }

    if (!isProduction) {
      try {
        const url = new URL(origin);
        const devPorts = new Set(['8080', '5173']);
        if (!devPorts.has(url.port)) {
          return callback(null, false);
        }
        const h = url.hostname.toLowerCase();
        const local =
          h === 'localhost' ||
          h === '127.0.0.1' ||
          h === '[::1]' ||
          h === '::1';
        const privateLan =
          /^192\.168\.\d{1,3}\.\d{1,3}$/.test(h) ||
          /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h) ||
          /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h);
        if (local || privateLan) {
          return callback(null, true);
        }
      } catch {
        return callback(null, false);
      }
    }

    return callback(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: jsonBodyLimit }));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Server is running',
    database:
      mongoose.connection.readyState === 1 ? 'connected' : 'not connected',
  });
});

app.use('/api', async (req, res, next) => {
  try {
    await connectToDatabase();
    next();
  } catch (error) {
    console.error('MongoDB connection error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Database connection failed',
    });
  }
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/violations', require('./routes/violations'));
app.use('/api/exams', require('./routes/exams'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/admin', require('./routes/admin'));

module.exports = app;
module.exports.connectToDatabase = connectToDatabase;
