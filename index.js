const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');

console.log('Lambda function starting...');

exports.handler = async (event, context) => {
    console.log('Received event:', JSON.stringify(event, null, 2));
    
    try {
        // Initialize SQS client
        const sqs = new SQSClient({ region: 'ap-southeast-2' });
        const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL;
        
        console.log('SQS Queue URL:', SQS_QUEUE_URL);
        
        if (!event.Records || !Array.isArray(event.Records)) {
            console.log('No records in event');
            return {
                statusCode: 400,
                body: JSON.stringify({ error: 'No records in event' })
            };
        }
        
        console.log(`Processing ${event.Records.length} record(s)`);
        
        for (const record of event.Records) {
            console.log('Processing record:', record.eventName);
            
            if (record.s3) {
                const bucket = record.s3.bucket.name;
                const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
                
                console.log(`S3 Object: ${bucket}/${key}`);
                
                if (key.startsWith('raw/')) {
                    await processS3Object(bucket, key, sqs, SQS_QUEUE_URL);
                }
            }
        }
        
        return {
            statusCode: 200,
            body: JSON.stringify({ 
                message: 'Processing completed',
                processed: event.Records.length 
            })
        };
        
    } catch (error) {
        console.error('Error in handler:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ 
                error: 'Handler failed',
                message: error.message 
            })
        };
    }
};

async function processS3Object(bucket, key, sqs, queueUrl) {
    try {
        console.log(`Processing S3 object: ${key}`);
        
        // Simple message for testing
        const message = {
            type: "TRANSCODE",
            videoId: "test_" + Date.now(),
            rawKey: key,
            bucket: bucket,
            timestamp: new Date().toISOString(),
            test: true
        };
        
        console.log('Sending message to SQS:', message);
        
        const command = new SendMessageCommand({
            QueueUrl: queueUrl,
            MessageBody: JSON.stringify(message)
        });
        
        const result = await sqs.send(command);
        console.log('Successfully sent message to SQS:', result.MessageId);
        
    } catch (error) {
        console.error('Error processing S3 object:', error);
        throw error;
    }
}
