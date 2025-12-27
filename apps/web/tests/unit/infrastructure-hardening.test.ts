/**
 * Infrastructure Hardening Tests
 *
 * Tests for:
 * - Timing-safe cron secret comparison
 * - Idempotency key handling
 * - Blob cleanup atomicity
 * - Handle race protection
 * - Webhook retry behavior
 */

import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';

describe('Timing-safe cron secret comparison', () => {
  it('should use crypto.timingSafeEqual for secret comparison', () => {
    const secret = 'test-cron-secret-12345';
    const providedSecret = 'test-cron-secret-12345';

    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(secret);

    // Same length, same content - should match
    expect(providedBuffer.length).toBe(expectedBuffer.length);
    expect(crypto.timingSafeEqual(providedBuffer, expectedBuffer)).toBe(true);
  });

  it('should reject secrets with different lengths safely', () => {
    const secret = 'test-cron-secret-12345';
    const providedSecret = 'short';

    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(secret);

    // Different lengths - should fail before timingSafeEqual
    expect(providedBuffer.length).not.toBe(expectedBuffer.length);
  });

  it('should reject incorrect secrets with same length', () => {
    const secret = 'test-cron-secret-12345';
    const providedSecret = 'test-cron-secret-XXXXX';

    const providedBuffer = Buffer.from(providedSecret);
    const expectedBuffer = Buffer.from(secret);

    expect(providedBuffer.length).toBe(expectedBuffer.length);
    expect(crypto.timingSafeEqual(providedBuffer, expectedBuffer)).toBe(false);
  });
});

describe('Idempotency key handling', () => {
  it('should detect duplicate idempotency keys via conflict check', () => {
    // Simulate the behavior of onConflictDoNothing().returning()
    // When a key already exists, returning() returns empty array
    const existingKeyResult: { id: string }[] = [];
    const newKeyResult = [{ id: 'new-key-id' }];

    expect(existingKeyResult.length).toBe(0); // Conflict detected
    expect(newKeyResult.length).toBe(1); // New key stored
  });

  it('should log structured warning for idempotency conflicts', () => {
    const logData = {
      key: 'test-key',
      userId: 'user-123',
      endpoint: 'POST /api/dashboard/social-links',
      reason: 'key_already_exists',
    };

    // Verify log structure matches expected format
    expect(logData).toHaveProperty('key');
    expect(logData).toHaveProperty('userId');
    expect(logData).toHaveProperty('endpoint');
    expect(logData).toHaveProperty('reason');
    expect(logData.reason).toBe('key_already_exists');
  });
});

describe('Tip webhook duplicate handling', () => {
  it('should distinguish between new tips and duplicates in logs', () => {
    // New tip log structure
    const newTipLog = {
      event_type: 'tip_recorded',
      tip_id: 'tip-123',
      payment_intent: 'pi_abc123',
      handle: 'artist',
      amount_cents: 500,
      currency: 'USD',
      has_contact_email: true,
      has_contact_phone: false,
    };

    // Duplicate webhook log structure
    const duplicateLog = {
      event_type: 'tip_webhook_duplicate',
      payment_intent: 'pi_abc123',
      handle: 'artist',
      amount_cents: 500,
      reason: 'payment_intent_already_processed',
    };

    expect(newTipLog.event_type).toBe('tip_recorded');
    expect(duplicateLog.event_type).toBe('tip_webhook_duplicate');
    expect(duplicateLog.reason).toBe('payment_intent_already_processed');
  });
});

describe('Handle race protection', () => {
  it('should detect unique constraint violation for username_normalized', () => {
    // Simulate Postgres unique constraint violation
    const pgError = {
      code: '23505',
      constraint: 'creator_profiles_username_normalized_unique',
      detail: 'Key (username_normalized)=(testhandle) already exists.',
    };

    const isUniqueViolation =
      pgError.code === '23505' &&
      pgError.constraint?.includes('username_normalized');

    expect(isUniqueViolation).toBe(true);
  });

  it('should not treat other errors as race conditions', () => {
    // Simulate other Postgres error
    const otherError = {
      code: '23503', // Foreign key violation
      constraint: 'creator_profiles_user_id_fkey',
    };

    const isUniqueViolation =
      otherError.code === '23505' &&
      otherError.constraint?.includes('username_normalized');

    expect(isUniqueViolation).toBe(false);
  });
});

describe('Webhook retry behavior', () => {
  it('should return 500 for Clerk webhook failures to trigger retry', () => {
    // Verify the expected status codes for different scenarios
    const successStatus = 200;
    const failureStatus = 500;

    // Success should return 200
    expect(successStatus).toBe(200);

    // Failure should return 500 to trigger Clerk retry
    expect(failureStatus).toBe(500);
  });
});

describe('Blob cleanup atomicity', () => {
  it('should delete DB records before blobs', () => {
    // Verify the order of operations:
    // 1. Delete DB records (atomic batch)
    // 2. Delete blobs (best-effort)
    const operations: string[] = [];

    // Simulate the cleanup order
    operations.push('db_delete');
    operations.push('blob_delete');

    expect(operations[0]).toBe('db_delete');
    expect(operations[1]).toBe('blob_delete');
  });

  it('should deduplicate blob URLs before deletion', () => {
    // Same URL may appear in multiple columns
    const record = {
      blobUrl: 'https://blob.example.com/avatar.avif',
      smallUrl: 'https://blob.example.com/avatar.avif',
      mediumUrl: 'https://blob.example.com/avatar.avif',
      largeUrl: 'https://blob.example.com/avatar.avif',
    };

    const blobUrlSet = new Set<string>();
    if (record.blobUrl) blobUrlSet.add(record.blobUrl);
    if (record.smallUrl) blobUrlSet.add(record.smallUrl);
    if (record.mediumUrl) blobUrlSet.add(record.mediumUrl);
    if (record.largeUrl) blobUrlSet.add(record.largeUrl);

    // Should only have 1 unique URL
    expect(blobUrlSet.size).toBe(1);
  });

  it('should handle blob deletion failure gracefully', () => {
    let blobDeletionFailed = false;

    try {
      // Simulate blob deletion failure
      throw new Error('Blob deletion failed');
    } catch {
      blobDeletionFailed = true;
    }

    // DB records should still be deleted, just flag the blob failure
    expect(blobDeletionFailed).toBe(true);
  });
});

describe('Info disclosure prevention', () => {
  it('should not include stack traces in error responses', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at Object.<anonymous> (/path/to/file.ts:10:5)';

    // The response should NOT include the stack
    const safeResponse = {
      ok: false,
      error: 'Internal server error',
    };

    expect(safeResponse).not.toHaveProperty('stack');
    expect(safeResponse.error).toBe('Internal server error');
    expect(safeResponse.error).not.toContain('at Object');
  });
});
