import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCronRequest } from '@/lib/cron/auth';
import { env } from '@/lib/env';
import { boundedFetch } from '@/lib/http/bounded-fetch';
import { signSummerBottleneckSnapshot } from '@/lib/ovie/summer-bottleneck-producer';
import { summerProductPathsSchema } from '@/lib/ovie/summer-product-paths';
import { getEveShadowOrigin } from '@/lib/ovie/summer-shadow-client';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVE_BOTTLENECK_PATH = '/ovie/v1/summer-bottleneck/events';
const MAX_BODY_BYTES = 64 * 1024;
const MAX_SIGNAL_AGE_MS = 15 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const SHA = /^[0-9a-f]{40}$/u;
const DIGEST = /^[0-9a-f]{64}$/u;
const JOVIE_PRODUCTION_OIDC_SUBJECT =
  'owner:jovie:project:jovie:environment:production';
const timestamp = z.string().datetime({ offset: true });
const exactSha = z.string().regex(SHA);
const safeCount = z.number().int().nonnegative().safe();

const summerCiImprovementClassIds = [
  'merge-group-flake-baseline-ratchet',
  'controller-cascade-coalescing',
  'auto-enroll-self-cancel-churn',
  'controller-check-run-pagination-cap',
  'obsolete-unaffected-native-lanes',
  'affected-only-unit-selection',
] as const;

const sourceFields = {
  observedAt: timestamp,
  sourceDigest: z.string().regex(DIGEST),
  sourceRevision: exactSha,
};
const runnerAuthority = z
  .object({
    schema: z.enum([
      'symphony-lease-guard-report/v1',
      'symphony-runtime-state/v1',
    ]),
    observedAt: timestamp,
    sourceDigest: z.string().regex(DIGEST),
    sourceRevision: exactSha,
  })
  .strict();

const ciAuditSchema = z
  .object({
    schema: z.literal('jovie-ci-bottleneck-audit/v1'),
    ...sourceFields,
    classes: z
      .array(
        z
          .object({
            id: z.enum(summerCiImprovementClassIds),
            state: z.enum(['open', 'partial', 'implemented']),
            blockedSince: timestamp,
            impact: z.number().int().positive().max(100),
            owner: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:_-]{1,63}$/u),
            handle: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9:#/_-]{1,127}$/u),
          })
          .strict()
      )
      .length(summerCiImprovementClassIds.length),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.classes.map(item => item.id);
    if (
      new Set(ids).size !== summerCiImprovementClassIds.length ||
      summerCiImprovementClassIds.some(id => !ids.includes(id))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'CI audit must contain every improvement class exactly once',
        path: ['classes'],
      });
    }
  });

const unsignedSnapshotSchema = z
  .object({
    schema: z.literal('jovie.eve.summer-bottleneck-snapshot/v1'),
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
    observedAt: timestamp,
    sourceVersion: exactSha,
    signals: z
      .object({
        closure: z
          .object({
            schema: z.literal('jovie.eve.summer-closure-projection/v1'),
            sourceSchema: z.literal('jovie-closure-health/v1'),
            ...sourceFields,
            status: z.enum(['healthy', 'grace', 'red']),
            blockedSince: timestamp.nullable(),
            openPullRequests: safeCount,
          })
          .strict(),
        queue: z
          .object({
            schema: z.literal('jovie.eve.summer-queue-projection/v1'),
            sourceSchema: z.literal('github-merge-queue-entry/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            eligibleCleanPrs: safeCount,
            queuedPrs: safeCount,
          })
          .strict(),
        release: z
          .object({
            schema: z.literal('jovie.eve.summer-release-projection/v1'),
            sourceSchema: z.literal('jovie-controller-snapshot/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            mainSha: exactSha,
            productionSha: exactSha.nullable(),
            unverifiedMerges: safeCount,
          })
          .strict(),
        runner: z
          .object({
            schema: z.literal('jovie.eve.summer-runner-projection/v1'),
            sourceSchema: z.literal('symphony-runner-projection/v1'),
            ...sourceFields,
            blockedSince: timestamp.nullable(),
            capacitySource: runnerAuthority,
            workSource: runnerAuthority,
            capacityAvailable: safeCount.nullable(),
            queuedWork: safeCount.nullable(),
          })
          .strict(),
        ciAudit: ciAuditSchema,
        productPaths: summerProductPathsSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const revisions = [
      value.signals.closure.sourceRevision,
      value.signals.queue.sourceRevision,
      value.signals.release.sourceRevision,
      value.signals.ciAudit.sourceRevision,
      value.signals.release.mainSha,
      ...(value.signals.productPaths
        ? [value.signals.productPaths.sourceRevision]
        : []),
    ];
    if (revisions.some(revision => revision !== value.sourceVersion)) {
      context.addIssue({
        code: 'custom',
        message: 'every projection must bind to the exact snapshot source',
        path: ['sourceVersion'],
      });
    }
    if (
      value.signals.runner.workSource.sourceRevision !==
      value.signals.runner.sourceRevision
    ) {
      context.addIssue({
        code: 'custom',
        message: 'runner work must bind to the runner source revision',
        path: ['signals', 'runner', 'workSource', 'sourceRevision'],
      });
    }
    if (
      value.signals.runner.capacityAvailable !== null &&
      value.signals.runner.capacitySource.schema !==
        'symphony-lease-guard-report/v1'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'runner capacity must bind to lease authority',
        path: ['signals', 'runner', 'capacitySource', 'schema'],
      });
    }
    if (
      value.signals.runner.queuedWork !== null &&
      value.signals.runner.workSource.schema !== 'symphony-runtime-state/v1'
    ) {
      context.addIssue({
        code: 'custom',
        message: 'runner work must bind to Symphony runtime authority',
        path: ['signals', 'runner', 'workSource', 'schema'],
      });
    }
  });

type UnsignedSnapshot = z.infer<typeof unsignedSnapshotSchema>;

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

async function readBoundedJson(
  body: ReadableStream<Uint8Array> | null,
  contentLength: string | null
): Promise<unknown> {
  const declared = Number(contentLength);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new RangeError('body_too_large');
  }
  if (!body) throw new SyntaxError('body_missing');
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new RangeError('body_too_large');
    }
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}

