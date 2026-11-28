/**
 * Registry Create Webhook Relay
 *
 * Relays repository creation/rename/transfer and Vercel project creation/rename
 * to the existing company registry checker. Makes no registry decisions.
 * Auth: raw-body HMAC-SHA256 (x-hub-signature-256) or HMAC-SHA1
 * (x-vercel-signature), with separate optional env secrets:
 * REGISTRY_GITHUB_WEBHOOK_SECRET and REGISTRY_VERCEL_WEBHOOK_SECRET.
 * Replay: required GitHub delivery id or Vercel event id, durable Redis lock
 * for 24 hours; Vercel createdAt must be within +/-5 minutes. Max body: 256 KiB.
 * Side effects: one bounded repository_dispatch to JovieInc/ci, event_type
 * resource-created (the type JovieInc/ci resource-drift-scan.yml listens for),
 * client_payload {kind, name} only, using REGISTRY_DISPATCH_TOKEN
 * (never GH_DISPATCH_TOKEN). Missing configuration fails closed.
 * Definite rejection releases the lock; ambiguous timeout retains it for the
 * daily drift cron backstop. No internal retry of the dispatch POST.
 * Linear: JOV-13083; registry: JovieInc/ci canon/resources.json kind webhook entries
 */

import { NextResponse } from 'next/server';
import { defineRoute, publicAccess } from '@/lib/api/route-pipeline';
import { env } from '@/lib/env-server';
import { captureCriticalError } from '@/lib/error-tracking';
import { NO_STORE_HEADERS } from '@/lib/http/headers';
import { ServerFetchTimeoutError, serverFetch } from '@/lib/http/server-fetch';
import { logger } from '@/lib/utils/logger';
import {
  acquireRecentDispatch,
  clearRecentDispatch,
} from '@/lib/webhooks/recent-dispatch';
import {
  extractGithubCreate,
  extractVercelCreate,
} from '@/lib/webhooks/registry-create-event';
import {
  verifyGithubSignature,
  verifyVercelSignature,
} from '@/lib/webhooks/registry-create-signature';

// node:crypto's timingSafeEqual and HMAC require the Node runtime.
export const runtime = 'nodejs';

const ROUTE = '/api/webhooks/registry-create';
const DISPATCH_URL = 'https://api.github.com/repos/JovieInc/ci/dispatches';
const MAX_BODY_BYTES = 256 * 1024;
const DEDUPE_TTL_SECONDS = 24 * 60 * 60;
const MAX_VERCEL_EVENT_AGE_MS = 5 * 60 * 1000;
const DISPATCH_TIMEOUT_MS = 4500;
const GITHUB_DELIVERY_ID = /^[0-9a-f-]{8,64}$/i;

/** Enforce the byte cap while reading, even with no/forged Content-Length. */
async function readRawBody(request: Request): Promise<string | null> {
  const contentLength = request.headers.get('content-length');
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) return null;

  const reader = request.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks, size).toString('utf8');
  } finally {
    reader.releaseLock();
  }
}

