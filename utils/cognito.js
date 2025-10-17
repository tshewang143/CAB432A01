// utils/cognito.js (CJS)
const { CognitoIdentityProviderClient } = require("@aws-sdk/client-cognito-identity-provider");
const crypto = require("crypto");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET;

const cognito = new CognitoIdentityProviderClient({ region: REGION });

function secretHash(username) {
  // Only needed when the app client has a secret
  if (!COGNITO_CLIENT_SECRET) return undefined;
  const hasher = crypto.createHmac("sha256", COGNITO_CLIENT_SECRET);
  hasher.update(`${username}${COGNITO_CLIENT_ID}`);
  return hasher.digest("base64");
}

module.exports = {
  cognito,
  REGION,
  COGNITO_CLIENT_ID,
  COGNITO_CLIENT_SECRET,
  secretHash,
};
