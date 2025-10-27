// auth/secretHash.js
const crypto = require("crypto");

function computeSecretHash(username, clientId, clientSecret) {
  const hmac = crypto.createHmac("SHA256", clientSecret);
  hmac.update(username + clientId);
  return hmac.digest("base64");
}

module.exports = { computeSecretHash };
