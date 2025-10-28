const express = require("express");
const axios = require("axios");

const router = express.Router();

const USER_SERVICE_URL = process.env.USER_SERVICE_URL || "http://localhost:3001";

// Helper function to proxy requests to user service
async function proxyToUserService(req, res, path) {
  try {
    const response = await axios({
      method: req.method,
      url: `${USER_SERVICE_URL}${path}`,
      data: req.body,
      headers: {
        'Authorization': req.headers.authorization,
        'Content-Type': 'application/json'
      }
    });
    
    res.status(response.status).json(response.data);
  } catch (error) {
    if (error.response) {
      // Forward the error response from user service
      res.status(error.response.status).json(error.response.data);
    } else {
      console.error(`[auth-proxy] Error calling user service:`, error.message);
      res.status(500).json({ 
        success: false, 
        error: "User service unavailable" 
      });
    }
  }
}

// Proxy all auth routes to user service
router.post("/signup", (req, res) => proxyToUserService(req, res, "/auth/signup"));
router.post("/confirm", (req, res) => proxyToUserService(req, res, "/auth/confirm"));
router.post("/login", (req, res) => proxyToUserService(req, res, "/auth/login"));
router.post("/resend-code", (req, res) => proxyToUserService(req, res, "/auth/resend-code"));
router.post("/verify", (req, res) => proxyToUserService(req, res, "/auth/verify"));
router.get("/me", (req, res) => proxyToUserService(req, res, "/auth/me"));

module.exports = router;
