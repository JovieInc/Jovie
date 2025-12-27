# Infrastructure Monitoring Runbook

This document describes what to monitor and how to respond to infrastructure issues related to the hardening changes in bugs 13-18, 22-25.

## 1. Blob Storage Orphan Prevention

### What to Monitor
- **Log pattern**: `[upload] Cleaned up previous avatar blobs`
- **Log pattern**: `[upload] Failed to clean up previous avatar blobs`
- **Log pattern**: `[cleanup-photos] Blob deletion failed`

### Metrics
- Count of `blobsDeleted` in cleanup-photos cron response
- `blobDeletionFailed: true` in cleanup-photos response

### Response
If blob deletion failures are frequent:
1. Check Vercel Blob dashboard for storage issues
2. Verify `BLOB_READ_WRITE_TOKEN` is valid
3. Consider running manual cleanup via Vercel dashboard
4. Orphaned blobs don't affect functionality but consume storage

---

## 2. Payment Tip Duplicate Detection

### What to Monitor
- **Log pattern**: `[capture-tip] Idempotent duplicate webhook received`
- **Log pattern**: `[capture-tip] Tip recorded successfully`
- **Event type**: `tip_webhook_duplicate` vs `tip_recorded`

### Metrics
- Ratio of duplicates to new tips (high ratio may indicate Stripe retry issues)
- Count of `tip_recorded` events per hour

### Response
If duplicate ratio is unusually high:
1. Check Stripe webhook delivery logs for retry patterns
2. Verify webhook endpoint is responding within timeout
3. Check for network issues between Stripe and our servers

---

## 3. Handle Race Condition Detection

### What to Monitor
- **Log pattern**: `[username/sync] Race condition detected - handle claimed by another user`

### Metrics
- Count of race condition detections per day

### Response
If race conditions are frequent:
1. This is expected behavior under high contention
2. Users will see "Handle already taken" error
3. No action needed unless it's affecting user experience significantly

---

## 4. Idempotency Key Conflicts

### What to Monitor
- **Log pattern**: `[social-links] Idempotency key conflict detected`
- **Log pattern**: `[social-links] Failed to store idempotency key`

### Metrics
- Count of idempotency conflicts per hour
- Count of storage failures per hour

### Response
If conflicts are frequent:
1. May indicate client retry issues or slow responses
2. Check response times for social-links endpoints
3. Consider increasing idempotency key TTL if legitimate retries are being rejected

---

## 5. Clerk Webhook Failures

### What to Monitor
- **Log pattern**: `Failed to process user.created event`
- **Log pattern**: `Failed to sync username from Clerk`
- HTTP 500 responses from `/api/clerk/webhook`

### Metrics
- Count of 500 responses from Clerk webhook endpoint
- Clerk webhook retry count in Clerk dashboard

### Response
If webhook failures are frequent:
1. Check Clerk dashboard for webhook delivery status
2. Verify database connectivity
3. Check for schema/migration issues
4. Clerk will automatically retry failed webhooks

---

## 6. Cron Job Health

### What to Monitor
- **Log pattern**: `[cleanup-photos] Deleted X orphaned records`
- **Log pattern**: `[cleanup-idempotency-keys] Deleted X expired keys`
- **Log pattern**: `[billing-reconciliation] Completed`

### Metrics
- Cron job success rate
- Records cleaned up per run
- Duration of each cron job

### Response
If cron jobs are failing:
1. Check Vercel cron logs
2. Verify `CRON_SECRET` is set correctly
3. Check database connectivity
4. Verify cron schedule in vercel.json

---

## 7. Photo Cleanup Job

### What to Monitor
- Response fields from `/api/cron/cleanup-photos`:
  - `deleted`: Number of DB records deleted
  - `blobsDeleted`: Number of blobs deleted
  - `blobDeletionFailed`: Whether blob deletion failed
  - `details.failed`: Count of failed upload records
  - `details.stuckUploading`: Count of stuck uploading records
  - `details.stuckProcessing`: Count of stuck processing records

### Metrics
- Trend of orphaned records over time (should stay low)
- Ratio of stuck uploads to successful uploads

### Response
If orphaned records are increasing:
1. Check upload route for errors
2. Verify blob storage is working
3. Consider reducing stuck upload threshold (currently 1 hour)

---

## Alert Thresholds (Suggested)

| Metric | Warning | Critical |
|--------|---------|----------|
| Blob deletion failures per day | > 10 | > 50 |
| Tip webhook duplicates per hour | > 20% of total | > 50% of total |
| Handle race conditions per day | > 10 | > 50 |
| Idempotency conflicts per hour | > 5 | > 20 |
| Clerk webhook 500s per hour | > 5 | > 20 |
| Orphaned photo records per cleanup | > 50 | > 200 |

---

## Log Search Queries

### Vercel/Datadog Log Queries

```
# Blob cleanup issues
"[cleanup-photos]" OR "[upload] Failed to clean up"

# Tip webhook activity
"[capture-tip]" event_type

# Race conditions
"Race condition detected"

# Idempotency issues
"[social-links] Idempotency"

# Webhook failures
"Failed to process user.created" OR "Failed to sync username"
```

---

## Recovery Procedures

### Manual Blob Cleanup
If automatic cleanup fails, use Vercel dashboard:
1. Go to Vercel project → Storage → Blob
2. Filter by `avatars/users/` prefix
3. Identify orphaned blobs (not referenced in DB)
4. Delete manually

### Force Retry Clerk Webhook
1. Go to Clerk dashboard → Webhooks
2. Find failed webhook delivery
3. Click "Retry" to resend

### Database Reconciliation
If DB and blob storage are out of sync:
1. Run `SELECT * FROM profile_photos WHERE status = 'ready' AND blob_url IS NOT NULL`
2. Verify each blob_url exists in Vercel Blob
3. Mark missing blobs as failed: `UPDATE profile_photos SET status = 'failed' WHERE id = 'xxx'`
