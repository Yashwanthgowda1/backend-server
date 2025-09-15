require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const isDevelopment = process.env.NODE_ENV !== 'production';

// ===================
// IMPROVED CORS CONFIGURATION
// ===================

// Enhanced allowed origins with environment variable support
const allowedOrigins = [
  "http://localhost:5173", // Local Vite dev
  "http://localhost:3000", // Alternative local port
  "https://front-end-server-mz4as6cxr-yashwanths-projects-7a956bf7.vercel.app", // Your current frontend
  process.env.FRONTEND_URL, // Production frontend from env
  /https:\/\/.*\.vercel\.app$/ // Allow all Vercel deployments (temporary fix)
];

// Debug: Check if environment variables are loaded
console.log('=== ENVIRONMENT DEBUG ===');
console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');
console.log('Environment:', process.env.NODE_ENV);
console.log('Frontend URL:', process.env.FRONTEND_URL || 'Not set');
console.log('Allowed Origins:', allowedOrigins.filter(origin => origin && typeof origin === 'string'));
console.log('========================');

// ===================
// MIDDLEWARE SETUP
// ===================

// Enhanced CORS with better debugging
app.use(cors({
  origin: function (origin, callback) {
    console.log(`🔍 CORS Check - Origin: ${origin || 'No Origin'}`);
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      console.log('✅ CORS: Allowing request with no origin');
      return callback(null, true);
    }
    
    // Check if origin matches any allowed origins (including regex patterns)
    const isAllowed = allowedOrigins.some(allowedOrigin => {
      if (allowedOrigin instanceof RegExp) {
        const matches = allowedOrigin.test(origin);
        if (matches) console.log(`✅ CORS: Origin matched regex pattern`);
        return matches;
      }
      if (allowedOrigin === origin) {
        console.log(`✅ CORS: Origin matched exactly`);
        return true;
      }
      return false;
    });
    
    if (!isAllowed) {
      console.log(`❌ CORS: Origin blocked - ${origin}`);
      console.log(`📋 Allowed origins:`, allowedOrigins.filter(o => typeof o === 'string'));
      const msg = `The CORS policy for this site does not allow access from the specified Origin: ${origin}`;
      return callback(new Error(msg), false);
    }
    
    console.log(`✅ CORS: Origin allowed - ${origin}`);
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`${timestamp} - ${req.method} ${req.path} - Origin: ${req.headers.origin || 'No Origin'}`);
  next();
});

// ===================
// DATABASE SETUP
// ===================

// PostgreSQL Database setup with improved error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
  process.exit(-1);
});

// Initialize database tables with better error handling
async function initializeDatabase_table() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 Initializing database tables...');
    
    // Create employees table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        emp_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Employees table created/verified');

    // Create attendance_records table
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance_records (
        id SERIAL PRIMARY KEY,
        emp_id TEXT NOT NULL,
        emp_name TEXT NOT NULL,
        attendance_type TEXT NOT NULL,
        date DATE NOT NULL,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (emp_id) REFERENCES employees (emp_id),
        UNIQUE(emp_id, date)
      )
    `);
    console.log('✅ Attendance_records table created/verified');

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance_records(emp_id, date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date)`);
    console.log('✅ Database indexes created/verified');
    console.log('🎉 Database initialization complete!');
    
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Initialize database on startup
initializeDatabase_table().catch(console.error);

// ===================
// API ROUTES
// ===================

// Root endpoint with enhanced info
app.get('/', (req, res) => {
  res.json({ 
    message: 'Attendance Tracker API is running!',
    timestamp: new Date().toISOString(),
    environment: isDevelopment ? 'development' : 'production',
    version: '1.0.0',
    endpoints: {
      employees: '/api/employees',
      attendance: '/api/attendance',
      stats: '/api/stats',
      health: '/api/health'
    }
  });
});

