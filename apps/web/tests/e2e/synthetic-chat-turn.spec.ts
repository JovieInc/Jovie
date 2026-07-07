/**
 * Production authenticated chat-turn canary (GH #13300).
 *
 * The detector this incident needed: web chat was down for a full day —
 * every message failed with `CHAT_STREAM_FAILED` — while nothing reached
 * Sentry and no synthetic exercised the authenticated `/api/chat` path
 * (existing prod synthetics are all unauthenticated; the onboarding-turn
 * canary now serves a scripted fallback on LLM failure, which masks exactly
 * this class of outage).
 *
 * What it does: mints a short-lived session JWT for a DEDICATED canary user
 * via the Clerk Backend API, POSTs one real message to `/api/chat`, and
 * asserts the SSE stream terminates with a finish part and no error part /
 * CHAT_STREAM_FAILED marker. API-level (no browser page) so it is cheap and
 * Turnstile-free — Turnstile gates onboarding, not the authenticated route.
 *
 * Required env (all in Doppler prd; step is gated in synthetic-monitoring.yml
 * until they are provisioned):
 *  - CLERK_SECRET_KEY                      — prod Clerk backend key (existing)
 *  - E2E_PROD_CHAT_CANARY_USER_ID          — Clerk user id of the canary user
 *  - E2E_PROD_CHAT_CANARY_PROFILE_ID       — that user's creator profile id
 *
 * Cost: one LLM turn per run (every 15 min during business hours). The
 * message asks for a one-word reply to keep tokens minimal.
 *
 * QUARANTINE POLICY: if this spec flakes, do NOT silent-skip it — that
 * recreates the "no test caught it" failure. File an issue and quarantine
 * explicitly.
 *
 * @canary @chat
 */

import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  process.env.BASE_URL ??
  'https://jov.ie';

const CLERK_API_URL = 'https://api.clerk.com/v1';

/** Single bounded budget for the real LLM turn to resolve. */
const TURN_RESOLVE_TIMEOUT = 60_000;

interface ClerkSession {
  readonly id: string;
}

function requiredEnv(): {
  ok: boolean;
  missing: string[];
  clerkSecretKey: string;
  userId: string;
  profileId: string;
} {
  const clerkSecretKey = process.env.CLERK_SECRET_KEY ?? '';
  const userId = process.env.E2E_PROD_CHAT_CANARY_USER_ID ?? '';
  const profileId = process.env.E2E_PROD_CHAT_CANARY_PROFILE_ID ?? '';
  const missing = [
    ...(clerkSecretKey ? [] : ['CLERK_SECRET_KEY']),
    ...(userId ? [] : ['E2E_PROD_CHAT_CANARY_USER_ID']),
    ...(profileId ? [] : ['E2E_PROD_CHAT_CANARY_PROFILE_ID']),
  ];
  return {
    ok: missing.length === 0,
    missing,
    clerkSecretKey,
    userId,
    profileId,
  };
}

async function clerkFetch(
  secretKey: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(`${CLERK_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

test.describe('Authenticated prod chat turn', () => {
  test('one real /api/chat message streams to a finish part without CHAT_STREAM_FAILED', async () => {
    test.setTimeout(120_000);

    const env = requiredEnv();
    if (!env.ok) {
      // The workflow step is variable-gated; missing env here means the gate
      // was enabled before Doppler was provisioned. Fail loudly — a silently
      // skipped canary is the failure mode this spec exists to prevent.
      throw new Error(
        `Chat canary enabled but missing env: ${env.missing.join(', ')}. ` +
          'Provision the canary user secrets in Doppler prd or disable the ' +
          'E2E_PROD_CHAT_CANARY repo variable.'
      );
    }

    // 1. Mint a session + short-lived session JWT for the canary user.
    const sessionRes = await clerkFetch(env.clerkSecretKey, '/sessions', {
      method: 'POST',
      body: JSON.stringify({ user_id: env.userId }),
    });
    expect(
      sessionRes.ok,
      `Clerk session create failed: ${sessionRes.status} ${await sessionRes
        .clone()
        .text()
        .catch(() => '')}`
    ).toBe(true);
    const session = (await sessionRes.json()) as ClerkSession;

    try {
      const tokenRes = await clerkFetch(
        env.clerkSecretKey,
        `/sessions/${session.id}/tokens`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      expect(
        tokenRes.ok,
        `Clerk session token mint failed: ${tokenRes.status}`
      ).toBe(true);
      const { jwt } = (await tokenRes.json()) as { jwt: string };
      expect(typeof jwt, 'Clerk returned no session JWT').toBe('string');

      // 2. Send one minimal real chat turn.
      const clientTurnId = randomUUID();
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        TURN_RESOLVE_TIMEOUT
      );

      let chatRes: Response;
      try {
        chatRes = await fetch(`${BASE_URL}/api/chat`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            profileId: env.profileId,
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
                    text: 'Canary health check: reply with the single word pong. Do not use any tools.',
                  },
                ],
              },
            ],
          }),
        });

        // Kill switch (`ai_chat_disabled`) intentionally 503s all chat
        // traffic — that is an operator decision, not an outage regression.
        if (chatRes.status === 503) {
          const body = await chatRes.text();
          if (body.includes('ai_chat_disabled') || body.includes('disabled')) {
            console.log(
              '[Synthetic][warning] chat canary: /api/chat returned 503 kill-switch; treating as intentional.'
            );
            return;
          }
          throw new Error(`Chat canary got 503 (not kill-switch): ${body}`);
        }

        expect(
          chatRes.ok,
          `Chat canary POST /api/chat failed: ${chatRes.status} ${await chatRes
            .clone()
            .text()
            .catch(() => '')}`
        ).toBe(true);

        // 3. Drain the SSE stream and assert a clean finish.
        const streamText = await chatRes.text();

        expect(
          streamText,
          `Chat stream carried CHAT_STREAM_FAILED (requestId ${chatRes.headers.get('x-request-id')})`
        ).not.toContain('CHAT_STREAM_FAILED');
        expect(streamText, 'Chat stream carried an error part').not.toContain(
          '"type":"error"'
        );
        expect(streamText, 'Chat stream never reached a finish part').toContain(
          '"type":"finish"'
        );
      } finally {
        clearTimeout(timeout);
      }
    } finally {
      // 4. Revoke the canary session (best-effort hygiene).
      await clerkFetch(env.clerkSecretKey, `/sessions/${session.id}/revoke`, {
        method: 'POST',
      }).catch(() => null);
    }
  });
});
