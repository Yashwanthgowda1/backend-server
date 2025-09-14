require('dotenv').config();

const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();

// Debug: Check if environment variables are loaded
console.log('DATABASE_URL loaded:', process.env.DATABASE_URL ? 'YES' : 'NO');

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : { rejectUnauthorized: false }
});

// Initialize database tables
async function initializeDatabase_table() {
  const client = await pool.connect();
  
  try {
    // Create employees table
    await client.query(`
      CREATE TABLE IF NOT EXISTS employees (
        emp_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance_records(emp_id, date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_records(date)`);
    
  } catch (err) {
    console.error('Error initializing database:', err);
  } finally {
    client.release();
  }
}

// Initialize database on startup
initializeDatabase_table().catch(console.error);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Attendance Tracker API is running!',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get all employees
app.get('/employees', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM employees ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add or update employee
app.post('/employees', async (req, res) => {
  const { emp_id, name } = req.body;
  
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
    
    res.json({ 
      message: 'Employee saved successfully',
      emp_id: emp_id
    });
  } catch (err) {
    console.error('Error saving employee:', err);
    res.status(500).json({ error: err.message });
  }
});

// Add attendance record
app.post('/attendance', async (req, res) => {
  const { emp_id, emp_name, attendance_type, date } = req.body;
  
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
    
    res.json({ 
      message: 'Attendance record added successfully',
      id: result.rows[0].id
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving attendance:', err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get attendance records by employee ID
app.get('/attendance/:emp_id', async (req, res) => {
  const { emp_id } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT * FROM attendance_records 
      WHERE emp_id = $1 
      ORDER BY date DESC
    `, [emp_id]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching employee attendance:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get all attendance records with filters
app.get('/attendance', async (req, res) => {
  const { start_date, end_date, attendance_type } = req.query;
  
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
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching attendance records:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get attendance statistics
app.get('/stats', async (req, res) => {
  try {
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

    res.json(stats);
  } catch (err) {
    console.error('Error fetching stats:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete attendance record
app.delete('/attendance/:id', async (req, res) => {
  const { id } = req.params;
  
  try {
    const result = await pool.query('DELETE FROM attendance_records WHERE id = $1', [id]);
    
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Record not found' });
    } else {
      res.json({ message: 'Record deleted successfully' });
    }
  } catch (err) {
    console.error('Error deleting attendance record:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get attendance for a specific date range
app.get('/attendance-range/:emp_id/:start_date/:end_date', async (req, res) => {
  const { emp_id, start_date, end_date } = req.params;
  
  try {
    const result = await pool.query(`
      SELECT * FROM attendance_records 
      WHERE emp_id = $1 AND date BETWEEN $2 AND $3 
      ORDER BY date DESC
    `, [emp_id, start_date, end_date]);
    
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching attendance range:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    // Test database connection
    await pool.query('SELECT NOW()');
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: 'Connected'
    });
  } catch (err) {
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      database: 'Disconnected',
      error: err.message
    });
  }
});

// Export the Express app
module.exports = app;