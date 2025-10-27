require('dotenv').config();

console.log('🔧 Worker Debug Information\n');

// Check environment variables
console.log('1. Environment Variables:');
console.log('   - AWS_REGION:', process.env.AWS_REGION);
console.log('   - S3_BUCKET:', process.env.S3_BUCKET);
console.log('   - DDB_TABLE:', process.env.DDB_TABLE);
console.log('   - SQS_QUEUE_URL:', process.env.SQS_QUEUE_URL ? '✓ Set' : '✗ Missing');
console.log('   - RDS_HOST:', process.env.RDS_HOST);

// Check AWS credentials
console.log('\n2. AWS Credentials:');
const { fromNodeProviderChain } = require('@aws-sdk/credential-providers');
const { S3Client, ListBucketsCommand } = require('@aws-sdk/client-s3');

async function checkAWSCreds() {
  try {
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    await s3.send(new ListBucketsCommand({}));
    console.log('   ✅ AWS Credentials: Valid');
  } catch (error) {
    console.log('   ❌ AWS Credentials: Invalid -', error.message);
  }
}

// Check S3 access
async function checkS3() {
  try {
    const s3 = new S3Client({ region: process.env.AWS_REGION });
    const { Contents } = await s3.send(new ListBucketsCommand({}));
    const bucketExists = Contents.some(bucket => bucket.Name === process.env.S3_BUCKET);
    console.log('   ✅ S3 Access: Valid');
    console.log('   ✅ S3 Bucket Exists:', bucketExists ? 'Yes' : 'No');
  } catch (error) {
    console.log('   ❌ S3 Access: Failed -', error.message);
  }
}

// Check DynamoDB access
async function checkDynamoDB() {
  try {
    const { DynamoDBClient, ListTablesCommand } = require('@aws-sdk/client-dynamodb');
    const dynamo = new DynamoDBClient({ region: process.env.AWS_REGION });
    await dynamo.send(new ListTablesCommand({}));
    console.log('   ✅ DynamoDB Access: Valid');
  } catch (error) {
    console.log('   ❌ DynamoDB Access: Failed -', error.message);
  }
}

// Check if ffmpeg is available
const { execSync } = require('child_process');
try {
  execSync('which ffmpeg', { stdio: 'pipe' });
  console.log('   ✅ FFmpeg: Available');
} catch (error) {
  console.log('   ❌ FFmpeg: Not installed');
}

async function runChecks() {
  await checkAWSCreds();
  await checkS3();
  await checkDynamoDB();
}

runChecks().catch(console.error);
