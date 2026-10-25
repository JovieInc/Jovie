/**
 * Production Ovie Home composer canary (P0 2026-10-25).
 *
 * Tim's first Home message failed with "Summer didn't finish that reply"
 * (summer_deployment_unverified) because the founder conversation was wedged
 * behind one unreadable turn. Nothing paged. This canary sends one real
 * OV-mode message to /api/chat exactly like the Home composer and asserts the
 * stream carries Summer text and a finish part, no error part and no
 * data-summer-failure marker.
 *
 * Auth: mints a short-lived Clerk session JWT for the founder user (Clerk
 * Backend API), like synthetic-chat-turn. Required env (Doppler prd):
 *  - CLERK_SECRET_KEY
 *  - E2E_PROD_SUMMER_CANARY_CLERK_USER_ID  (founder Clerk user id)
 * The message is a fixed one-liner; it appears in the founder Summer history.
 *
 * QUARANTINE POLICY: never silent-skip; file an issue and quarantine.
 *
 * @canary @summer
 */

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  process.env.BASE_URL ??
  'https://jov.ie';
const CLERK_API_URL = 'https://api.clerk.com/v1';
const TURN_RESOLVE_TIMEOUT = 100_000;

function clerkFetch(secretKey: string, path: string, init?: RequestInit) {
  return fetch(`${CLERK_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

export function assertSummerStreamHealthy(
  streamText: string,
  requestId: string | null
) {
  expect(
    streamText,
    `Summer stream carried a failure marker (requestId ${requestId}): ${streamText.slice(0, 400)}`
  ).not.toContain('data-summer-failure');
  expect(streamText, 'Summer stream carried an error part').not.toContain(
    '"type":"error"'
  );
  expect(streamText, 'Summer stream carried no text').toContain(
    '"type":"text-delta"'
  );
  expect(streamText, 'Summer stream never reached a finish part').toContain(
    '"type":"finish"'
  );
}

test.describe('Prod Ovie Home composer to Summer', () => {
  test('one OV message streams a Summer reply to a finish part', async () => {
    test.setTimeout(150_000);
    const secretKey = process.env.CLERK_SECRET_KEY ?? '';
    const userId = process.env.E2E_PROD_SUMMER_CANARY_CLERK_USER_ID ?? '';
    if (!secretKey || !userId) {
      throw new Error(
        'Summer canary enabled but CLERK_SECRET_KEY or E2E_PROD_SUMMER_CANARY_CLERK_USER_ID is missing. Provision Doppler prd or disable the E2E_PROD_SUMMER_CANARY repo variable.'
      );
    }
    const sessionRes = await clerkFetch(secretKey, '/sessions', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
    expect(
      sessionRes.ok,
      `Clerk session create failed: ${sessionRes.status}`
    ).toBe(true);
    const session = (await sessionRes.json()) as { id: string };
    try {
      const tokenRes = await clerkFetch(
        secretKey,
        `/sessions/${session.id}/tokens`,
        {
          method: 'POST',
          body: JSON.stringify({}),
        }
      );
      expect(tokenRes.ok, `Clerk token mint failed: ${tokenRes.status}`).toBe(
        true
      );
      const { jwt } = (await tokenRes.json()) as { jwt: string };

      const clientTurnId = randomUUID();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TURN_RESOLVE_TIMEOUT);
      try {
        const res = await fetch(`${BASE_URL}/api/chat`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            chatMode: 'ov',
            clientTurnId,
            clientMessageId: clientTurnId,
            source: 'typed',
            messages: [
              {
                id: clientTurnId,
                role: 'user',
                parts: [
                  {
                    type: 'text',
                    text: 'Canary: reply with the single word pong.',
                  },
                ],
              },
            ],
          }),
        });
        expect(res.ok, `POST /api/chat (ov) failed: ${res.status}`).toBe(true);
        assertSummerStreamHealthy(
          await res.text(),
          res.headers.get('x-request-id')
        );
      } finally {
        clearTimeout(timer);
      }
    } finally {
      await clerkFetch(secretKey, `/sessions/${session.id}/revoke`, {
        method: 'POST',
      }).catch(() => null);
    }
  });
});
