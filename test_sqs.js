require('dotenv').config();
const { enqueueMessage } = require('./config/sqs');

async function testSQS() {
  try {
    console.log('Testing SQS from web service...');
    console.log('SQS_QUEUE_URL:', process.env.SQS_QUEUE_URL);
    
    const result = await enqueueMessage({
      type: 'TEST',
      videoId: 'test_' + Date.now(),
      userId: 'test_user',
      rawKey: 'raw/test/test.mp4',
      outputKey: 'transcoded/test/test.mp4',
      resolution: '720p'
    });
    
    console.log('✅ SQS test successful! Message ID:', result.MessageId);
    return true;
  } catch (error) {
    console.error('❌ SQS test failed:', error.message);
    return false;
  }
}

testSQS().then(success => {
  process.exit(success ? 0 : 1);
});
