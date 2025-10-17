// config/env.js
const path = require("path");
const dotenv = require("dotenv");

// load .env from project root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(`[ENV] Missing required env var ${name}`);
  }
  return v;
}

// Export a getter and also validate critical ones here if you want
module.exports = {
  get env() {
    return {
      PORT: process.env.PORT || "3000",
      AWS_REGION: required("AWS_REGION"),
      S3_BUCKET: required("S3_BUCKET"),
      DDB_TABLE: required("DDB_TABLE"),
      DDB_HAS_GSI: String(process.env.DDB_HAS_GSI || "false").toLowerCase() === "true",
      JWT_SECRET: required("JWT_SECRET"),
      // Cognito can be validated where you use it
      COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID || "",
      COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID || "",
      COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET || "",
    };
  },
};
