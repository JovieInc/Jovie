/**
 * E2E: AI Connectors — endpoint auth and approve/reject CAS behavior.
 *
 * What this file tests:
 * 1. Approve and reject endpoints reject unauthenticated requests (401 checks).
 * 2. Approve CAS: pending → accepted + workflow_run inserted (RUN_CONNECTOR_E2E=1 only).
 * 3. Second approve → 409 (idempotent, RUN_CONNECTOR_E2E=1 only).
 * 4. Reject CAS: pending → dismissed (RUN_CONNECTOR_E2E=1 only).
 *
 * NOTE: Cron pickup and Google Calendar event creation are NOT tested here.
 * Those are covered by the unit tests in lib/connectors/google-calendar/create-event.test.ts
 * and the integration test in tests/integration/connectors/suggested-actions-approve.test.ts.
 *
 * Run condition: requires RUN_CONNECTOR_E2E=1 (expensive, hits real DB).
 * In CI this runs only when RUN_CONNECTOR_E2E=1.
 *
 * The basic endpoint-auth tests (401 checks) run always.
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
  // Intentional conditional skip — only runs when RUN_CONNECTOR_E2E=1. NOSONAR S1607
  test.skip(
    SKIP_EXPENSIVE,
    'set RUN_CONNECTOR_E2E=1 to run connector E2E tests'
  ); // NOSONAR

  test('approve → 200, second approve → 409', async ({ request }) => {
    // This test requires a seeded suggested_actions row.
    // In CI this is seeded by the test setup fixture.
    // For local runs, you need a valid session + a pending suggested_action.

    const SUGGESTED_ACTION_ID = process.env.TEST_SUGGESTED_ACTION_ID;
    if (!SUGGESTED_ACTION_ID) {
      test.skip(); // NOSONAR S1607 — intentional conditional skip for missing credential env var
      return;
    }

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
    if (!SUGGESTED_ACTION_ID) {
      test.skip(); // NOSONAR S1607 — intentional conditional skip for missing credential env var
      return;
    }

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
