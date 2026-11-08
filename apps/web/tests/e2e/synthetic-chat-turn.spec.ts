/**
 * Production authenticated chat-turn canary (GH #13300, JOV-9822).
 *
 * The detector this incident needed: web chat was down for a full day —
 * every message failed with `CHAT_STREAM_FAILED` — while nothing reached
 * Sentry and no synthetic exercised the authenticated `/api/chat` path.
 *
 * What it does: signs the sanctioned production canary in through Better
 * Auth's own email-OTP endpoints (the OTP is read from `ba_verifications`,
 * the same source the post-deploy auth smoke uses; no inbox, no vendor SDK),
 * POSTs one real message to `/api/chat`, and asserts the SSE stream
 * terminates with a finish part and no error part / CHAT_STREAM_FAILED
 * marker. API-level (no browser page), so it is cheap. The session is signed
 * out at the end.
 *
 * Required env (Doppler jovie-web/prd):
 *  - DATABASE_URL         — read-only OTP and profile lookup
 *
 * Identity: the dedicated chat-health canary
 * (`PRODCERT_CHAT_HEALTH_CANARY_EMAIL`), not the returning-creator canary, so
 * health checks never consume the golden-path walk's weekly AI quota. The
 * server skips the weekly quota for exactly that session email.
 *
 * Clerk is retired: this spec used to mint a Clerk Backend API session.
 *
 * Cost: one LLM turn per run. The message asks for a one-word reply.
 *
 * QUARANTINE POLICY: if this spec flakes, do NOT silent-skip it — that
 * recreates the "no test caught it" failure. File an issue and quarantine
 * explicitly.
 *
 * @canary @chat
 */

import { randomUUID } from 'node:crypto';
import { neon } from '@neondatabase/serverless';
import { expect, request as playwrightRequest, test } from '@playwright/test';
import { PRODCERT_CHAT_HEALTH_CANARY_EMAIL } from '@/lib/synthetic/prodcert-identities';
import { waitForProductionAuthOtp } from './utils/production-auth-otp';

test.use({ storageState: { cookies: [], origins: [] } });

const BASE_URL =
  process.env.PLAYWRIGHT_TEST_BASE_URL ??
  process.env.BASE_URL ??
  'https://jov.ie';

/** Single bounded budget for the real LLM turn to resolve. */
const TURN_RESOLVE_TIMEOUT = 60_000;

async function canaryProfileId(
  databaseUrl: string,
  email: string
): Promise<string> {
  const rows = (await neon(databaseUrl)`
    SELECT cp.id
    FROM creator_profiles cp
    JOIN users u ON u.id = cp.user_id
    WHERE lower(u.email) = ${email.trim().toLowerCase()}
      AND u.deleted_at IS NULL
    ORDER BY cp.created_at ASC
    LIMIT 1
  `) as { id: string }[];
  if (!rows[0]) throw new Error('The production canary owns no profile.');
  return rows[0].id;
}

test.describe('Authenticated prod chat turn', () => {
  test('one real /api/chat message streams to a finish part without CHAT_STREAM_FAILED', async () => {
    test.setTimeout(120_000);

    const databaseUrl = process.env.DATABASE_URL ?? '';
    if (!databaseUrl) {
      // Fail loudly — a silently skipped canary is the failure mode this
      // spec exists to prevent.
      throw new Error(
        'Chat canary needs DATABASE_URL from Doppler jovie-web/prd.'
      );
    }
    const email = PRODCERT_CHAT_HEALTH_CANARY_EMAIL;
    const origin = new URL(BASE_URL).origin;
    const api = await playwrightRequest.newContext({
      baseURL: origin,
      extraHTTPHeaders: { origin, 'x-synthetic-monitoring': 'chat-canary' },
    });

    try {
      // 1. Better Auth email OTP sign-in for the canary only.
      const requestedAtMs = Date.now();
      const send = await api.post('/api/auth/email-otp/send-verification-otp', {
        data: { email, type: 'sign-in' },
      });
      expect(send.ok(), `OTP send failed: HTTP ${send.status()}`).toBe(true);
      const otp = await waitForProductionAuthOtp({
        email,
        startedAtMs: requestedAtMs,
      });
      const signIn = await api.post('/api/auth/sign-in/email-otp', {
        data: { email, otp },
      });
      expect(signIn.ok(), `OTP sign-in failed: HTTP ${signIn.status()}`).toBe(
        true
      );

      // 2. Send one minimal real chat turn.
      const profileId = await canaryProfileId(databaseUrl, email);
      const clientTurnId = randomUUID();
      const chatRes = await api.post('/api/chat', {
        timeout: TURN_RESOLVE_TIMEOUT,
        data: {
          profileId,
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
        },
      });

      // Kill switch (`ai_chat_disabled`) intentionally 503s all chat
      // traffic — that is an operator decision, not an outage regression.
      if (chatRes.status() === 503) {
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
        chatRes.ok(),
        `Chat canary POST /api/chat failed: ${chatRes.status()}`
      ).toBe(true);

      // 3. Drain the SSE stream and assert a clean finish.
      const streamText = await chatRes.text();
      const requestId = chatRes.headers()['x-request-id'];
      expect(
        streamText,
        `Chat stream carried CHAT_STREAM_FAILED (requestId ${requestId})`
      ).not.toContain('CHAT_STREAM_FAILED');
      expect(streamText, 'Chat stream carried an error part').not.toContain(
        '"type":"error"'
      );
      expect(streamText, 'Chat stream never reached a finish part').toContain(
        '"type":"finish"'
      );
    } finally {
      // 4. End the canary session (best-effort hygiene).
      await api.post('/api/auth/sign-out', { data: {} }).catch(() => null);
      await api.dispose();
    }
  });
});
