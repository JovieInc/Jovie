import { createHash } from 'node:crypto';
import type { SessionAuthContext } from 'eve/context';
import { z } from 'zod';
import {
  projectSummerCommercial,
  summerCommercialSnapshotSchema,
} from './summer-commercial-projection';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_EVENT_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;
export const SUMMER_SHADOW_MAX_TURNS_PER_SESSION = 5;
export const SUMMER_SHADOW_MAX_TURNS_PER_UTC_DAY = 25;

export const summerShadowEventSchema = z
  .object({
    schema: z.literal('jovie.ovie-summer-shadow.event/v1'),
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
    conversationId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
    turn: z.number().int().min(1).max(SUMMER_SHADOW_MAX_TURNS_PER_SESSION),
    dailySlot: z.number().int().min(1).max(SUMMER_SHADOW_MAX_TURNS_PER_UTC_DAY),
    occurredAt: z.string().datetime({ offset: true }),
    message: z.string().trim().min(1).max(4000),
    evidence: z.array(z.string().url().max(2048)).max(16).default([]),
    requestedCapability: z.literal('core_chat').optional(),
    commercialSnapshot: summerCommercialSnapshotSchema.optional(),
  })
  .strict();

export type SummerShadowEvent = z.infer<typeof summerShadowEventSchema>;

export type ShadowDeployment = {
  readonly commitSha: string;
  readonly deploymentId: string;
  readonly environment: string;
  readonly url: string;
};

export type ShadowRecord = Readonly<Record<string, unknown>>;

export type SummerShadowIngressDependencies = {
  readonly authenticate: (
    request: Request
  ) => Promise<SessionAuthContext | Response>;
  readonly dispatch: (input: {
    readonly auth: SessionAuthContext;
    readonly event: SummerShadowEvent;
    readonly eventKey: string;
    readonly conversationKey: string;
    readonly message: string;
    readonly receiptPath: string;
  }) => Promise<{ readonly sessionId: string }>;
  readonly enabled: () => boolean;
  readonly now: () => Date;
  readonly persistImmutable: (
    pathname: string,
    record: ShadowRecord
  ) => Promise<'created' | 'exists'>;
  readonly deployment: () => ShadowDeployment;
};

class BodyTooLargeError extends Error {
  constructor() {
    super('request body exceeds the shadow ingress limit');
    this.name = 'BodyTooLargeError';
  }
}

function jsonResponse(
  status: number,
  body: Readonly<Record<string, unknown>>
): Response {
  return Response.json(body, {
    status,
    headers: {
      'cache-control': 'no-store',
    },
  });
}

async function readBoundedBody(request: Request): Promise<string> {
  const declaredLength = request.headers.get('content-length');
  if (
    declaredLength &&
    Number.isFinite(Number(declaredLength)) &&
    Number(declaredLength) > MAX_BODY_BYTES
  ) {
    throw new BodyTooLargeError();
  }

  if (!request.body) return '';

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    body += decoder.decode(value, { stream: true });
  }

  return body + decoder.decode();
}

export function summerShadowKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function isSummerShadowEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  const vercelEnv = environment.VERCEL_ENV;
  return (
    environment.SUMMER_SHADOW_ENABLED?.trim() === 'true' &&
    (vercelEnv === 'preview' || vercelEnv === 'production')
  );
}

function deploymentFromEnvironment(): ShadowDeployment {
  const hostname = process.env.VERCEL_URL?.trim();
  return {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'local',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID?.trim() || 'local',
    environment: process.env.VERCEL_ENV?.trim() || 'local',
    url: hostname ? `https://${hostname}` : 'local',
  };
}

export function renderSummerShadowObservation(
  event: SummerShadowEvent,
  commercialProjection?: ReturnType<typeof projectSummerCommercial>
): string {
  const evidence = event.evidence.length
    ? event.evidence.map(item => `- ${item}`).join('\n')
    : '- none supplied';

  return [
    'Summer shadow observation from the signed Ovie production surface.',
    '',
    `Event: ${event.eventId}`,
    `Occurred at: ${event.occurredAt}`,
    '',
    event.message,
    '',
    'Evidence:',
    evidence,
    ...(commercialProjection
      ? [
          'Read-only commercial decision for this evidence snapshot (not a latest-state assertion):',
          JSON.stringify(commercialProjection),
          'Report the selected recommendation or hold and its unknowns. Treat source records as producer reports, not independently verified facts. Do not infer salary affordability, spending permission, or demand from capacity.',
        ]
      : []),
    '',
    event.requestedCapability
      ? `Call exactly jovie_capability_manifest once with capability ${event.requestedCapability}, then acknowledge the read-only result. Do not call any other tool.`
      : 'Acknowledge the observation concisely. Do not call tools.',
    'Never dispatch work or mutate Linear, Symphony, GitHub, GBrain, deployments, permissions, or any external system.',
  ].join('\n');
}

