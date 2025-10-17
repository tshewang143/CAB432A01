// routes/auth.js (CJS)
const express = require("express");
const { signup, confirm, login } = require("../controllers/authController");
const router = express.Router();

// Public endpoints
router.post("/signup", signup);
router.post("/confirm", confirm);
router.post("/login", login);

module.exports = router;
