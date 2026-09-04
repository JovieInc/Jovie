import { createHash, sign } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyCronRequest } from '@/lib/cron/auth';
import { env } from '@/lib/env';
import { logger } from '@/lib/utils/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EVE_BOTTLENECK_ORIGIN =
  'https://jovie-eve-shadow-qj7qmxggt-jovie.vercel.app';
const JOVIE_PRODUCTION_SUBJECT =
  'owner:jovie:project:jovie:environment:production';
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store' } as const;
const SHA = /^[0-9a-f]{40}$/u;
const KEY_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$/u;

const inputSchema = z
  .object({
    audience: z.literal('internal-summer-governance-canary'),
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
    observedAt: z.string().datetime({ offset: true }),
    sourceVersion: z.string().regex(SHA),
  })
  .strict();

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function json(body: Readonly<Record<string, unknown>>, status: number) {
  return NextResponse.json(body, { status, headers: NO_STORE_HEADERS });
}

function oidcSubject(token: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')
    ) as { sub?: unknown };
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

function digest(label: string, sourceVersion: string): string {
  return createHash('sha256')
    .update(`${label}\0${sourceVersion}`)
    .digest('hex');
}

function snapshot(input: z.infer<typeof inputSchema>) {
  const source = (label: string) => ({
    observedAt: input.observedAt,
    sourceDigest: digest(label, input.sourceVersion),
    sourceRevision: input.sourceVersion,
  });
  return {
    schema: 'jovie.eve.summer-bottleneck-snapshot/v1',
    eventId: input.eventId,
    observedAt: input.observedAt,
    sourceVersion: input.sourceVersion,
    signals: {
      closure: {
        schema: 'jovie.eve.summer-closure-projection/v1',
        sourceSchema: 'jovie-closure-health/v1',
        ...source('closure'),
        status: 'healthy',
        blockedSince: null,
        openPullRequests: 0,
      },
      queue: {
        schema: 'jovie.eve.summer-queue-projection/v1',
        sourceSchema: 'github-merge-queue-entry/v1',
        ...source('queue'),
        blockedSince: null,
        eligibleCleanPrs: 0,
        queuedPrs: 0,
      },
      release: {
        schema: 'jovie.eve.summer-release-projection/v1',
        sourceSchema: 'jovie-controller-snapshot/v1',
        ...source('release'),
        blockedSince: input.observedAt,
        mainSha: input.sourceVersion,
        productionSha: null,
        unverifiedMerges: 1,
      },
      runner: {
        schema: 'jovie.eve.summer-runner-projection/v1',
        sourceSchema: 'symphony-lease-guard-report/v1',
        ...source('runner'),
        blockedSince: null,
        capacityAvailable: 0,
        queuedWork: 0,
      },
      ciAudit: {
        schema: 'jovie-ci-bottleneck-audit/v1',
        ...source('ci-audit'),
        classes: [
          'merge-group-flake-baseline-ratchet',
          'controller-cascade-coalescing',
          'auto-enroll-self-cancel-churn',
          'controller-check-run-pagination-cap',
          'obsolete-unaffected-native-lanes',
          'affected-only-unit-selection',
        ].map((id, index) => ({
          id,
          state: 'implemented',
          blockedSince: input.observedAt,
          impact: index + 1,
          owner: 'summer-canary',
          handle: `canary:${index}`,
        })),
      },
    },
  } as const;
}

export async function POST(request: Request): Promise<NextResponse> {
  const authError = verifyCronRequest(request, {
    route: '/api/internal/ovie/summer-bottleneck',
    requireTrustedOrigin: true,
  });
  if (authError) return authError;
  if (env.VERCEL_ENV !== 'production') {
    return json({ ok: false, code: 'production_origin_required' }, 503);
  }

  let parsed: z.infer<typeof inputSchema>;
  try {
    const result = inputSchema.safeParse(await request.json());
    if (!result.success) return json({ ok: false, code: 'invalid_event' }, 422);
    parsed = result.data;
  } catch {
    return json({ ok: false, code: 'invalid_json' }, 400);
  }

  const deployedSource = env.VERCEL_GIT_COMMIT_SHA;
  const age = Date.now() - Date.parse(parsed.observedAt);
  if (
    !deployedSource ||
    parsed.sourceVersion !== deployedSource ||
    age < -60_000 ||
    age > 15 * 60_000
  ) {
    return json({ ok: false, code: 'stale_or_wrong_source' }, 409);
  }

  const privateKey = env.SUMMER_BOTTLENECK_PRODUCER_SIGNING_PRIVATE_KEY;
  const keyId = env.SUMMER_BOTTLENECK_PRODUCER_SIGNING_KEY_ID;
  if (!privateKey || !keyId || !KEY_ID.test(keyId)) {
    return json({ ok: false, code: 'producer_signer_unavailable' }, 503);
  }

  let oidcToken: string;
  try {
    oidcToken = await getVercelOidcToken();
  } catch {
    return json({ ok: false, code: 'production_oidc_unavailable' }, 503);
  }
  if (oidcSubject(oidcToken) !== JOVIE_PRODUCTION_SUBJECT) {
    return json({ ok: false, code: 'wrong_oidc_audience' }, 503);
  }

  const unsigned = snapshot(parsed);
  let signature: string;
  try {
    signature = sign(
      null,
      Buffer.from(
        `jovie.eve.summer-bottleneck-snapshot/v1\0${canonical(unsigned)}`
      ),
      privateKey
    ).toString('base64url');
  } catch {
    return json({ ok: false, code: 'producer_signer_invalid' }, 503);
  }

  let upstream: Response;
  try {
    upstream = await fetch(
      new URL('/ovie/v1/summer-bottleneck/events', EVE_BOTTLENECK_ORIGIN),
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${oidcToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...unsigned,
          producerAttestation: { algorithm: 'Ed25519', keyId, signature },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
  } catch {
    return json({ ok: false, code: 'eve_bottleneck_unavailable' }, 503);
  }

  const body = await upstream.json().catch(() => null);
  if (upstream.status === 409) {
    return json({ ok: false, code: 'replay_rejected', eve: body }, 409);
  }
  if (!upstream.ok) {
    logger.error('[summer-bottleneck] Eve rejected signed producer event', {
      status: upstream.status,
    });
    return json({ ok: false, code: 'eve_bottleneck_rejected' }, 502);
  }
  return json({ ok: true, eve: body }, 202);
}
