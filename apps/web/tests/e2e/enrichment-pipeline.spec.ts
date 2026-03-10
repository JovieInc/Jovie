/**
 * Enrichment Pipeline E2E Tests
 *
 * Tests the musicfetch enrichment pipeline end-to-end against the local
 * dev server (or any BASE_URL) with real Doppler secrets.
 *
 * Run in headed mode to see the browser:
 *   doppler run -- pnpm --filter web exec playwright test tests/e2e/enrichment-pipeline.spec.ts --headed --project=chromium
 *
 * Three tests:
 *  1. Cron endpoint requires Bearer auth and returns { ok: true }
 *  2. Missing MusicFetch token causes job failure, not silent success (Root Cause 2 fix)
 *  3. Cron endpoint picks up pending jobs and returns { ok: true, processed: N } (Root Cause 1 fix)
 */

import { neon } from '@neondatabase/serverless';
import { expect, test } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3100';
const CRON_SECRET = process.env.CRON_SECRET;
const INGESTION_CRON_SECRET = process.env.INGESTION_CRON_SECRET ?? CRON_SECRET;
const MUSICFETCH_API_TOKEN = process.env.MUSICFETCH_API_TOKEN;
const DATABASE_URL = process.env.DATABASE_URL;

// ---------------------------------------------------------------------------
// Test 1: Cron endpoint authenticates correctly
// ---------------------------------------------------------------------------

test('cron endpoint rejects unauthenticated requests with 401', async () => {
  const res = await fetch(`${BASE_URL}/api/cron/process-ingestion-jobs`);
  expect(res.status).toBe(401);
});

test('cron endpoint accepts Bearer CRON_SECRET and returns { ok: true }', async () => {
  if (!CRON_SECRET) {
    test.skip(
      true,
      'CRON_SECRET not configured — run with: doppler run -- ...'
    );
    return;
  }

  const res = await fetch(`${BASE_URL}/api/cron/process-ingestion-jobs`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  expect(res.status).toBe(200);
  const json = (await res.json()) as {
    ok: boolean;
    attempted: number;
    processed: number;
    errors: string[];
  };
  // Confirms Root Cause 1 is fixed: the cron route exists and responds correctly
  expect(json.ok).toBe(true);
  expect(typeof json.attempted).toBe('number');
  expect(typeof json.processed).toBe('number');
  expect(Array.isArray(json.errors)).toBe(true);

  console.log(
    `[enrichment-cron] attempted=${json.attempted} processed=${json.processed} errors=${json.errors.length}`
  );
});

// ---------------------------------------------------------------------------
// Test 2: Missing token causes job FAILURE, not silent success (Root Cause 2)
// ---------------------------------------------------------------------------

test('missing MusicFetch token causes job failure not silent success', async () => {
  if (!DATABASE_URL) {
    test.skip(true, 'DATABASE_URL not configured');
    return;
  }
  if (!INGESTION_CRON_SECRET) {
    test.skip(true, 'INGESTION_CRON_SECRET / CRON_SECRET not configured');
    return;
  }
  if (MUSICFETCH_API_TOKEN) {
    test.skip(
      true,
      'MUSICFETCH_API_TOKEN is set — this test needs it absent to verify failure behaviour'
    );
    return;
  }

  const sql = neon(DATABASE_URL);

  // Find any creator profile to use as the test target
  const profiles =
    await sql`SELECT id FROM creator_profiles ORDER BY created_at DESC LIMIT 1`;
  if (profiles.length === 0) {
    test.skip(true, 'No creator profile available in DB for this test');
    return;
  }

  const profileId = profiles[0].id as string;
  const dedupKey = `e2e-test-no-token:${Date.now()}`;

  // Insert a pending job directly into the DB
  const inserted = await sql`
    INSERT INTO ingestion_jobs (job_type, payload, status, run_at, priority, attempts)
    VALUES (
      'musicfetch_enrichment',
      ${JSON.stringify({
        creatorProfileId: profileId,
        spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
        dedupKey,
      })},
      'pending',
      NOW(),
      0,
      0
    )
    RETURNING id
  `;
  const jobId = inserted[0].id as string;

  try {
    // Trigger processing via the ingestion jobs endpoint
    const res = await fetch(`${BASE_URL}/api/ingestion/jobs`, {
      method: 'POST',
      headers: { 'x-ingestion-secret': INGESTION_CRON_SECRET },
    });
    // Endpoint should accept the request (auth succeeds)
    expect([200, 202]).toContain(res.status);

    // Poll until job leaves pending/processing state (up to 10s)
    let finalStatus = 'pending';
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const rows = await sql`
        SELECT status FROM ingestion_jobs WHERE id = ${jobId}
      `;
      const status = rows[0]?.status as string | undefined;
      if (status && status !== 'pending' && status !== 'processing') {
        finalStatus = status;
        break;
      }
    }

    console.log(
      `[enrichment-no-token] job ${jobId} final status: ${finalStatus}`
    );

    // Confirms Root Cause 2 is fixed: job must be 'failed', not 'succeeded'
    expect(finalStatus).toBe('failed');
  } finally {
    // Clean up test job
    await sql`DELETE FROM ingestion_jobs WHERE id = ${jobId}`;
  }
});