// Get all employees
app.get('/api/employees', async (req, res) => {
  try {
    console.log('📋 Fetching all employees...');
    const result = await pool.query('SELECT * FROM employees ORDER BY name');
    console.log(`✅ Found ${result.rows.length} employees`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching employees:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add or update employee
app.post('/api/employees', async (req, res) => {
  const { emp_id, name } = req.body;
  console.log(`👤 Adding/updating employee: ${emp_id} - ${name}`);
  
  if (!emp_id || !name) {
    return res.status(400).json({ error: 'Employee ID and name are required' });
  }

  try {
    await pool.query(`
      INSERT INTO employees (emp_id, name, updated_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (emp_id) 
      DO UPDATE SET name = $2, updated_at = CURRENT_TIMESTAMP
    `, [emp_id, name]);
    
    console.log(`✅ Employee saved: ${emp_id}`);
    res.json({ 
      message: 'Employee saved successfully',
      emp_id: emp_id,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error saving employee:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Add attendance record
app.post('/api/attendance', async (req, res) => {
  const { emp_id, emp_name, attendance_type, date } = req.body;
  console.log(`📅 Adding attendance: ${emp_id} - ${attendance_type} on ${date}`);
  
  if (!emp_id || !emp_name || !attendance_type || !date) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // First, ensure employee exists
    await client.query(`
      INSERT INTO employees (emp_id, name, updated_at) 
      VALUES ($1, $2, CURRENT_TIMESTAMP)
      ON CONFLICT (emp_id) 
      DO UPDATE SET name = $2, updated_at = CURRENT_TIMESTAMP
    `, [emp_id, emp_name]);

    // Then add attendance record
    const result = await client.query(`
      INSERT INTO attendance_records 
      (emp_id, emp_name, attendance_type, date) 
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (emp_id, date) 
      DO UPDATE SET emp_name = $2, attendance_type = $3, timestamp = CURRENT_TIMESTAMP
      RETURNING id
    `, [emp_id, emp_name, attendance_type, date]);

    await client.query('COMMIT');
    console.log(`✅ Attendance record added: ID ${result.rows[0].id}`);
    
    res.json({ 
      message: 'Attendance record added successfully',
      id: result.rows[0].id,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error saving attendance:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  } finally {
    client.release();
  }
});

// Get attendance records by employee ID
app.get('/api/attendance/:emp_id', async (req, res) => {
  const { emp_id } = req.params;
  
  try {
    console.log(`📋 Fetching attendance for employee: ${emp_id}`);
    const result = await pool.query(`
      SELECT * FROM attendance_records 
      WHERE emp_id = $1 
      ORDER BY date DESC
    `, [emp_id]);
    
    console.log(`✅ Found ${result.rows.length} attendance records`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching employee attendance:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get all attendance records with filters
app.get('/api/attendance', async (req, res) => {
  const { start_date, end_date, attendance_type } = req.query;
  console.log(`📋 Fetching attendance records with filters:`, { start_date, end_date, attendance_type });
  
  let query = 'SELECT * FROM attendance_records WHERE 1=1';
  let params = [];
  let paramCount = 0;

  if (start_date) {
    paramCount++;
    query += ` AND date >= $${paramCount}`;
    params.push(start_date);
  }

  if (end_date) {
    paramCount++;
    query += ` AND date <= $${paramCount}`;
    params.push(end_date);
  }

  if (attendance_type) {
    paramCount++;
    query += ` AND attendance_type = $${paramCount}`;
    params.push(attendance_type);
  }

  query += ' ORDER BY date DESC, emp_id';

  try {
    const result = await pool.query(query, params);
    console.log(`✅ Found ${result.rows.length} attendance records`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching attendance records:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get attendance statistics
app.get('/api/stats', async (req, res) => {
  try {
    console.log('📊 Fetching statistics...');
    const stats = {};
    
    // Total employees
    const totalEmpResult = await pool.query('SELECT COUNT(*) as count FROM employees');
    stats.totalEmployees = parseInt(totalEmpResult.rows[0].count);

    // Total records
    const totalRecordsResult = await pool.query('SELECT COUNT(*) as count FROM attendance_records');
    stats.totalRecords = parseInt(totalRecordsResult.rows[0].count);

    // WFO records
    const wfoResult = await pool.query("SELECT COUNT(*) as count FROM attendance_records WHERE attendance_type = 'WFO'");
    stats.wfoRecords = parseInt(wfoResult.rows[0].count);

    // WFH records
    const wfhResult = await pool.query("SELECT COUNT(*) as count FROM attendance_records WHERE attendance_type = 'WFH'");
    stats.wfhRecords = parseInt(wfhResult.rows[0].count);

    // Attendance by type
    const attendanceByTypeResult = await pool.query(`
      SELECT attendance_type, COUNT(*) as count 
      FROM attendance_records 
      GROUP BY attendance_type 
      ORDER BY count DESC
    `);
    stats.attendanceByType = attendanceByTypeResult.rows;

    console.log('✅ Statistics calculated successfully');
    res.json({
      ...stats,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('❌ Error fetching stats:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Delete attendance record
app.delete('/api/attendance/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`🗑️ Deleting attendance record: ${id}`);
  
  try {
    const result = await pool.query('DELETE FROM attendance_records WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      console.log(`❌ Record not found: ${id}`);
      res.status(404).json({ error: 'Record not found' });
    } else {
      console.log(`✅ Record deleted: ${id}`);
      res.json({ 
        message: 'Record deleted successfully',
        timestamp: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error('❌ Error deleting attendance record:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Get attendance for a specific date range
app.get('/api/attendance-range/:emp_id/:start_date/:end_date', async (req, res) => {
  const { emp_id, start_date, end_date } = req.params;
  console.log(`📅 Fetching attendance range: ${emp_id} from ${start_date} to ${end_date}`);
  
  try {
    const result = await pool.query(`
      SELECT * FROM attendance_records 
      WHERE emp_id = $1 AND date BETWEEN $2 AND $3 
      ORDER BY date DESC
    `, [emp_id, start_date, end_date]);
    
    console.log(`✅ Found ${result.rows.length} records in range`);
    res.json(result.rows);
  } catch (err) {
    console.error('❌ Error fetching attendance range:', err);
    res.status(500).json({ 
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Health check endpoint with comprehensive info
app.get('/api/health', async (req, res) => {
  try {
    // Test database connection
    const dbResult = await pool.query('SELECT NOW() as current_time');
    const dbTime = dbResult.rows[0].current_time;
    
    console.log('✅ Health check passed');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      environment: isDevelopment ? 'development' : 'production',
      database: {
        status: 'Connected',
        current_time: dbTime
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        node_version: process.version
      }
    });
  } catch (err) {
    console.error('❌ Health check failed:', err);
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: {
        status: 'Disconnected',
        error: err.message
      }
    });
  }
});

// ===================
// ERROR HANDLING
// ===================

// Enhanced global error handler
app.use((err, req, res, next) => {
  console.error('💥 Unhandled error:', err);
  
  // CORS error
  if (err.message.includes('CORS policy')) {
    return res.status(403).json({ 
      error: 'CORS Error', 
      message: err.message,
      origin: req.headers.origin,
      timestamp: new Date().toISOString()
    });
  }
  
  // Database connection error
  if (err.code === 'ECONNREFUSED') {
    return res.status(503).json({ 
      error: 'Database connection failed',
      message: 'Unable to connect to database',
      timestamp: new Date().toISOString()
    });
  }
  
  res.status(500).json({ 
    error: 'Internal server error',
    timestamp: new Date().toISOString()
  });
});

// Enhanced 404 handler
app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    message: 'The requested endpoint does not exist',
    timestamp: new Date().toISOString(),
    availableEndpoints: [
      'GET /',
      'GET /api/health',
      'GET /api/employees',
      'POST /api/employees',
      'GET /api/attendance',
      'POST /api/attendance',
      'GET /api/stats'
    ]
  });
});

// ===================
// SERVER STARTUP
// ===================

// Start server only in development (Vercel handles production)
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log('🚀 ================================');
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`👥 Employees API: http://localhost:${PORT}/api/employees`);
    console.log('🚀 ================================');
  });
}


// ===================
// Export for Vercel
// ===================

// Export the Express app for Vercel
module.exports = app;