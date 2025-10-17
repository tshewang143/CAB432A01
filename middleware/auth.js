// middleware/auth.js (CJS) - verify Cognito IdToken
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;
const CLIENT_ID = process.env.COGNITO_CLIENT_ID;

const idVerifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: "id",      // we’ll require IdToken for app auth
  clientId: CLIENT_ID,
});

async function authenticateToken(req, res, next) {
  try {
    const h = req.headers.authorization || req.headers.Authorization || "";
    const token = h.startsWith("Bearer ") ? h.slice(7) : h;
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });

    const payload = await idVerifier.verify(token);
    // payload contains Cognito claims like sub, email, cognito:username, etc.
    // Attach a small user object for your app
    req.user = {
      userId: payload.sub,
      username: payload["cognito:username"] || payload["username"] || payload["email"],
      email: payload.email,
    };
    next();
  } catch (e) {
    console.error("JWT verify error:", e.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

module.exports = authenticateToken;
