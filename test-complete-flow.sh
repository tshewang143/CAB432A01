#!/bin/bash

cd /home/ubuntu/CAB432A01

echo "🎬 Testing Complete Transcoding Pipeline"

# Generate JWT token using the correct secret from .env
JWT_TOKEN=$(node -e "
require('dotenv').config();
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  { userId: 1, username: 'client1' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);
console.log(token);
")

echo "✓ JWT Token generated: ${JWT_TOKEN:0:20}..."

# Create test video
echo "Creating test video..."
ffmpeg -f lavfi -i testsrc=duration=5:size=640x360:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=5 \
  -c:v libx264 -preset fast \
  -c:a aac \
  /tmp/test_flow.mp4 -y -hide_banner -loglevel error

echo "✓ Test video created"

# Get presigned URL
echo "Getting presigned URL..."
RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/jobs/presign-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d '{"filename": "test_flow.mp4", "contentType": "video/mp4"}')

echo "API Response: $RESPONSE"

UPLOAD_URL=$(echo "$RESPONSE" | jq -r '.uploadUrl')
VIDEO_ID=$(echo "$RESPONSE" | jq -r '.videoId')
RAW_KEY=$(echo "$RESPONSE" | jq -r '.rawKey')

echo "✓ Presigned URL obtained"
echo "  - Video ID: $VIDEO_ID"
echo "  - Raw Key: $RAW_KEY"

# Upload to S3
echo "Uploading to S3..."
curl -s -X PUT "$UPLOAD_URL" \
  -H "Content-Type: video/mp4" \
  --upload-file /tmp/test_flow.mp4

echo "✓ File uploaded to S3"

# Start transcode job
echo "Starting transcode job..."
JOB_RESPONSE=$(curl -s -X POST http://localhost:3000/api/v1/jobs/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -d "{
    \"videoId\": \"$VIDEO_ID\",
    \"rawKey\": \"$RAW_KEY\",
    \"title\": \"Flow Test Video\",
    \"format\": \"mp4\",
    \"resolution\": \"720p\"
  }")

echo "Job start response: $JOB_RESPONSE"

echo "✓ Transcode job started"

echo ""
echo "📊 Monitoring progress..."
echo "Video ID: $VIDEO_ID"
echo "Raw Key: $RAW_KEY"
echo ""
echo "Run these commands to monitor:"
echo "1. Worker logs: tail -f worker.log"
echo "2. Queue status: aws sqs get-queue-attributes --queue-url https://sqs.ap-southeast-2.amazonaws.com/901444280953/n11761211-assessment --attribute-names ApproximateNumberOfMessages"
echo "3. Job status: curl -s -H 'Authorization: Bearer $JWT_TOKEN' http://localhost:3000/api/v1/jobs/$VIDEO_ID | jq"
echo "4. Check S3: aws s3 ls s3://cab432a01-videos-tshewang/transcoded/1/$VIDEO_ID.mp4"
