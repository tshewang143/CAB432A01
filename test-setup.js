// test-setup.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Test JWT functionality
console.log('Testing JWT functionality...');

// Create a test token
const testPayload = { userId: 1, username: 'user1' };
const testToken = jwt.sign(testPayload, JWT_SECRET, { expiresIn: '1h' });
console.log('Generated test token:', testToken);

// Verify the test token
jwt.verify(testToken, JWT_SECRET, (err, decoded) => {
  if (err) {
    console.log('JWT verification failed:', err.message);
  } else {
    console.log('JWT verification successful:', decoded);
  }
});

// Test database connection
const { getDb, initDatabase } = require('./config/database');
initDatabase();

// Test a simple database query
const db = getDb();
db.get('SELECT 1 as test', (err, row) => {
  if (err) {
    console.log('Database test failed:', err.message);
  } else {
    console.log('Database test successful:', row);
  }
});