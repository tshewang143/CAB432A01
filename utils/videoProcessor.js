// utils/videoProcessor.js (CJS)
require("../config/env"); // load .env early if you use it to inject AWS_*

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const BUCKET = process.env.S3_BUCKET;

if (!BUCKET) {
  console.error("[videoProcessor] S3_BUCKET is not set!");
}

const s3 = new S3Client({ region: REGION });

// Direct server-side PUT (when proxying uploads through Node)
async function s3Put(Key, Body, ContentType) {
  return s3.send(new PutObjectCommand({ Bucket: BUCKET, Key, Body, ContentType }));
}

// Pre-signed URL for browser DOWNLOAD
async function presignDownload(Key, seconds = 600) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key });
  return getSignedUrl(s3, cmd, { expiresIn: seconds });
}

// HEAD to verify object exists
async function headObject(Key) {
  await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key }));
}

// NEW: Pre-signed URL for browser UPLOAD (PUT direct to S3)
async function presignUpload(Key, ContentType, seconds = 600) {
  const cmd = new PutObjectCommand({ Bucket: BUCKET, Key, ContentType });
  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: seconds });
  return { uploadUrl, bucket: BUCKET, key: Key };
}

module.exports = {
  BUCKET,
  s3Put,
  presignDownload,
  headObject,
  presignUpload, // ← use this to let the client upload directly to S3
};

