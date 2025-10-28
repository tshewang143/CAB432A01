// config/sqs.js
"use strict";

// Load env if running locally; on ECS we rely on task env
try { require("dotenv").config(); } catch {}

const {
  SQSClient,
  SendMessageCommand,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  ChangeMessageVisibilityCommand,
  GetQueueAttributesCommand,
} = require("@aws-sdk/client-sqs");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const DEFAULT_QUEUE_URL = process.env.SQS_QUEUE_URL || "";

const sqs = new SQSClient({ region: REGION });

function ensureUrl(queueUrl) {
  if (!queueUrl) {
    throw new Error("SQS_QUEUE_URL not configured");
  }
}
function isFIFO(queueUrl) {
  return typeof queueUrl === "string" && queueUrl.endsWith(".fifo");
}

/**
 * Enqueue to the default queue (SQS_QUEUE_URL) unless opts.queueUrl provided.
 * For Standard queues, MessageGroupId & MessageDeduplicationId are omitted.
 */
async function enqueueMessage(payload, opts = {}) {
  const queueUrl = opts.queueUrl || DEFAULT_QUEUE_URL;
  ensureUrl(queueUrl);

  const params = {
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(payload),
  };
  if (opts.delaySeconds != null) params.DelaySeconds = Number(opts.delaySeconds) || 0;

  if (isFIFO(queueUrl)) {
    if (opts.groupId) params.MessageGroupId = String(opts.groupId);
    if (opts.dedupeId) params.MessageDeduplicationId = String(opts.dedupeId);
  }
  const out = await sqs.send(new SendMessageCommand(params));
  return out;
}

/**
 * Enqueue to an explicit queue URL (useful for fan-out e.g. NOTIFY).
 */
async function enqueueTo(queueUrl, payload, opts = {}) {
  return enqueueMessage(payload, { ...opts, queueUrl });
}

/**
 * Long-poll one message from the default queue.
 */
async function receiveOne(opts = {}) {
  const queueUrl = opts.queueUrl || DEFAULT_QUEUE_URL;
  ensureUrl(queueUrl);

  const cmd = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: Number(process.env.SQS_MAX_RECEIVE || 1),
    WaitTimeSeconds: Number(process.env.SQS_WAIT_TIME || 20),
    VisibilityTimeout: Number(process.env.SQS_VISIBILITY_TIMEOUT || 900),
    AttributeNames: ["All"],
    MessageAttributeNames: ["All"],
  });

  const out = await sqs.send(cmd);
  return (out.Messages || [])[0] || null;
}

async function deleteMessage(receiptHandle, opts = {}) {
  const queueUrl = opts.queueUrl || DEFAULT_QUEUE_URL;
  ensureUrl(queueUrl);

  await sqs.send(
    new DeleteMessageCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
    })
  );
}

async function extendVisibility(receiptHandle, seconds, opts = {}) {
  const queueUrl = opts.queueUrl || DEFAULT_QUEUE_URL;
  ensureUrl(queueUrl);

  await sqs.send(
    new ChangeMessageVisibilityCommand({
      QueueUrl: queueUrl,
      ReceiptHandle: receiptHandle,
      VisibilityTimeout: Number(seconds) || 300,
    })
  );
}

/** Optional helper you can use in diagnostics / autoscaling demos */
async function getQueueDepth(queueUrl = DEFAULT_QUEUE_URL) {
  ensureUrl(queueUrl);
  const out = await sqs.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ["ApproximateNumberOfMessages", "ApproximateNumberOfMessagesNotVisible"],
    })
  );
  return {
    visible: Number(out.Attributes?.ApproximateNumberOfMessages || 0),
    notVisible: Number(out.Attributes?.ApproximateNumberOfMessagesNotVisible || 0),
  };
}

module.exports = {
  sqsClient: sqs,
  QUEUE_URL: DEFAULT_QUEUE_URL,
  enqueueMessage,
  enqueueTo,
  receiveOne,
  deleteMessage,
  extendVisibility,
  getQueueDepth,
};
