Assignment 2 - Cloud Services Exercises - Response to Criteria
================================================

Instructions
------------------------------------------------
- Keep this file named A2_response_to_criteria.md, do not change the name
- Upload this file along with your code in the root directory of your project
- Upload this file in the current Markdown format (.md extension)
- Do not delete or rearrange sections.  If you did not attempt a criterion, leave it blank
- Text inside [ ] like [eg. S3 ] are examples and should be removed


Overview
------------------------------------------------

- **Name:** Tshewang Tenzin
- **Student number:** n11761211
- **EC2 instance name or ID:*KinzangCAB*

------------------------------------------------

### Core - First data persistence service

AWS service name: Amazon S3 (bucket: cab432a01-videos-tshewang)
What data is being stored? Original uploaded videos (raw) and transcoded outputs.
Why is this service suited to this data? Object storage is ideal for large, immutable blobs, supports high throughput, lifecycle policies, and cheap durable storage.
Why are the other services used not suitable for this data?
DynamoDB/RDS are record/row stores, not meant for multi-MB/GB binary objects and have size limits; storing video bytes there would be costly and inefficient.
Bucket/instance/table name: cab432a01-videos-tshewang
Video timestamp: [add mm:ss from demo]
Relevant files:
utils/videoProcessor.js (S3 client, presign helpers)
controllers/jobsController.js (creates S3 keys, verifies output with headObject)
routes/jobs.js
    -

### Core - Second data persistence service

AWS service name: Amazon DynamoDB
What data is being stored? Video job metadata & state machine: videoId, userId, status (QUEUED/PROCESSING/COMPLETED/FAILED), keys (rawKey, outputKey), options, timestamps, lock info.
Why is this service suited to this data? Low-latency key-value access by videoId, simple atomic updates for status transitions and locks, and scalable throughput for many concurrent jobs.
Why are the other services used not suitable for this data?
S3 can’t express conditional updates/locks or query by attributes.
RDS could work, but DynamoDB’s conditional writes and TTL-style patterns make the lock/state transitions simpler and cheaper at scale.
Bucket/instance/table name: DDB_TABLE (env var), GSI byUserId (optional via DDB_HAS_GSI=true)
Video timestamp: [add mm:ss from demo]
Relevant files:
models/Job.js (Create/Lock/Complete/List; now with cache)
utils/reconcile.js (auto-heals stuck PROCESSING on boot)
.env (DDB_TABLE, DDB_HAS_GSI, AWS_REGION)

    -

### Third data service

AWS service name: Amazon RDS (PostgreSQL) – shared DB: cohort_2025
What data is being stored? Audit trail of user actions & job lifecycle events (JOB_CREATED, JOB_PROCESSING, JOB_COMPLETED, JOB_FAILED, DOWNLOAD).
Why is this service suited to this data? Relational queries over time-series events (filter by user/action/date), easy reporting/joins later (e.g., user engagement), and ACID guarantees for audit logs.
Why are the other services used not suitable for this data?
S3 isn’t queryable.
DynamoDB can store logs, but ad-hoc/relational analysis (e.g., join to other tables in future) and complex filtering/reporting are more ergonomic in SQL.
Bucket/instance/table name: RDS endpoint: database-1-instance-1.ce2haupt2cta.ap-southeast-2.rds.amazonaws.com, DB: cohort_2025, table: audit (created by migration).
Video timestamp: [add mm:ss from demo showing /api/v1/audit/me and psql]
Relevant files:
config/rds.js (Pool + migrateAudit)
models/Audit.js (logEvent, listEventsForUser)
routes/audit.js
index.js (calls migrateAudit)
    -

### S3 Pre-signed URLs