// ---------------------------------------------------------------------------
// Test 3: Cron processes pending jobs end-to-end
// ---------------------------------------------------------------------------

test('cron endpoint processes pending jobs and returns processed count', async () => {
  if (!DATABASE_URL) {
    test.skip(true, 'DATABASE_URL not configured');
    return;
  }
  if (!CRON_SECRET) {
    test.skip(true, 'CRON_SECRET not configured');
    return;
  }

  const sql = neon(DATABASE_URL);

  // Find a creator profile to seed with
  const profiles =
    await sql`SELECT id FROM creator_profiles ORDER BY created_at DESC LIMIT 1`;
  if (profiles.length === 0) {
    test.skip(true, 'No creator profile available in DB for this test');
    return;
  }

  const profileId = profiles[0].id as string;
  const dedupKey = `e2e-test-cron:${Date.now()}`;

  // Enqueue a job (it will fail quickly if no MUSICFETCH_API_TOKEN, but that's ok)
  const inserted = await sql`
    INSERT INTO ingestion_jobs (job_type, payload, status, run_at, priority, attempts)
    VALUES (
      'musicfetch_enrichment',
      ${JSON.stringify({
        creatorProfileId: profileId,
        spotifyUrl: 'https://open.spotify.com/artist/4Uwpa6zW3zzCSQvooQNksm',
        dedupKey,
      })},
      'pending',
      NOW(),
      0,
      0
    )
    RETURNING id
  `;
  const jobId = inserted[0].id as string;

  try {
    // Trigger the cron — confirms Root Cause 1 is fixed
    const res = await fetch(`${BASE_URL}/api/cron/process-ingestion-jobs`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${CRON_SECRET}` },
    });

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      ok: boolean;
      attempted: number;
      processed: number;
      errors: string[];
    };

    console.log(
      `[enrichment-cron-jobs] ok=${json.ok} attempted=${json.attempted} processed=${json.processed}`
    );

    // The cron should have picked up at least our test job
    expect(json.ok).toBe(true);
    expect(json.attempted).toBeGreaterThanOrEqual(1);

    // If MusicFetch token is present, job should have succeeded;
    // otherwise it fails (but was still attempted — that's the important part)
    if (MUSICFETCH_API_TOKEN) {
      expect(json.processed).toBeGreaterThanOrEqual(1);
    }
    // Either way, the cron attempted it (not 0 attempted)
  } finally {
    // Clean up (job may already be gone after processing, ignore errors)
    await sql`DELETE FROM ingestion_jobs WHERE id = ${jobId}`.catch(() => {});
  }
});
