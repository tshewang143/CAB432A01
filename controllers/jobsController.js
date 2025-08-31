const { create, findByUser, findByIdAndUser, update, remove, updateStatus } = require('../models/Job');
const { processJob } = require('../utils/videoProcessor');
const fs = require('fs').promises;

async function createJob(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'Video file is required' });
  }

  const { format, resolution, title, description, watermark, contrast, saturation, brightness, analyze } = req.body;
  const userId = req.user.userId;
  const originalFilename = req.file.originalname;
  const filePath = req.file.path;

  if (!format || !resolution) {
    await fs.unlink(filePath).catch(err => console.error('Failed to clean up file:', err));
    return res.status(400).json({ error: 'Format and resolution are required' });
  }

  try {
    const contrastValue = parseFloat(contrast) || 1.0;
    const saturationValue = parseFloat(saturation) || 1.0;
    const brightnessValue = parseFloat(brightness) || 1.0;
    const analyzeValue = analyze === 'true';

    const jobId = await create(userId, originalFilename, title || null, description || null, filePath);

    res.status(202).json({
      message: 'Job created and queued for processing',
      jobId: jobId,
      status: 'queued',
      links: {
        self: `/api/v1/jobs/${jobId}`,
        status: `/api/v1/jobs/${jobId}/status`
      }
    });

    processJob(jobId, filePath, format, resolution, {
      watermark,
      contrast: contrastValue,
      saturation: saturationValue,
      brightness: brightnessValue,
      analyze: analyzeValue
    }).catch(async err => {
      console.error(`Error processing job ${jobId}:`, err);
      await updateStatus(jobId, 'failed', err.message).catch(updateErr => console.error('Failed to update job status:', updateErr));
    });
  } catch (error) {
    console.error('Error creating job:', error);
    await fs.unlink(filePath).catch(err => console.error('Failed to clean up file:', err));
    res.status(500).json({ error: 'Failed to create job', details: error.message });
  }
}

async function getJobs(req, res) {
  const userId = req.user.userId;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const status = req.query.status;
  const sortBy = req.query.sortBy || 'created_at';
  const sortOrder = req.query.sortOrder || 'DESC';
  
  try {
    const result = await findByUser(userId, page, limit, status, sortBy, sortOrder);
    
    const baseUrl = `${req.protocol}://${req.get('host')}/api/v1/jobs`;
    const totalPages = Math.ceil(result.pagination.total / limit);
    
    const links = {
      self: `${baseUrl}?page=${page}&limit=${limit}`,
      first: `${baseUrl}?page=1&limit=${limit}`,
      last: `${baseUrl}?page=${totalPages}&limit=${limit}`
    };
    
    if (page > 1) {
      links.prev = `${baseUrl}?page=${page - 1}&limit=${limit}`;
    }
    
    if (page < totalPages) {
      links.next = `${baseUrl}?page=${page + 1}&limit=${limit}`;
    }
    
    res.json({
      ...result,
      links
    });
  } catch (error) {
    console.error('Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs', details: error.message });
  }
}

async function getJob(req, res) {
  const jobId = req.params.id;
  const userId = req.user.userId;
  
  try {
    const job = await findByIdAndUser(jobId, userId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    res.json(job);
  } catch (error) {
    console.error('Error fetching job:', error);
    res.status(500).json({ error: 'Database error', details: error.message });
  }
}

async function updateJob(req, res) {
  const jobId = req.params.id;
  const userId = req.user.userId;
  const { title, description } = req.body;
  
  try {
    const job = await findByIdAndUser(jobId, userId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    if (job.status !== 'queued') {
      return res.status(400).json({ error: 'Can only update queued jobs' });
    }
    
    await update(jobId, title, description);
    
    res.json({ message: 'Job updated successfully' });
  } catch (error) {
    console.error('Error updating job:', error);
    res.status(500).json({ error: 'Failed to update job', details: error.message });
  }
}

async function deleteJob(req, res) {
  const jobId = req.params.id;
  const userId = req.user.userId;
  
  try {
    const job = await findByIdAndUser(jobId, userId);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }
    
    await remove(jobId);
    
    if (job.file_path && await fs.access(job.file_path).catch(() => false)) {
      await fs.unlink(job.file_path).catch(err => console.error('Failed to delete file:', err));
    }
    
    res.json({ message: 'Job deleted successfully' });
  } catch (error) {
    console.error('Error deleting job:', error);
    res.status(500).json({ error: 'Failed to delete job', details: error.message });
  }
}

module.exports = {
  createJob,
  getJobs,
  getJob,
  updateJob,
  deleteJob
};