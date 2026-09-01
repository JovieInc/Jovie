import { createHash } from 'node:crypto';
import type { SessionAuthContext } from 'eve/context';
import { z } from 'zod';

const MAX_BODY_BYTES = 32 * 1024;
const MAX_EVENT_AGE_MS = 5 * 60 * 1000;
const MAX_CLOCK_SKEW_MS = 60 * 1000;

export const summerShadowEventSchema = z
  .object({
    schema: z.literal('jovie.ovie-summer-shadow.event/v1'),
    eventId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u),
    occurredAt: z.string().datetime({ offset: true }),
    message: z.string().trim().min(1).max(4000),
    evidence: z.array(z.string().url().max(2048)).max(16).default([]),
  })
  .strict();

export type SummerShadowEvent = z.infer<typeof summerShadowEventSchema>;

export type ShadowDeployment = {
  readonly commitSha: string;
  readonly deploymentId: string;
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
    readonly message: string;
    readonly receiptPath: string;
  }) => Promise<{ readonly sessionId: string }>;
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

function eventKey(eventId: string): string {
  return createHash('sha256').update(eventId).digest('hex');
}

export function isSummerShadowEnabled(
  environment: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  return (
    environment.SUMMER_SHADOW_ENABLED?.trim() === 'true' &&
    environment.VERCEL_ENV === 'preview'
  );
}

function deploymentFromEnvironment(): ShadowDeployment {
  const hostname = process.env.VERCEL_URL?.trim();
  return {
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA?.trim() || 'local',
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID?.trim() || 'local',
    url: hostname ? `https://${hostname}` : 'local',
  };
}

export function renderSummerShadowObservation(
  event: SummerShadowEvent
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
    '',
    'Acknowledge the observation concisely. Do not call tools, dispatch work, or mutate Linear, Symphony, GitHub, GBrain, deployments, or permissions.',
  ].join('\n');
}

export function createSummerShadowIngressHandler(
  dependencies: Omit<SummerShadowIngressDependencies, 'deployment' | 'now'> &
    Partial<Pick<SummerShadowIngressDependencies, 'deployment' | 'now'>>
): (request: Request) => Promise<Response> {
  const now = dependencies.now ?? (() => new Date());
  const deployment = dependencies.deployment ?? deploymentFromEnvironment;

  return async request => {
    const auth = await dependencies.authenticate(request);
    if (auth instanceof Response) return auth;
    if (!isSummerShadowEnabled()) {
      return jsonResponse(503, { ok: false, code: 'shadow_disabled' });
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

    const key = eventKey(parsed.data.eventId);
    const receiptPath = `summer-shadow/receipts/${key}.json`;
    const terminalPath = `summer-shadow/terminal/${key}.json`;
    const deploymentReceipt = deployment();
    const authority = {
      mode: 'shadow',
      dispatchAuthority: 'none',
      allowedMutations: [] as const,
    };

    const initialRecord = {
      schema: 'jovie.eve.summer-shadow.receipt/v1',
      verdict: 'accepted_for_eve_dispatch',
      event: parsed.data,
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
        status: 'ready',
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

    let sessionId: string;
    try {
      ({ sessionId } = await dependencies.dispatch({
        auth,
        event: parsed.data,
        eventKey: key,
        message: renderSummerShadowObservation(parsed.data),
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
      eventId: parsed.data.eventId,
      receiptPath,
      sessionId,
      source: 'ovie-summer-shadow',
      identity: 'summer',
      authority,
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
      eventId: parsed.data.eventId,
      receiptPath,
      terminalPath,
      sessionId,
      deployment: deploymentReceipt,
      authority,
    });
  };
}
