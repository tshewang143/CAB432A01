const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

function authenticateToken(req, res, next) {
  console.log('=== AUTH MIDDLEWARE TRIGGERED ===');
  
  // Check for authorization header in different cases
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  console.log('Authorization header:', authHeader);
  
  if (!authHeader) {
    console.log('No authorization header found');
    return res.status(401).json({ error: 'Access token required' });
  }
  
  // Extract token, handling various formats
  let token;
  
  // Case 1: Standard "Bearer <token>" format
  if (authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7); // Remove "Bearer " prefix
  } 
  // Case 2: "Bearer<token>" format (no space)
  else if (authHeader.startsWith('Bearer')) {
    token = authHeader.substring(6); // Remove "Bearer" prefix
  }
  // Case 3: Just the token without "Bearer" prefix
  else {
    token = authHeader;
  }
  
  // Remove any angle brackets if present
  if (token.startsWith('<') && token.endsWith('>')) {
    token = token.substring(1, token.length - 1);
  }
  
  console.log('Extracted token:', token);
  
  if (!token) {
    console.log('No token found after extraction');
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.log('Token verification failed:', err.message);
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    console.log('Token verified successfully for user:', user);
    req.user = user;
    next();
  });
}

module.exports = authenticateToken;