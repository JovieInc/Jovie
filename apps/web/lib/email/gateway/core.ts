/**
 * Gateway orchestration with injected dependencies, so contract tests can run
 * every rule without a database, Redis or Resend. Production wiring lives in
 * ./index.ts. Rule contract: docs/company/email-sending-streams.md.
 */
import type { EmailStream, StreamEnv } from '../streams';
import {
  decideRuntime,
  type GatewayRejectCode,
  type GatewaySkipCode,
  prepareStreamEmail,
  type RuntimeFacts,
  type StreamEmailRequest,
  type SuppressionFact,
} from './policy';
import type { EmailTransport } from './resend-transport';

export type StreamSendResult =
  | {
      readonly status: 'sent';
      readonly stream: EmailStream;
      readonly messageId: string | null;
      readonly from: string;
    }
  | {
      readonly status: 'skipped';
      readonly stream: EmailStream;
      readonly code:
        | GatewaySkipCode
        | 'provider-not-configured'
        | 'reserved-test-recipient';
      readonly detail: string;
    }
  | {
      readonly status: 'rejected';
      readonly stream: EmailStream;
      readonly code: GatewayRejectCode;
      readonly detail: string;
    }
  | {
      readonly status: 'error';
      readonly stream: EmailStream;
      readonly error: string;
    };

export interface GatewayDeps {
  readonly env: StreamEnv;
  readonly mailingAddress: string | null;
  readonly entityName: string;
  readonly transport: EmailTransport;
  testRecipientBlock(to: string): string | null;
  readPause(stream: EmailStream): Promise<{ reason: string } | null>;
  cardStatus(cardId: string): Promise<RuntimeFacts['approval']>;
  suppression(to: string): Promise<SuppressionFact>;
  /** True when this send would exceed the stream's hourly limit (consumes a slot). */
  rateLimited(stream: EmailStream, perHour: number): Promise<boolean>;
  /** One structured line per decision: stream, purpose, outcome, duration. */
  record(event: {
    readonly stream: EmailStream;
    readonly purpose: string;
    readonly outcome: StreamSendResult['status'];
    readonly code?: string;
    readonly ms: number;
    readonly fromDomain?: string;
  }): void;
  /** Called for rejections: a caller asked for something the registry forbids. */
  onViolation(error: Error, context: Record<string, unknown>): void;
}

export async function runGateway(
  request: StreamEmailRequest,
  deps: GatewayDeps,
  now: () => number = Date.now
): Promise<StreamSendResult> {
  const started = now();
  const stream = request.stream;
  const done = (result: StreamSendResult, fromDomain?: string) => {
    deps.record({
      stream,
      purpose: request.purpose,
      outcome: result.status,
      ...('code' in result && { code: result.code }),
      ms: now() - started,
      ...(fromDomain && { fromDomain }),
    });
    if (result.status === 'rejected') {
      deps.onViolation(
        new Error(`email-gateway rejected (${result.code}): ${result.detail}`),
        { stream, purpose: request.purpose, code: result.code }
      );
    }
    return result;
  };

  const prepared = prepareStreamEmail(request, deps.env, {
    mailingAddress: deps.mailingAddress,
    entityName: deps.entityName,
  });
  if (!prepared.ok) {
    return done({
      status: 'rejected',
      stream,
      code: prepared.code,
      detail: prepared.detail,
    });
  }
  const email = prepared.email;

  const testBlock = deps.testRecipientBlock(email.to);
  if (testBlock) {
    return done(
      {
        status: 'skipped',
        stream,
        code: 'reserved-test-recipient',
        detail: testBlock,
      },
      email.fromDomain
    );
  }

  const [paused, approval, suppression] = await Promise.all([
    email.policy.pausable ? deps.readPause(stream) : Promise.resolve(null),
    email.policy.approval === 'summer-card' && request.approval?.cardId
      ? deps.cardStatus(request.approval.cardId)
      : Promise.resolve<RuntimeFacts['approval']>('not-required'),
    deps.suppression(email.to),
  ]);
  const preRate = decideRuntime(email, {
    paused,
    approval,
    suppression,
    rateLimited: false,
  });
  if (!preRate.ok) {
    return done(
      preRate.kind === 'skip'
        ? {
            status: 'skipped',
            stream,
            code: preRate.code,
            detail: preRate.detail,
          }
        : {
            status: 'rejected',
            stream,
            code: preRate.code,
            detail: preRate.detail,
          },
      email.fromDomain
    );
  }
  if (await deps.rateLimited(stream, email.policy.rateLimit.perHour)) {
    return done(
      {
        status: 'skipped',
        stream,
        code: 'rate-limited',
        detail: `the ${stream} stream is over ${email.policy.rateLimit.perHour}/hour`,
      },
      email.fromDomain
    );
  }

  if (!deps.transport.configured()) {
    return done(
      {
        status: 'skipped',
        stream,
        code: 'provider-not-configured',
        detail: `${deps.transport.name} is not configured`,
      },
      email.fromDomain
    );
  }

  const sent = await deps.transport.send(email);
  return done(
    sent.ok
      ? { status: 'sent', stream, messageId: sent.messageId, from: email.from }
      : { status: 'error', stream, error: sent.error },
    email.fromDomain
  );
}
