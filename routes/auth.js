// routes/auth.js (CJS) — Cognito with optional SECRET_HASH support
const express = require("express");
const crypto = require("crypto");
const {
  CognitoIdentityProviderClient,
  InitiateAuthCommand,
  SignUpCommand,
  ConfirmSignUpCommand,
  ResendConfirmationCodeCommand
} = require("@aws-sdk/client-cognito-identity-provider");

const router = express.Router();

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const COGNITO_CLIENT_ID = process.env.COGNITO_CLIENT_ID;
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || null;
const COGNITO_USER_POOL_ID = process.env.COGNITO_USER_POOL_ID;

// Guard: client id is mandatory
if (!COGNITO_CLIENT_ID) {
  console.warn("[auth] COGNITO_CLIENT_ID is not set; routes will fail.");
}

const cognitoClient = new CognitoIdentityProviderClient({ region: REGION });

// Compute SECRET_HASH only if client has a secret
function computeSecretHash(username) {
  if (!COGNITO_CLIENT_SECRET) return undefined;
  const hmac = crypto.createHmac("SHA256", COGNITO_CLIENT_SECRET);
  hmac.update(String(username) + String(COGNITO_CLIENT_ID));
  return hmac.digest("base64");
}

// --------------------------- SIGN UP ---------------------------
router.post("/signup", async (req, res) => {
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

    res.json({
      success: true,
      message: "User registered successfully. Please check your email for verification code.",
      userConfirmed: response.UserConfirmed,
      userSub: response.UserSub
    });
  } catch (error) {
    console.error("Cognito signup error:", error);
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
router.post("/confirm", async (req, res) => {
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

    res.json({ success: true, message: "Email confirmed successfully. You can now login." });
  } catch (error) {
    console.error("Cognito confirm error:", error);
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
router.post("/resend-code", async (req, res) => {
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

    res.json({ success: true, message: "Verification code sent successfully" });
  } catch (error) {
    console.error("Cognito resend code error:", error);
    res.status(500).json({ success: false, error: "Failed to resend code: " + error.message });
  }
});

// ----------------------------- LOGIN -----------------------------
router.post("/login", async (req, res) => {
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
      return res.json({
        success: true,
        idToken: IdToken, // frontend expects idToken at root
        token: IdToken,   // backward compatibility
        user: { username }
      });
    }

    res.status(401).json({ success: false, error: "Authentication failed" });
  } catch (error) {
    console.error("Cognito login error:", error);
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
router.post("/verify", async (req, res) => {
  try {
    const { token } = req.body || {};
    if (!token) {
      return res.status(400).json({ success: false, error: "Token required" });
    }

    const { CognitoJwtVerifier } = require("aws-jwt-verify");
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
router.get("/me", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ success: false, error: "No authorization header" });
  }

  const token = authHeader.replace("Bearer ", "");
  try {
    const { CognitoJwtVerifier } = require("aws-jwt-verify");
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

module.exports = router;
