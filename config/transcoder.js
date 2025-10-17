// config/transcoder.js (CJS) – robust S3 -> ffmpeg -> S3 streaming with timeout & logs
require("../config/env"); // <<< ensure env present

const { S3Client, GetObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { Upload } = require("@aws-sdk/lib-storage");
const { PassThrough } = require("stream");
const { spawn } = require("child_process");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const BUCKET = process.env.S3_BUCKET;
const s3 = new S3Client({ region: REGION });

function ffmpegArgs({ resolution, preset = "slow", crf = "20" }) {
  let vf;
  switch ((resolution || "720p").toLowerCase()) {
    case "1080p":
      vf = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2";
      break;
    case "480p":
      vf = "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2";
      break;
    default:
      vf = "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2";
  }

  return [
    "-hide_banner",
    "-loglevel", "error",
    "-y",
    "-i", "pipe:0",
    "-vf", vf,
    "-c:v", "libx264",
    "-preset", preset,
    "-crf", crf,
    "-c:a", "aac",
    "-movflags", "+frag_keyframe+empty_moov+faststart",
    "-f", "mp4",
    "pipe:1",
  ];
}

async function transcodeS3ToS3({
  inputKey,
  outputKey,
  resolution = "720p",
  preset = "slow",
  crf = "20",
  timeoutMs = Number(process.env.TRANSCODE_TIMEOUT_MS || 15 * 60 * 1000),
}) {
  if (!BUCKET) throw new Error("S3_BUCKET not set");
  if (!inputKey || !outputKey) throw new Error("inputKey/outputKey required");

  // Input stream
  const obj = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: inputKey }));
  const inputStream = obj.Body;

  // ffmpeg process
  const args = ffmpegArgs({ resolution, preset, crf });
  const ff = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });

  let stderr = "";
  ff.stderr.on("data", (d) => (stderr += d.toString()));

  inputStream.on("error", (e) => ff.stdin.destroy(e));
  inputStream.pipe(ff.stdin);

  // Output upload
  const outStream = new PassThrough();
  const uploader = new Upload({
    client: s3,
    params: {
      Bucket: BUCKET,
      Key: outputKey,
      Body: outStream,
      ContentType: "video/mp4",
    },
    queueSize: 3,
    leavePartsOnError: false,
  });

  ff.stdout.on("error", (e) => outStream.destroy(e));
  ff.stdout.pipe(outStream);

  // timeout
  let timedOut = false;
  const to = setTimeout(() => {
    timedOut = true;
    try { ff.kill("SIGKILL"); } catch {}
  }, timeoutMs);

  const exitPromise = new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => {
      clearTimeout(to);
      if (timedOut) return reject(new Error(`ffmpeg timeout after ${timeoutMs}ms`));
      if (code !== 0) return reject(new Error(`ffmpeg failed with code ${code}: ${stderr || "(no stderr)"}`));
      resolve();
    });
  });

  await Promise.all([exitPromise, uploader.done()]);
}

async function objectExists(bucket, key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (e) {
    if (e?.$metadata?.httpStatusCode === 404 || e.name === "NotFound") return false;
    throw e;
  }
}

module.exports = {
  transcodeS3ToS3,
  objectExists,
};
