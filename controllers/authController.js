const jwt = require('jsonwebtoken');
const { findByCredentials } = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function login(req, res) {
  const { username, password } = req.body;
  
  console.log('Handling POST /api/auth/login for username:', username);
  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = findByCredentials(username, password);
  
  if (!user) {
    console.log('Invalid credentials for username:', username);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username }, 
    JWT_SECRET, 
    { expiresIn: '1h' }
  );
  
  console.log('Generated token for user:', user.username, 'Token:', token);
  res.json({ 
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
}

module.exports = {
  login
};