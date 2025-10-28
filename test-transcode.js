const { S3Client, HeadObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { execSync } = require('child_process');
const fs = require('fs');

const s3 = new S3Client({ region: 'ap-southeast-2' });
const BUCKET = 'cab432a01-videos-tshewang';

async function testTranscode() {
  try {
    const inputKey = 'raw/s403/small-test.mp4';
    const outputKey = 'transcoded/s403/test-output.mp4';
    
    console.log('1. Checking if input file exists...');
    
    // Check if input file exists
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: inputKey }));
      console.log('✓ Input file exists');
    } catch (error) {
      console.log('✗ Input file not found:', error.message);
      return;
    }
    
    console.log('2. Downloading input file...');
    
    // Download input file
    const { Body } = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: inputKey }));
    const chunks = [];
    for await (const chunk of Body) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    fs.writeFileSync('/tmp/input.mp4', buffer);
    console.log('✓ Input file downloaded');
    
    console.log('3. Running ffmpeg transcode...');
    
    // Run ffmpeg transcode
    execSync('ffmpeg -i /tmp/input.mp4 -vf scale=640:360 -c:v libx264 -preset fast /tmp/output.mp4 -y', {
      stdio: 'inherit'
    });
    console.log('✓ Transcode completed');
    
    console.log('4. Uploading output...');
    
    // Upload output
    const outputBuffer = fs.readFileSync('/tmp/output.mp4');
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: outputKey,
      Body: outputBuffer
    }));
    console.log('✓ Output uploaded to S3');
    
    console.log('5. Verifying output...');
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: outputKey }));
    console.log('✓ Output verified');
    
    console.log('🎉 Transcode test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testTranscode();
