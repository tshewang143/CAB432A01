// load-test.js (Node 18, CommonJS)
// Supports JWT or cookie-session auth; uses dynamic import for axios-cookiejar-support (ESM-only)

const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axiosBase = require('axios');
const { CookieJar } = require('tough-cookie');

// ------------------ CLI / ENV config ------------------
// Usage: node load-test.js <baseURL> <concurrency> <durationSec>
const baseURL = process.argv[2] || process.env.BASE_URL || 'http://localhost:3000';
const concurrency = parseInt(process.argv[3] || process.env.CONCURRENCY || '3', 10);
const durationSec = parseInt(process.argv[4] || process.env.DURATION || '300', 10);

// Auth & routes (override via env as needed)
const AUTH_TYPE   = (process.env.AUTH_TYPE || 'jwt').toLowerCase();      // 'jwt' or 'cookie'
const LOGIN_ROUTE = process.env.LOGIN_ROUTE || '/api/auth/login';        // e.g. '/api/v1/auth/login'
const USER_FIELD  = process.env.USER_FIELD  || 'username';               // e.g. 'email'
const PASS_FIELD  = process.env.PASS_FIELD  || 'password';
const USERNAME    = process.env.USERNAME    || 'user1';
const PASSWORD    = process.env.PASSWORD    || 'pass1';
const TOKEN_FIELD = process.env.TOKEN_FIELD || 'token';                  // e.g. 'accessToken'
const JOBS_ROUTE  = process.env.JOBS_ROUTE  || '/api/v1/jobs';

const TEST_VIDEO  = process.env.TEST_VIDEO  || './test-video.mp4';       // set to a 50–100MB file for heavier load
const VIDEO_FIELD = process.env.VIDEO_FIELD || 'video';                  // form field name your API expects

// Job form fields (tweak/extend for your API)
const JOB_FIELDS = {
  format: process.env.JOB_FORMAT || 'mp4',
  resolution: process.env.JOB_RESOLUTION || '4k',
  enableCustomProcessing: process.env.JOB_ENABLE_CUSTOM || 'true',
  enableFractalEffects: process.env.JOB_ENABLE_FRACTAL || 'true',
};

// ------------- HTTP client (set inside start() via dynamic import) -------------
const jar = new CookieJar();
let http = null;        // axios client after wrapper()
let authToken = null;   // for JWT auth

// ------------- Counters -------------
let completed = 0;
let failed = 0;

// Ensure a test file exists; create a small dummy if missing
function ensureTestFile(p = TEST_VIDEO, sizeBytes = 1024 * 1024) {
  if (fs.existsSync(p)) return p;
  fs.writeFileSync(p, Buffer.alloc(sizeBytes)); // 1MB zero file
  return p;
}

async function login() {
  const payload = { [USER_FIELD]: USERNAME, [PASS_FIELD]: PASSWORD };
  try {
    const res = await http.post(LOGIN_ROUTE, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (AUTH_TYPE === 'jwt') {
      // Try common token property names
      authToken =
        res.data?.[TOKEN_FIELD] ??
        res.data?.token ??
        res.data?.accessToken ??
        null;

      if (!authToken) {
        console.error('Login succeeded but no token found in response. Keys:', Object.keys(res.data || {}));
        process.exit(1);
      }
      console.log('Login successful (JWT).');
    } else {
      // Cookie-based session; cookie stored in jar automatically
      console.log('Login successful (cookie session).');
    }
  } catch (err) {
    if (err.response) {
      console.error(`Login failed: ${err.response.status}`, err.response.data);
    } else {
      console.error('Login failed:', err.message);
    }
    process.exit(1);
  }
}

async function createJob() {
  const videoPath = ensureTestFile();
  const form = new FormData();
  form.append(VIDEO_FIELD, fs.createReadStream(videoPath), path.basename(videoPath));
  for (const [k, v] of Object.entries(JOB_FIELDS)) form.append(k, v);

  const headers = form.getHeaders();
  if (AUTH_TYPE === 'jwt' && authToken) headers['Authorization'] = `Bearer ${authToken}`;

  try {
    await http.post(JOBS_ROUTE, form, { headers });
    completed++;
    if (completed % 10 === 0) console.log(`Completed: ${completed}`);
  } catch (err) {
    failed++;
    if (err.response) {
      console.error(`Job failed [${err.response.status}]:`, err.response.data);
    } else {
      console.error('Job failed:', err.message);
    }
  }
}

// Worker-based concurrency: each worker loops until end time
async function worker(endTimeMs) {
  while (Date.now() < endTimeMs) {
    await createJob();
  }
}

function printResults() {
  const rps = completed / durationSec;
  console.log('\n=== Load Test Results ===');
  console.log(`Base URL: ${baseURL}`);
  console.log(`Duration: ${durationSec}s`);
  console.log(`Concurrency: ${concurrency}`);
  console.log(`Completed: ${completed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Approx RPS: ${rps.toFixed(2)}`);
}

async function start() {
  // Dynamically import ESM module 'axios-cookiejar-support'
  const mod = await import('axios-cookiejar-support');
  const wrapper =
    mod.wrapper ||
    (mod.default && (mod.default.wrapper || mod.default)) || // safety for different export shapes
    null;

  if (typeof wrapper !== 'function') {
    console.error('Unable to load axios-cookiejar-support.wrapper');
    process.exit(1);
  }

  // Build axios client with cookie jar support
  http = wrapper(
    axiosBase.create({
      baseURL,
      jar,
      withCredentials: true,
      timeout: 300000,            // 5 min (uploads/transcodes can be slow)
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    })
  );

  console.log(`Starting load against: ${baseURL}`);
  console.log(`concurrency=${concurrency}, duration=${durationSec}s`);
  await login();

  const endTime = Date.now() + durationSec * 1000;
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker(endTime));
  await Promise.all(workers);

  printResults();
}

// Graceful Ctrl+C
process.on('SIGINT', () => {
  console.log('\nInterrupted.');
  printResults();
  process.exit(0);
});

start().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
