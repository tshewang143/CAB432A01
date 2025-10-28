require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand
} = require("@aws-sdk/client-cognito-identity-provider");
const { CognitoJwtVerifier } = require("aws-jwt-verify");

const app = express();
const PORT = process.env.USER_SERVICE_PORT || 3001;

// Middleware
app.use(express.json());

// Cognito configuration
const REGION = process.env.AWS_REGION || "ap-southeast-2";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || null;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

// Compute SECRET_HASH only if client has a secret
function computeSecretHash(username) {
  if (!COGNITO_CLIENT_SECRET) return undefined;
  const hmac = crypto.createHmac("SHA256", COGNITO_CLIENT_SECRET);
  hmac.update(String(username) + String(COGNITO_CLIENT_ID));
  return hmac.digest("base64");
}

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ 
    status: "healthy", 
    service: "user-service",
    timestamp: new Date().toISOString()
  });
});

// Service info endpoint
app.get("/", (req, res) => {
  res.json({
    service: "User Authentication Service",
    version: "1.0.0",
    endpoints: [
      "POST /auth/signup",
      "POST /auth/confirm", 
      "POST /auth/login",
      "POST /auth/resend-code",
      "POST /auth/verify",
      "GET /auth/me"
    ]
  });
});

// --------------------------- SIGN UP ---------------------------
app.post("/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    if (!username || !email || !password) {
      return res.status(400).json({ success: false, error: "Username, email and password required" });
    }

    const params = {
      ClientId: COGNITO_CLIENT_ID,
      Username: username,
      Password: password,
      UserAttributes: [{ Name: "email", Value: email }]
    };

    // Add SecretHash when client has secret
    const sh = computeSecretHash(username);
    if (sh) params.SecretHash = sh;

    const command = new SignUpCommand(params);
    const response = await cognitoClient.send(command);

    console.log(`[user-service] User registered: ${username}`);
    
    res.json({
      success: true,
      message: "User registered successfully. Please check your email for verification code.",
      userConfirmed: response.UserConfirmed,
      userSub: response.UserSub
    });
  } catch (error) {
    console.error("[user-service] Cognito signup error:", error);
    if (error.name === "UsernameExistsException") {
      res.status(400).json({ success: false, error: "Username already exists" });
    } else if (error.name === "InvalidPasswordException") {
      res.status(400).json({ success: false, error: "Password does not meet requirements" });
    } else if (error.name === "InvalidParameterException") {
      res.status(400).json({ success: false, error: "Invalid email format" });
    } else {
      res.status(500).json({ success: false, error: "Signup failed: " + error.message });
    }
  }
});

// ------------------------ CONFIRM SIGN UP ------------------------
app.post("/auth/confirm", async (req, res) => {
  try {
    const { username, code } = req.body || {};
    if (!username || !code) {
      return res.status(400).json({ success: false, error: "Username and confirmation code required" });
    }

    const params = {
      ClientId: COGNITO_CLIENT_ID,
      Username: username,
      ConfirmationCode: code
    };

    const sh = computeSecretHash(username);
    if (sh) params.SecretHash = sh;

    const command = new ConfirmSignUpCommand(params);
    await cognitoClient.send(command);

    console.log(`[user-service] User confirmed: ${username}`);
    
    res.json({ success: true, message: "Email confirmed successfully. You can now login." });
  } catch (error) {
    console.error("[user-service] Cognito confirm error:", error);
    if (error.name === "CodeMismatchException") {
      res.status(400).json({ success: false, error: "Invalid verification code" });
    } else if (error.name === "ExpiredCodeException") {
      res.status(400).json({ success: false, error: "Verification code has expired" });
    } else if (error.name === "UserNotFoundException") {
      res.status(400).json({ success: false, error: "User not found" });
    } else {
      res.status(500).json({ success: false, error: "Confirmation failed: " + error.message });
    }
  }
});

// ---------------------- RESEND CONFIRM CODE ----------------------
app.post("/auth/resend-code", async (req, res) => {
  try {
    const { username } = req.body || {};
    if (!username) {
      return res.status(400).json({ success: false, error: "Username required" });
    }

    const params = {
      ClientId: COGNITO_CLIENT_ID,
      Username: username
    };

    const sh = computeSecretHash(username);
    if (sh) params.SecretHash = sh;

    const command = new ResendConfirmationCodeCommand(params);
    await cognitoClient.send(command);

    console.log(`[user-service] Code resent: ${username}`);
    
    res.json({ success: true, message: "Verification code sent successfully" });
  } catch (error) {
    console.error("[user-service] Cognito resend code error:", error);
    res.status(500).json({ success: false, error: "Failed to resend code: " + error.message });
  }
});

// ----------------------------- LOGIN -----------------------------
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password required" });
    }

    // Ensure your App Client allows USER_PASSWORD_AUTH
    const params = {
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password
      }
    };

    const sh = computeSecretHash(username);
    if (sh) params.AuthParameters.SECRET_HASH = sh;

    const command = new InitiateAuthCommand(params);
    const response = await cognitoClient.send(command);

    if (response.AuthenticationResult) {
      const { IdToken } = response.AuthenticationResult;
      
      console.log(`[user-service] User logged in: ${username}`);
      
      return res.json({
        success: true,
        idToken: IdToken,
        token: IdToken,
        user: { 
          username,
          userId: response.AuthenticationResult.IdToken ? 
            JSON.parse(Buffer.from(response.AuthenticationResult.IdToken.split('.')[1], 'base64').toString()).sub : null
        }
      });
    }

    res.status(401).json({ success: false, error: "Authentication failed" });
  } catch (error) {
    console.error("[user-service] Cognito login error:", error);
    if (error.name === "NotAuthorizedException") {
      res.status(401).json({ success: false, error: "Invalid username or password" });
    } else if (error.name === "UserNotFoundException") {
      res.status(401).json({ success: false, error: "User not found" });
    } else if (error.name === "UserNotConfirmedException") {
      res.status(401).json({ success: false, error: "User not confirmed. Please check your email for verification code." });
    } else {
      res.status(500).json({ success: false, error: "Login failed: " + error.message });
    }
  }
});

// ----------------------------- VERIFY -----------------------------
app.post("/auth/verify", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: "Token required" });
    }

    const verifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: COGNITO_CLIENT_ID
    });

    const payload = await verifier.verify(token);
    
    res.json({
      success: true,
      valid: true,
      user: {
        userId: payload.sub,
        username: payload["cognito:username"] || payload.username,
        email: payload.email
      }
    });
  } catch (error) {
    res.json({ success: false, valid: false, error: error.message });
  }
});

// ------------------------------- ME -------------------------------
app.get("/auth/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: "No authorization header" });
  }

  const token = authHeader.replace("Bearer ", "");
  try {
    const verifier = CognitoJwtVerifier.create({
      userPoolId: COGNITO_USER_POOL_ID,
      tokenUse: "id",
      clientId: COGNITO_CLIENT_ID
    });

    const payload = await verifier.verify(token);
    
    res.json({
      success: true,
      user: {
        userId: payload.sub,
        username: payload["cognito:username"] || payload.username,
        email: payload.email,
        groups: payload["cognito:groups"] || []
      }
    });
  } catch (error) {
    res.status(401).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 User Service running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Service info: http://localhost:${PORT}/`);
});

module.exports = app;
