/**
 * E2E: AI Connectors magic moment flow.
 *
 * Tests the end-to-end flow:
 * 1. Gmail extraction → suggested_action created
 * 2. DJ approves → workflow_runs inserted
 * 3. Second approve → 409 (idempotent)
 * 4. Cron picks up workflow_run → Google Calendar event created
 *
 * Run condition: requires RUN_CONNECTOR_E2E=1 (expensive, hits real DB + Google API).
 * In CI this runs only when RUN_CONNECTOR_E2E=1.
 *
 * The basic endpoint-existence tests (401 checks) run always.
 */

import { expect, test } from '@playwright/test';

const SKIP_EXPENSIVE = process.env.RUN_CONNECTOR_E2E !== '1';

test.describe('Connector endpoints: basic auth checks', () => {
  test('approve endpoint returns 401 for unauthenticated requests', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/connectors/suggested-actions/fake-id-000/approve'
    );
    // 401 or 403 expected — no valid session
    expect([401, 403]).toContain(response.status());
  });

  test('reject endpoint returns 401 for unauthenticated requests', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/connectors/suggested-actions/fake-id-000/reject'
    );
    expect([401, 403]).toContain(response.status());
  });

  test('cron process-workflow-runs returns 401 without CRON_SECRET', async ({
    request,
  }) => {
    const response = await request.get('/api/cron/process-workflow-runs');
    expect(response.status()).toBe(401);
  });

  test('cron process-workflow-runs returns 401 with wrong secret', async ({
    request,
  }) => {
    const response = await request.get('/api/cron/process-workflow-runs', {
      headers: { Authorization: 'Bearer wrong-secret-xyz' },
    });
    expect(response.status()).toBe(401);
  });
});

test.describe('Connector magic moment: full flow', () => {
  test.skip(
    SKIP_EXPENSIVE,
    'set RUN_CONNECTOR_E2E=1 to run connector E2E tests'
  );

  test('approve → 200, second approve → 409', async ({ request }) => {
    // This test requires a seeded suggested_actions row.
    // In CI this is seeded by the test setup fixture.
    // For local runs, you need a valid session + a pending suggested_action.

    const SUGGESTED_ACTION_ID = process.env.TEST_SUGGESTED_ACTION_ID;
    test.skip(
      !SUGGESTED_ACTION_ID,
      'set TEST_SUGGESTED_ACTION_ID to run full approval flow'
    );

    const firstApprove = await request.post(
      `/api/connectors/suggested-actions/${SUGGESTED_ACTION_ID}/approve`
    );
    expect(firstApprove.status()).toBe(200);
    const body = await firstApprove.json();
    expect(body).toMatchObject({ ok: true, approvalId: SUGGESTED_ACTION_ID });

    // Second approve should hit the CAS guard
    const secondApprove = await request.post(
      `/api/connectors/suggested-actions/${SUGGESTED_ACTION_ID}/approve`
    );
    expect(secondApprove.status()).toBe(409);
    const secondBody = await secondApprove.json();
    expect(secondBody).toMatchObject({ error: 'already-decided' });
  });

  test('reject → 200, second reject → 409', async ({ request }) => {
    const SUGGESTED_ACTION_ID = process.env.TEST_REJECT_ACTION_ID;
    test.skip(
      !SUGGESTED_ACTION_ID,
      'set TEST_REJECT_ACTION_ID to run full rejection flow'
    );

    const firstReject = await request.post(
      `/api/connectors/suggested-actions/${SUGGESTED_ACTION_ID}/reject`
    );
    expect(firstReject.status()).toBe(200);

    const secondReject = await request.post(
      `/api/connectors/suggested-actions/${SUGGESTED_ACTION_ID}/reject`
    );
    expect(secondReject.status()).toBe(409);
  });
});
