require("./env"); // if you have one that loads .env early
const { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand } = require("@aws-sdk/client-sqs");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const QUEUE_URL = process.env.SQS_QUEUE_URL;

if (!QUEUE_URL) console.warn("[SQS] SQS_QUEUE_URL is not set!");

const sqs = new SQSClient({ region: REGION });

async function enqueueMessage(payload, opts = {}) {
  if (!QUEUE_URL) throw new Error("SQS_QUEUE_URL not configured");
  const MessageBody = JSON.stringify(payload);
  const cmd = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    MessageBody,
    MessageGroupId: opts.groupId,         // only used if FIFO
    MessageDeduplicationId: opts.dedupeId // only used if FIFO
  });
  return sqs.send(cmd);
}

async function receiveOne() {
  if (!QUEUE_URL) throw new Error("SQS_QUEUE_URL not configured");
  const cmd = new ReceiveMessageCommand({
    QueueUrl: QUEUE_URL,
    MaxNumberOfMessages: Number(process.env.SQS_MAX_RECEIVE || 1),
    WaitTimeSeconds: Number(process.env.SQS_WAIT_TIME || 20),
    VisibilityTimeout: Number(process.env.SQS_VISIBILITY_TIMEOUT || 900)
  });
  const out = await sqs.send(cmd);
  return (out.Messages || [])[0] || null;
}

async function deleteMessage(receiptHandle) {
  const cmd = new DeleteMessageCommand({ QueueUrl: QUEUE_URL, ReceiptHandle: receiptHandle });
  return sqs.send(cmd);
}

module.exports = { enqueueMessage, receiveOne, deleteMessage, QUEUE_URL };
