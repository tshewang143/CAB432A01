const express = require('express');
const authenticateToken = require('../middleware/auth');
const upload = require('../config/multer');
const { createJob, getJobs, getJob, updateJob, deleteJob } = require('../controllers/jobsController');

const router = express.Router();

// Add API versioning
router.use('/v1', router);

// Enhanced jobs routes with filtering, sorting, and pagination
router.get('/', authenticateToken, getJobs);
router.get('/:id', authenticateToken, getJob);
router.post('/', authenticateToken, upload.single('video'), createJob);
router.put('/:id', authenticateToken, updateJob);
router.delete('/:id', authenticateToken, deleteJob);

module.exports = router;