S3 Bucket names: cab432a01-videos-tshewang
What uses pre-signed URLs?
Upload: Client requests POST /api/v1/jobs/presign-upload, gets a pre-signed PUT and uploads directly to S3.
Download: When a job is COMPLETED, GET /api/v1/jobs/:id/download returns a pre-signed GET which the client opens.
Video timestamp: [add mm:ss showing Network tab: PUT to S3, and later GET to S3]
Relevant files:
utils/videoProcessor.js (presignUpload, presignDownload)
controllers/jobsController.js (presignRawUpload, startTranscodeFromS3, downloadPresigned)
routes/jobs.js
public/index.html (front-end flow)
    -

### In-memory cache

ElastiCache instance name / endpoint: my-memcached.cfg.ap-southeast-2.cache.amazonaws.com:11211 (use your actual cluster endpoint)
What data is being cached?
Individual job objects (job:<videoId>)
Job lists per user (jobs:user:<userId>)
Why is this data likely to be accessed frequently?
The Jobs page refreshes often (polling or SSE). Many users repeatedly open their job list while transcoding completes; caching dramatically reduces DynamoDB read load and latency.
Video timestamp: [add mm:ss where you show memcached flush/dump and a request repopulating the cache]
Relevant files:
config/cache.js (MemJS client; cacheGet/Set/Del)
models/Job.js (cache wrapper + invalidation in createJobOnce/completeJob)
.env (MEMCACHED_ENDPOINT, CACHE_TTL_JOB, CACHE_TTL_JOBS)


    -

### Core - Statelessness

What data is stored within your application that is not stored in cloud data services?
Short-lived transcode process state and any local temp files/streams used by ffmpeg (if any).
Why is this data not considered persistent state?
It’s ephemeral and can be recreated from the source video & job metadata in S3/DynamoDB.
How does your application ensure data consistency if the app suddenly stops?
DynamoDB is the source of truth for job states.
On server boot, utils/reconcile.js scans for stale PROCESSING jobs and safely moves them back to QUEUED for reprocessing.
Locks (lockedBy, lockTTL) prevent double work across instances.
Relevant files:
models/Job.js (status/locks)
utils/reconcile.js
index.js (boot calls reconcile() best-effort)

    -

### Graceful handling of persistent connections

Type of persistent connection and use: Server-Sent Events (/api/v1/stream/jobs) to push live job updates.
Method for handling lost connections:
Client: Uses EventSource which auto-reconnects; on hard failure it closes SSE and falls back to polling. Toggle to enable/disable live updates.
Server: Can be restarted/scaled out; any instance can serve SSE because job state is in DynamoDB/RDS, not memory.
Relevant files:
routes/stream.js (SSE endpoint)
public/index.html (EventSource wiring, graceful fallback)
    -


### Core - Authentication with Cognito

User pool name: (Your Cognito User Pool name as created in AWS – add exact name here)
How are authentication tokens handled by the client? The /api/auth/login response provides a Cognito idToken (or legacy token); the client stores it in localStorage and sends it as Authorization: Bearer <token> on API calls.
Video timestamp: [add mm:ss from demo login]
Relevant files:
routes/auth.js
middleware/auth.js (verifies token)
public/index.html (stores token)

    -

### Cognito multi-factor authentication

Subdomain: 11761211.cab432.com → CNAME to ec2-3-27-90-104.ap-southeast-2.compute.amazonaws.com
Video timestamp: [add mm:ss where you show Route53 record + nslookup]

    -
### Parameter store

Parameter names (examples you set):
11761211/base_url → http://11761211.cab432.com:3000
11761211/s3_bucket → cab432a01-videos-tshewang
11761211/memcached_endpoint → my-memcached.cfg.ap-southeast-2.cache.amazonaws.com:11211
11761211/rds_url → postgres://<user>:<pass>@database-1-instance-1...ap-southeast-2.rds.amazonaws.com:5432/cohort_2025?sslmode=require
(You can also store external API URLs/keys here.)
Video timestamp: [add mm:ss where you show Parameter Store entries]
    -


    -


    -

    -

- **Video timestamp:**
- **Relevant files:**
    -