export function createSummerShadowIngressHandler(
  dependencies: Omit<
    SummerShadowIngressDependencies,
    'deployment' | 'enabled' | 'now'
  > &
    Partial<
      Pick<SummerShadowIngressDependencies, 'deployment' | 'enabled' | 'now'>
    >
): (request: Request) => Promise<Response> {
  const now = dependencies.now ?? (() => new Date());
  const deployment = dependencies.deployment ?? deploymentFromEnvironment;
  const enabled = dependencies.enabled ?? isSummerShadowEnabled;

  return async request => {
    const auth = await dependencies.authenticate(request);
    if (auth instanceof Response) return auth;
    if (!enabled()) {
      return jsonResponse(503, {
        ok: false,
        code: 'shadow_disabled',
      });
    }

    let rawBody: string;
    try {
      rawBody = await readBoundedBody(request);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return jsonResponse(413, {
          ok: false,
          code: 'body_too_large',
        });
      }
      throw error;
    }

    let input: unknown;
    try {
      input = JSON.parse(rawBody);
    } catch {
      return jsonResponse(400, {
        ok: false,
        code: 'invalid_json',
      });
    }

    const parsed = summerShadowEventSchema.safeParse(input);
    if (!parsed.success) {
      return jsonResponse(422, {
        ok: false,
        code: 'invalid_event',
      });
    }

    const acceptedAt = now();
    const occurredAtMs = Date.parse(parsed.data.occurredAt);
    const ageMs = acceptedAt.getTime() - occurredAtMs;
    if (ageMs > MAX_EVENT_AGE_MS || ageMs < -MAX_CLOCK_SKEW_MS) {
      return jsonResponse(422, {
        ok: false,
        code: 'event_outside_freshness_window',
      });
    }

    const key = summerShadowKey(parsed.data.eventId);
    const conversationKey = summerShadowKey(parsed.data.conversationId);
    const utcDay = acceptedAt.toISOString().slice(0, 10);
    const receiptPath = `summer-shadow/receipts/${key}.json`;
    const terminalPath = `summer-shadow/terminal/${key}.json`;
    const sessionBudgetPath = `summer-shadow/budgets/session/${conversationKey}/turn-${parsed.data.turn}.json`;
    const dailyBudgetPath = `summer-shadow/budgets/daily/${utcDay}/slot-${parsed.data.dailySlot}.json`;
    const deploymentReceipt = deployment();
    const commercialProjection = parsed.data.commercialSnapshot
      ? projectSummerCommercial(parsed.data.commercialSnapshot, acceptedAt)
      : undefined;
    const authority = {
      mode: 'shadow',
      dispatchAuthority: 'none',
      allowedMutations: [] as const,
    };

    const initialRecord = {
      schema: 'jovie.eve.summer-shadow.receipt/v1',
      verdict: 'accepted_for_budget_reservation',
      event: parsed.data,
      ...(commercialProjection ? { commercialProjection } : {}),
      source: {
        surface: 'ovie',
        source: 'ovie-summer-shadow',
        verifiedBy: 'vercel-oidc',
        subject: auth.subject,
        principalId: auth.principalId,
      },
      authority,
      outbox: {
        destination: 'eve-session',
        kind: 'summer-shadow-observation',
        status: 'pending_budget_reservation',
      },
      budget: {
        conversationId: parsed.data.conversationId,
        turn: parsed.data.turn,
        dailySlot: parsed.data.dailySlot,
        maxTurnsPerSession: SUMMER_SHADOW_MAX_TURNS_PER_SESSION,
        maxTurnsPerUtcDay: SUMMER_SHADOW_MAX_TURNS_PER_UTC_DAY,
        sessionBudgetPath,
        dailyBudgetPath,
      },
      deployment: deploymentReceipt,
      acceptedAt: acceptedAt.toISOString(),
    } satisfies ShadowRecord;

    let initialWrite: 'created' | 'exists';
    try {
      initialWrite = await dependencies.persistImmutable(
        receiptPath,
        initialRecord
      );
    } catch {
      return jsonResponse(503, {
        ok: false,
        code: 'receipt_persistence_failed',
      });
    }

    if (initialWrite === 'exists') {
      return jsonResponse(409, {
        ok: false,
        code: 'replay_rejected',
        eventId: parsed.data.eventId,
      });
    }

    const budgetRecord = {
      schema: 'jovie.eve.summer-shadow.budget-reservation/v1',
      eventId: parsed.data.eventId,
      conversationId: parsed.data.conversationId,
      turn: parsed.data.turn,
      dailySlot: parsed.data.dailySlot,
      utcDay,
      authority,
      deployment: deploymentReceipt,
      reservedAt: acceptedAt.toISOString(),
    } satisfies ShadowRecord;

    let sessionBudgetWrite: 'created' | 'exists';
    try {
      sessionBudgetWrite = await dependencies.persistImmutable(
        sessionBudgetPath,
        budgetRecord
      );
    } catch {
      return jsonResponse(503, {
        ok: false,
        code: 'budget_persistence_failed',
        receiptPath,
      });
    }
    if (sessionBudgetWrite === 'exists') {
      return jsonResponse(429, {
        ok: false,
        code: 'session_budget_rejected',
        receiptPath,
      });
    }

    let dailyBudgetWrite: 'created' | 'exists';
    try {
      dailyBudgetWrite = await dependencies.persistImmutable(
        dailyBudgetPath,
        budgetRecord
      );
    } catch {
      return jsonResponse(503, {
        ok: false,
        code: 'budget_persistence_failed',
        receiptPath,
      });
    }
    if (dailyBudgetWrite === 'exists') {
      return jsonResponse(429, {
        ok: false,
        code: 'daily_budget_rejected',
        receiptPath,
      });
    }

    let sessionId: string;
    try {
      ({ sessionId } = await dependencies.dispatch({
        auth,
        event: parsed.data,
        eventKey: key,
        conversationKey,
        message: renderSummerShadowObservation(
          parsed.data,
          commercialProjection
        ),
        receiptPath,
      }));
    } catch {
      return jsonResponse(503, {
        ok: false,
        code: 'eve_dispatch_failed',
        receiptPath,
      });
    }

    const terminalRecord = {
      schema: 'jovie.eve.summer-shadow.terminal/v1',
      verdict: 'eve_session_accepted',
      ...(commercialProjection
        ? { commercialEvidenceDigest: commercialProjection.evidenceDigest }
        : {}),
      eventId: parsed.data.eventId,
      receiptPath,
      sessionId,
      source: 'ovie-summer-shadow',
      identity: 'summer',
      authority,
      budget: {
        conversationId: parsed.data.conversationId,
        turn: parsed.data.turn,
        dailySlot: parsed.data.dailySlot,
        maxTurnsPerSession: SUMMER_SHADOW_MAX_TURNS_PER_SESSION,
        maxTurnsPerUtcDay: SUMMER_SHADOW_MAX_TURNS_PER_UTC_DAY,
        sessionBudgetPath,
        dailyBudgetPath,
      },
      outbox: {
        destination: 'eve-session',
        status: 'accepted',
      },
      mutations: [] as const,
      deployment: deploymentReceipt,
      acceptedAt: acceptedAt.toISOString(),
      terminalAt: now().toISOString(),
    } satisfies ShadowRecord;

    let terminalWrite: 'created' | 'exists';
    try {
      terminalWrite = await dependencies.persistImmutable(
        terminalPath,
        terminalRecord
      );
    } catch {
      return jsonResponse(503, {
        ok: false,
        code: 'terminal_persistence_failed',
        receiptPath,
        sessionId,
      });
    }

    if (terminalWrite === 'exists') {
      return jsonResponse(503, {
        ok: false,
        code: 'terminal_receipt_conflict',
        receiptPath,
        sessionId,
      });
    }

    return jsonResponse(202, {
      ok: true,
      ...(commercialProjection ? { commercialProjection } : {}),
      eventId: parsed.data.eventId,
      receiptPath,
      terminalPath,
      sessionId,
      conversationId: parsed.data.conversationId,
      turn: parsed.data.turn,
      deployment: deploymentReceipt,
      authority,
      budget: {
        maxTurnsPerSession: SUMMER_SHADOW_MAX_TURNS_PER_SESSION,
        maxTurnsPerUtcDay: SUMMER_SHADOW_MAX_TURNS_PER_UTC_DAY,
        sessionBudgetPath,
        dailyBudgetPath,
      },
    });
  };
}
