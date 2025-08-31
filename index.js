const express = require('express');
const { initDatabase } = require('./config/database');
const jobRoutes = require('./routes/jobs');
const authRoutes = require('./routes/auth');
const path = require('path');

const app = express();

console.log('Starting server setup...');

// Initialize database
try {
  console.log('Initializing database...');
  initDatabase();
} catch (err) {
  console.error('Database initialization failed:', err);
  process.exit(1);
}

// Middleware
app.use(express.json());

// API routes
try {
  console.log('Registering auth routes at /api/auth from routes/auth.js');
  app.use('/api/auth', authRoutes);
  console.log('Registering job routes at /api/v1/jobs from routes/jobs.js');
  app.use('/api/v1/jobs', jobRoutes);
} catch (err) {
  console.error('Error registering routes:', err);
  process.exit(1);
}

// Static files
console.log('Setting up static file serving for public/');
try {
  app.use(express.static(path.join(__dirname, 'public')));
} catch (err) {
  console.error('Error setting up static middleware:', err);
  process.exit(1);
}

// Fallback for SPA (commented out to avoid path-to-regexp error)
// console.log('Setting up SPA fallback for unmatched routes');
// try {
//   app.get('/(.*)', (req, res) => {
//     console.log(`Serving index.html for unmatched route: ${req.originalUrl}`);
//     res.sendFile(path.join(__dirname, 'public', 'index.html'));
//   });
// } catch (err) {
//   console.error('Error setting up SPA fallback:', err);
//   process.exit(1);
// }

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

app.listen(3000, () => console.log('Server running on port 3000'));