// middleware/authSSE.js
const authenticateToken = require("./auth"); // your existing middleware

// Wrap the existing auth to support ?token=... for SSE
module.exports = function authSSE(req, res, next) {
  // If there's an Authorization header, just use the normal flow
  if (req.headers.authorization) return authenticateToken(req, res, next);

  // Else accept token via querystring
  const t = req.query.token;
  if (t) {
    req.headers.authorization = `Bearer ${t}`;
    return authenticateToken(req, res, next);
  }
  return res.status(401).json({ error: "Missing token" });
};
