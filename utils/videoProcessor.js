const { exec } = require('child_process');
const { updateStatus } = require('../models/Job');
const fs = require('fs').promises;
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);

async function processJob(jobId, inputPath, format = 'mp4', resolution = '720p', options = {}) {
  try {
    await updateStatus(jobId, 'processing');
    
    const outputDir = 'transcoded';
    await fs.mkdir(outputDir, { recursive: true });
    
    const outputFilename = `transcoded-${jobId}-${Date.now()}.${format}`;
    const outputPath = path.join(outputDir, outputFilename);
    
    let videoFilters = [];
    
    if (resolution === '720p') {
      videoFilters.push('scale=1280:720:force_original_aspect_ratio=decrease');
      videoFilters.push('pad=1280:720:(ow-iw)/2:(oh-ih)/2');
    } else if (resolution === '1080p') {
      videoFilters.push('scale=1920:1080:force_original_aspect_ratio=decrease');
      videoFilters.push('pad=1920:1080:(ow-iw)/2:(oh-ih)/2');
    } else if (resolution === '480p') {
      videoFilters.push('scale=854:480:force_original_aspect_ratio=decrease');
      videoFilters.push('pad=854:480:(ow-iw)/2:(oh-ih)/2');
    } else {
      videoFilters.push('scale=1280:720:force_original_aspect_ratio=decrease');
      videoFilters.push('pad=1280:720:(ow-iw)/2:(oh-ih)/2');
    }
    
    if (options.watermark) {
      videoFilters.push(`movie=${options.watermark} [watermark]; [in][watermark] overlay=10:10 [out]`);
    }
    
    if (options.contrast) {
      videoFilters.push(`eq=contrast=${options.contrast}`);
    }
    
    if (options.saturation) {
      videoFilters.push(`eq=saturation=${options.saturation}`);
    }
    
    if (options.brightness) {
      videoFilters.push(`eq=brightness=${options.brightness}`);
    }
    
    if (options.analyze) {
      videoFilters.push('select=gt(scene\\,0.4),metadata=print');
    }
    
    let ffmpegCommand = `ffmpeg -i "${inputPath}"`;
    
    if (videoFilters.length > 0) {
      ffmpegCommand += ` -vf "${videoFilters.join(', ')}"`;
    }
    
    ffmpegCommand += ` -c:v libx264 -preset slower -crf 18 -c:a aac -b:a 192k "${outputPath}"`;
    
    console.log(`Executing custom FFmpeg command: ${ffmpegCommand}`);
    
    await execPromise(ffmpegCommand);
    
    if (options.analyze) {
      await analyzeVideo(outputPath, jobId);
    } else {
      await updateStatus(jobId, 'completed');
      console.log(`Job ${jobId} completed successfully`);
    }
  } catch (error) {
    console.error(`Transcoding error for job ${jobId}:`, error);
    await updateStatus(jobId, 'failed', error.message);
    throw error;
  }
}

async function analyzeVideo(videoPath, jobId) {
  try {
    console.log(`Analyzing video for job ${jobId}`);
    
    const ffprobeCommand = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    
    const { stdout } = await execPromise(ffprobeCommand);
    
    const videoInfo = JSON.parse(stdout);
    console.log(`Video analysis complete for job ${jobId}:`, {
      duration: videoInfo.format.duration,
      size: videoInfo.format.size,
      bit_rate: videoInfo.format.bit_rate,
      video_streams: videoInfo.streams.filter(s => s.codec_type === 'video').length,
      audio_streams: videoInfo.streams.filter(s => s.codec_type === 'audio').length
    });
    
    await updateStatus(jobId, 'completed');
    console.log(`Job ${jobId} completed successfully with analysis`);
  } catch (error) {
    console.error(`Analysis error for job ${jobId}:`, error);
    await updateStatus(jobId, 'completed');
    throw error;
  }
}

module.exports = {
  processJob
};