function readInput(request: Request): Promise<unknown> {
  return readBoundedJson(request.body, request.headers.get('content-length'));
}

function hasExpectedProductionSubject(token: string): boolean {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    ) as { sub?: unknown };
    return payload.sub === JOVIE_PRODUCTION_OIDC_SUBJECT;
  } catch {
    return false;
  }
}

function isFresh(snapshot: UnsignedSnapshot, nowMs = Date.now()): boolean {
  if (!Number.isFinite(nowMs)) return false;
  const timestamps = [
    snapshot.observedAt,
    snapshot.signals.closure.observedAt,
    snapshot.signals.queue.observedAt,
    snapshot.signals.release.observedAt,
    snapshot.signals.runner.observedAt,
    snapshot.signals.ciAudit.observedAt,
    snapshot.signals.runner.capacitySource.observedAt,
    snapshot.signals.runner.workSource.observedAt,
  ];
  return timestamps.every(value => {
    const ageMs = nowMs - Date.parse(value);
    return ageMs <= MAX_SIGNAL_AGE_MS && ageMs >= -MAX_CLOCK_SKEW_MS;
  });
}

/** Authenticated Jovie-production bridge for one immutable Summer snapshot. */
export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/internal/ovie/summer-bottleneck',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;

  if (env.VERCEL_ENV !== 'production') {
    return json({ ok: false, code: 'production_origin_required' }, 503);
  }

  let rawInput: unknown;
  try {
    rawInput = await readInput(request);
  } catch (error) {
    const oversized = error instanceof RangeError;
    return json(
      { ok: false, code: oversized ? 'body_too_large' : 'invalid_json' },
      oversized ? 413 : 400
    );
  }

  const parsed = unsignedSnapshotSchema.safeParse(rawInput);
  if (!parsed.success) {
    return json({ ok: false, code: 'invalid_bottleneck_snapshot' }, 422);
  }
  if (!isFresh(parsed.data)) {
    return json({ ok: false, code: 'stale_bottleneck_snapshot' }, 422);
  }
  if (
    !env.VERCEL_GIT_COMMIT_SHA ||
    parsed.data.sourceVersion !== env.VERCEL_GIT_COMMIT_SHA
  ) {
    return json({ ok: false, code: 'invalid_source_revision' }, 409);
  }
  let destination: URL;
  try {
    destination = new URL(EVE_BOTTLENECK_PATH, getEveShadowOrigin());
  } catch {
    return json({ ok: false, code: 'eve_destination_unavailable' }, 503);
  }

  const body = signSummerBottleneckSnapshot(
    parsed.data,
    env.SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY,
    env.SUMMER_BOTTLENECK_PRODUCER_SIGNING_KEY_ID
  );
  if (!body) {
    logger.error('[ovie-summer-bottleneck] Producer signing key unavailable');
    return json({ ok: false, code: 'producer_signing_unavailable' }, 503);
  }

  let oidcToken: string;
  try {
    oidcToken = await getVercelOidcToken();
  } catch {
    logger.error('[ovie-summer-bottleneck] Vercel OIDC token unavailable');
    return json({ ok: false, code: 'signed_origin_unavailable' }, 503);
  }
  if (!oidcToken) {
    return json({ ok: false, code: 'signed_origin_unavailable' }, 503);
  }
  if (!hasExpectedProductionSubject(oidcToken)) {
    return json({ ok: false, code: 'wrong_oidc_audience' }, 503);
  }

  let upstream: Response;
  try {
    // No retry: an uncertain submission is resolved by Eve's immutable event ID.
    upstream = await boundedFetch(destination, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${oidcToken}`,
        'x-vercel-trusted-oidc-idp-token': oidcToken,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      redirect: 'error',
      timeoutMs: 15_000,
      retry: { maxRetries: 0, baseDelayMs: 0 },
      context: 'Summer bottleneck snapshot',
    });
  } catch {
    return json({ ok: false, code: 'eve_bottleneck_unavailable' }, 503);
  }

  if (upstream.status === 409) {
    return json({ ok: false, code: 'replay_rejected' }, 409);
  }
  if (!upstream.ok) {
    logger.error('[ovie-summer-bottleneck] Eve rejected the snapshot', {
      status: upstream.status,
    });
    return json({ ok: false, code: 'eve_bottleneck_rejected' }, 502);
  }

  let upstreamBody: unknown;
  try {
    upstreamBody = await readBoundedJson(
      upstream.body,
      upstream.headers.get('content-length')
    );
  } catch {
    return json({ ok: false, code: 'invalid_eve_response' }, 502);
  }
  const parsedUpstream = z
    .object({
      ok: z.literal(true),
      receipt: z.object({
        eventId: z.literal(parsed.data.eventId),
        decision: z.string().min(1).max(64),
      }),
    })
    .safeParse(upstreamBody);
  if (!parsedUpstream.success) {
    return json({ ok: false, code: 'invalid_eve_response' }, 502);
  }
  return json({ ok: true, eve: parsedUpstream.data }, 202);
}
