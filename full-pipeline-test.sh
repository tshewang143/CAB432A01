#!/bin/bash

cd /home/ubuntu/CAB432A01

echo "🎬 Full Pipeline Test"

# Generate JWT
JWT=$(node -e "
require('dotenv').config({ path: __dirname + '/.env' });
const jwt = require('jsonwebtoken');
console.log(jwt.sign({ userId: 1, username: 'client1' }, process.env.JWT_SECRET, { expiresIn: '1h' }));
")

echo "✓ Token generated"

# Create test video
ffmpeg -f lavfi -i testsrc=duration=5:size=640x360:rate=30 \
  -f lavfi -i sine=frequency=1000:duration=5 \
  -c:v libx264 -preset fast \
  -c:a aac \
  /tmp/pipeline_test.mp4 -y -hide_banner -loglevel error

echo "✓ Test video created"

# Get presigned URL
RESP=$(curl -s -X POST http://localhost:3000/api/v1/jobs/presign-upload \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{"filename": "pipeline_test.mp4", "contentType": "video/mp4"}')

VID=$(echo "$RESP" | jq -r '.videoId')
URL=$(echo "$RESP" | jq -r '.uploadUrl')
KEY=$(echo "$RESP" | jq -r '.rawKey')

echo "✓ Presigned URL obtained - Video ID: $VID"

# Upload
curl -s -X PUT "$URL" -H "Content-Type: video/mp4" --upload-file /tmp/pipeline_test.mp4
echo "✓ File uploaded to S3"

# Start job
curl -s -X POST http://localhost:3000/api/v1/jobs/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d "{\"videoId\":\"$VID\",\"rawKey\":\"$KEY\",\"title\":\"Pipeline Test\"}"

echo "✓ Job started"

echo ""
echo "📊 Monitoring:"
echo "   Video ID: $VID"
echo "   Worker logs: tail -f worker.log"
echo "   Check status: curl -s -H 'Authorization: Bearer $JWT' http://localhost:3000/api/v1/jobs/$VID | jq"
echo "   Check S3: aws s3 ls s3://cab432a01-videos-tshewang/transcoded/1/$VID.mp4"
