const express = require('express');
const jwt = require('jsonwebtoken');
const router = express.Router();

// Use the same secret as in your middleware
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// 2 users types hardcoded with roles
const users = [
  { id: 1, username: 'client1', password: 'password', role: 'user' },
  { id: 2, username: 'admin', password: 'password', role: 'admin' }
];

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Use the consistent secret key
  const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });

  // Return both token and user information
  res.json({ 
    message: 'User has been Login successfully', 
    token,
    user: { 
      id: user.id, 
      username: user.username, 
      role: user.role 
    }
  });
});

module.exports = router;