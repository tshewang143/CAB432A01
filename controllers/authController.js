// controllers/authController.js (CJS)
const {
  SignUpCommand,
  ConfirmSignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
} = require("@aws-sdk/client-cognito-identity-provider");
const {
  cognito,
  COGNITO_CLIENT_ID,
  secretHash,
} = require("../utils/cognito");

// POST /api/auth/signup  { username, password, email }
async function signup(req, res) {
  try {
    const { username, password, email } = req.body || {};
    if (!username || !password || !email) {
      return res.status(400).json({ error: "username, password, email required" });
    }

    const cmd = new SignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: username,
      Password: password,
      SecretHash: secretHash(username),
      UserAttributes: [{ Name: "email", Value: email }],
    });

    const out = await cognito.send(cmd);
    // out.UserConfirmed could be false (pending email confirmation)
    res.status(201).json({ message: "Sign-up initiated", userSub: out.UserSub, userConfirmed: out.UserConfirmed });
  } catch (e) {
    console.error("signup error:", e);
    res.status(400).json({ error: e.message || "Sign-up failed" });
  }
}

// POST /api/auth/confirm  { username, code }
async function confirm(req, res) {
  try {
    const { username, code } = req.body || {};
    if (!username || !code) {
      return res.status(400).json({ error: "username and code required" });
    }

    const cmd = new ConfirmSignUpCommand({
      ClientId: COGNITO_CLIENT_ID,
      Username: username,
      ConfirmationCode: code,
      SecretHash: secretHash(username),
    });

    await cognito.send(cmd);
    res.json({ message: "Email confirmed" });
  } catch (e) {
    console.error("confirm error:", e);
    res.status(400).json({ error: e.message || "Confirm failed" });
  }
}

// POST /api/auth/login  { username, password }
async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: "username and password required" });
    }

    const cmd = new InitiateAuthCommand({
      AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: username,
        PASSWORD: password,
        ...(secretHash(username) ? { SECRET_HASH: secretHash(username) } : {}),
      },
    });

    const out = await cognito.send(cmd);
    const result = out.AuthenticationResult || {};
    // Return Cognito tokens; your frontend should store IdToken and send it in Authorization header
    res.json({
      message: "Login successful",
      idToken: result.IdToken,
      accessToken: result.AccessToken,
      refreshToken: result.RefreshToken,
      expiresIn: result.ExpiresIn,
      tokenType: result.TokenType,
    });
  } catch (e) {
    console.error("login error:", e);
    res.status(401).json({ error: e.message || "Login failed" });
  }
}

module.exports = { signup, confirm, login };