// API paths already pass through the proxy without session auth. Provider
// HMAC below supplies auth; no browser CSRF or rate-limit stage consumes it.
export const POST = defineRoute(
  { route: ROUTE, access: publicAccess() },
  async ({ request }) => {
    const githubHeader = request.headers.get('x-hub-signature-256');
    const vercelHeader = request.headers.get('x-vercel-signature');
    const provider = githubHeader !== null ? 'github' : 'vercel';
    const scope = `registry-create-${provider}`;
    let deliveryId: string | null = null;
    let event: ReturnType<
      typeof extractGithubCreate | typeof extractVercelCreate
    > = null;
    let dedupeAcquired = false;

    const respond = (body: Record<string, unknown>, status: number) => {
      logger.info('[Registry Create Webhook] Request completed', {
        provider:
          githubHeader === null && vercelHeader === null ? null : provider,
        kind: event?.kind,
        name: event?.name,
        deliveryId,
        outcome: body.error ?? Object.keys(body).find(key => key !== 'ok'),
        status,
      });
      return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
    };

    if (githubHeader !== null && vercelHeader !== null) {
      return respond({ error: 'ambiguous_provider' }, 400);
    }
    if (githubHeader === null && vercelHeader === null) {
      return respond({ error: 'unsigned' }, 401);
    }

    const webhookSecret =
      provider === 'github'
        ? env.REGISTRY_GITHUB_WEBHOOK_SECRET
        : env.REGISTRY_VERCEL_WEBHOOK_SECRET;
    if (!webhookSecret) {
      logger.warn(
        '[Registry Create Webhook] Provider secret is not configured',
        {
          provider,
        }
      );
      return respond({ error: 'not_configured' }, 503);
    }

    try {
      const rawBody = await readRawBody(request);
      if (rawBody === null) return respond({ error: 'body_too_large' }, 413);
      const validSignature =
        provider === 'github'
          ? verifyGithubSignature(rawBody, githubHeader, webhookSecret)
          : verifyVercelSignature(rawBody, vercelHeader, webhookSecret);
      if (!validSignature) return respond({ error: 'bad_signature' }, 401);

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        // Parser messages may include private body excerpts. Never log them.
        return respond({ error: 'invalid_json' }, 400);
      }

      if (provider === 'github') {
        const id = request.headers.get('x-github-delivery');
        if (!id || !GITHUB_DELIVERY_ID.test(id) || id.trim() !== id) {
          return respond({ error: 'invalid_delivery' }, 400);
        }
        deliveryId = id;
        event = extractGithubCreate(
          request.headers.get('x-github-event'),
          payload
        );
      } else {
        if (
          !payload ||
          typeof payload !== 'object' ||
          !('id' in payload) ||
          typeof payload.id !== 'string' ||
          !payload.id.trim()
        ) {
          return respond({ error: 'invalid_delivery' }, 400);
        }
        if (
          !('createdAt' in payload) ||
          typeof payload.createdAt !== 'number' ||
          !Number.isFinite(payload.createdAt) ||
          Math.abs(Date.now() - payload.createdAt) > MAX_VERCEL_EVENT_AGE_MS
        ) {
          return respond({ error: 'stale' }, 401);
        }
        deliveryId = payload.id;
        event = extractVercelCreate(payload);
      }

      const dispatchToken = env.REGISTRY_DISPATCH_TOKEN;
      if (!dispatchToken) {
        logger.warn(
          '[Registry Create Webhook] REGISTRY_DISPATCH_TOKEN is unset',
          {
            provider,
            deliveryId,
          }
        );
        return respond({ error: 'not_configured' }, 503);
      }

      const dedupe = await acquireRecentDispatch(
        scope,
        deliveryId,
        DEDUPE_TTL_SECONDS
      );
      if (dedupe.reason === 'backend_unavailable') {
        await captureCriticalError(
          'Registry create webhook dedupe backend unavailable',
          new Error('Redis unavailable for webhook dedupe'),
          { route: ROUTE, provider, deliveryId }
        );
        return respond({ error: 'dedupe_unavailable' }, 503);
      }
      if (!dedupe.acquired) return respond({ ok: true, duplicate: true }, 200);
      dedupeAcquired = true;

      if (
        provider === 'github' &&
        request.headers.get('x-github-event') === 'ping'
      ) {
        return respond({ ok: true, pong: true }, 200);
      }
      if (!event) return respond({ ok: true, ignored: true }, 202);

      const result = await serverFetch(DISPATCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dispatchToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          event_type: 'resource-created',
          client_payload: { kind: event.kind, name: event.name },
        }),
        redirect: 'error',
        timeoutMs: DISPATCH_TIMEOUT_MS,
        context: 'GitHub repository dispatch for registry create webhook',
      });
      if (!result.ok) {
        logger.error('[Registry Create Webhook] GitHub dispatch rejected', {
          provider,
          ...event,
          deliveryId,
          status: result.status,
        });
        await clearRecentDispatch(scope, deliveryId);
        return respond({ error: 'dispatch_failed' }, 502);
      }
      return respond({ ok: true, dispatched: true }, 202);
    } catch (error) {
      const timedOut = error instanceof ServerFetchTimeoutError;
      // A timeout may have reached GitHub: hold the lock for daily drift
      // reconciliation. Definite transport failures can be redelivered.
      if (!timedOut && dedupeAcquired && deliveryId) {
        await clearRecentDispatch(scope, deliveryId);
      }
      await captureCriticalError(
        timedOut
          ? 'Registry create webhook dispatch timed out'
          : 'Registry create webhook processing failed',
        new Error(
          timedOut ? 'Dispatch timed out' : 'Webhook processing failed'
        ),
        { route: ROUTE, provider, deliveryId, ...event }
      );
      return respond(
        { error: timedOut ? 'dispatch_timeout' : 'processing_failed' },
        timedOut ? 504 : 500
      );
    }
  }
);
