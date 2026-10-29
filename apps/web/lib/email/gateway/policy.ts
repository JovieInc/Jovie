/**
 * Send gateway policy: pure decisions, no I/O. The gateway (./index.ts)
 * gathers the facts (pause state, suppression, approval card, rate limit)
 * and this module decides. Contract tests drive it directly.
 *
 * Order matters and is fixed:
 *   1. static: stream known and open, provider permitted, domain rules,
 *      consent basis, sender, required headers, postal address, approval given
 *   2. runtime: stream not paused, approval card approved, recipient not
 *      suppressed, stream under its rate limit
 */
import {
  type ConsentBasis,
  type EmailStream,
  findHardViolations,
  getStreamDomain,
  isCoreDomain,
  isEmailStream,
  type StreamEnv,
  type StreamPolicy,
  streamPolicy,
} from '../streams';

export interface EmailAttachmentInput {
  readonly filename: string;
  readonly content: string;
  readonly contentType?: string;
}

export interface StreamEmailRequest {
  readonly stream: EmailStream;
  /** Why this message exists (`auth-otp`, `dunning-payment-failed`). Tagged on provider events. */
  readonly purpose: string;
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  /** The basis on which this person may receive this stream. */
  readonly consent: {
    readonly basis: ConsentBasis;
    readonly evidence?: string;
  };
  /** Display name only; the address always comes from the registry. */
  readonly fromName?: string;
  /** Local part, only for streams whose registry entry allows it (inbox). */
  readonly fromLocalPart?: string;
  readonly replyTo?: string;
  readonly cc?: readonly string[];
  readonly headers?: Readonly<Record<string, string>>;
  readonly attachments?: readonly EmailAttachmentInput[];
  readonly idempotencyKey?: string;
  /** The approved Ovie outbound card, for streams that require one. */
  readonly approval?: { readonly cardId: string };
}

export type GatewayRejectCode =
  | 'unknown-stream'
  | 'stream-closed'
  | 'cold-on-core-domain'
  | 'provider-not-allowed'
  | 'no-sending-domain'
  | 'consent-missing'
  | 'consent-basis-not-allowed'
  | 'from-not-allowed'
  | 'reply-to-not-allowed'
  | 'required-header-missing'
  | 'postal-address-missing'
  | 'approval-missing'
  | 'approval-not-approved';

export type GatewaySkipCode =
  | 'stream-paused'
  | 'approval-pending'
  | 'suppressed'
  | 'rate-limited';

export interface PreparedEmail {
  readonly stream: EmailStream;
  readonly policy: StreamPolicy;
  readonly from: string;
  readonly fromDomain: string;
  readonly replyTo: string | undefined;
  readonly to: string;
  readonly cc: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html: string | undefined;
  readonly headers: Readonly<Record<string, string>>;
  readonly tags: readonly { name: string; value: string }[];
  readonly attachments: readonly EmailAttachmentInput[];
  readonly idempotencyKey: string | undefined;
}

export type StaticDecision =
  | { readonly ok: true; readonly email: PreparedEmail }
  | {
      readonly ok: false;
      readonly code: GatewayRejectCode;
      readonly detail: string;
    };

export class EmailPolicyError extends Error {
  constructor(
    readonly code: GatewayRejectCode,
    detail: string
  ) {
    super(`email-gateway rejected (${code}): ${detail}`);
    this.name = 'EmailPolicyError';
  }
}

const reject = (code: GatewayRejectCode, detail: string): StaticDecision => ({
  ok: false,
  code,
  detail,
});

function sanitizeName(value: string): string {
  return value
    .replaceAll(/["<>\r\n]/g, '')
    .trim()
    .slice(0, 64);
}

const LOCAL_PART = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const TAG_VALUE = /[^A-Za-z0-9_-]/g;

function headerPresent(
  headers: Readonly<Record<string, string>> | undefined,
  name: string
): boolean {
  if (!headers) return false;
  const wanted = name.toLowerCase();
  return Object.entries(headers).some(
    ([key, value]) => key.toLowerCase() === wanted && value.trim().length > 0
  );
}

function withPostalFooter(
  text: string,
  html: string | undefined,
  identity: string,
  address: string
): { text: string; html: string | undefined } {
  const nextText = text.includes(address) ? text : `${text}\n\n--\n${identity}`;
  if (!html || html.includes(address)) return { text: nextText, html };
  const footer = `<p style="margin:12px 0 0;font-size:11px;color:#999;text-align:center;">${identity
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')}</p>`;
  const nextHtml = html.includes('</body>')
    ? html.replace('</body>', `${footer}</body>`)
    : `${html}${footer}`;
  return { text: nextText, html: nextHtml };
}

/**
 * Everything decidable from the request, the registry and the environment.
 * A rejection here is a programming or configuration error: the caller asked
 * for something the registry forbids.
 */
export function prepareStreamEmail(
  request: StreamEmailRequest,
  env: StreamEnv,
  options: {
    readonly mailingAddress: string | null;
    readonly entityName: string;
  }
): StaticDecision {
  if (!isEmailStream(request.stream)) {
    return reject(
      'unknown-stream',
      `"${String(request.stream)}" is not a registered stream (apps/web/lib/email/stream-registry.json)`
    );
  }
  const stream = request.stream;
  const policy = streamPolicy(stream);

  if (stream === 'cold') {
    const violation = findHardViolations(env).find(v => v.stream === 'cold');
    if (violation) return reject('cold-on-core-domain', violation.detail);
  }
  if (policy.status !== 'open') {
    return reject(
      'stream-closed',
      `the ${stream} stream is closed. ${policy.closedReason ?? ''}`.trim()
    );
  }
  const violation = findHardViolations(env).find(v => v.stream === stream);
  if (violation) return reject('provider-not-allowed', violation.detail);

  const domain = getStreamDomain(stream, env);
  if (!domain || !policy.provider) {
    return reject(
      'no-sending-domain',
      `the ${stream} stream has no sending domain or provider; set ${policy.fromDomainEnv} after verifying the domain`
    );
  }
  if (stream === 'cold' && isCoreDomain(domain)) {
    return reject('cold-on-core-domain', `cold may not send from ${domain}`);
  }

  if (!request.consent?.basis) {
    return reject(
      'consent-missing',
      `${stream} sends must state a consent basis (${policy.consentBases.join(', ')})`
    );
  }
  if (!policy.consentBases.includes(request.consent.basis)) {
    return reject(
      'consent-basis-not-allowed',
      `consent basis "${request.consent.basis}" is not valid for ${stream} (allowed: ${policy.consentBases.join(', ')})`
    );
  }

  let localPart = policy.fromLocalPart;
  if (request.fromLocalPart !== undefined) {
    if (
      !policy.fromLocalPartOverride ||
      !LOCAL_PART.test(request.fromLocalPart)
    ) {
      return reject(
        'from-not-allowed',
        `the ${stream} stream does not take a sender local part "${request.fromLocalPart}"`
      );
    }
    localPart = request.fromLocalPart.toLowerCase();
  }
  if (!localPart) {
    return reject(
      'from-not-allowed',
      `the ${stream} stream needs a sender local part`
    );
  }
  if (request.fromName !== undefined && !policy.fromNameOverride) {
    return reject(
      'from-not-allowed',
      `the ${stream} stream always sends as "${policy.defaultFromName}"`
    );
  }
  const name = sanitizeName(request.fromName ?? policy.defaultFromName);
  const fromEmail = `${localPart}@${domain}`;
  const from = name ? `${name} <${fromEmail}>` : fromEmail;

  if (request.replyTo !== undefined && !policy.replyToOverride) {
    return reject(
      'reply-to-not-allowed',
      `the ${stream} stream always replies to ${policy.replyTo ?? fromEmail}`
    );
  }
  const replyTo = request.replyTo ?? policy.replyTo ?? undefined;

  for (const header of policy.requiredHeaders) {
    if (!headerPresent(request.headers, header)) {
      return reject(
        'required-header-missing',
        `${stream} sends need a ${header} header (one-click unsubscribe, RFC 8058)`
      );
    }
  }

  let text = request.text;
  let html = request.html;
  if (policy.requirePostalAddress) {
    const address = options.mailingAddress?.trim();
    if (!address) {
      return reject(
        'postal-address-missing',
        `${stream} sends need a physical mailing address (CAN-SPAM); set LEGAL_MAILING_ADDRESS (JOV-9648)`
      );
    }
    ({ text, html } = withPostalFooter(
      text,
      html,
      `${options.entityName}, ${address}`,
      address
    ));
  }

  if (policy.approval === 'summer-card' && !request.approval?.cardId) {
    return reject(
      'approval-missing',
      `${stream} sends need an approved Ovie outbound card (approval.cardId)`
    );
  }

  const purpose =
    request.purpose.replace(TAG_VALUE, '_').slice(0, 64) || 'unspecified';
  return {
    ok: true,
    email: {
      stream,
      policy,
      from,
      fromDomain: domain,
      replyTo,
      to: request.to,
      cc: request.cc ?? [],
      subject: request.subject,
      text,
      html,
      headers: { ...(request.headers ?? {}) },
      tags: [
        { name: 'stream', value: stream },
        { name: 'purpose', value: purpose },
      ],
      attachments: request.attachments ?? [],
      idempotencyKey: request.idempotencyKey,
    },
  };
}

export type SuppressionFact =
  | { readonly suppressed: false }
  | { readonly suppressed: true; readonly reason: string };

/** Suppression reasons that block every stream, including transactional. */
export const DELIVERY_BLOCKING_REASONS = new Set([
  'hard_bounce',
  'invalid_address',
  'abuse',
  'legal',
]);

export interface RuntimeFacts {
  readonly paused: { readonly reason: string } | null;
  readonly approval:
    | 'approved'
    | 'pending'
    | 'rejected'
    | 'missing'
    | 'not-required';
  readonly suppression: SuppressionFact;
  readonly rateLimited: boolean;
}

export type RuntimeDecision =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly kind: 'skip';
      readonly code: GatewaySkipCode;
      readonly detail: string;
    }
  | {
      readonly ok: false;
      readonly kind: 'reject';
      readonly code: GatewayRejectCode;
      readonly detail: string;
    };

export function decideRuntime(
  email: PreparedEmail,
  facts: RuntimeFacts
): RuntimeDecision {
  if (facts.paused && email.policy.pausable) {
    return {
      ok: false,
      kind: 'skip',
      code: 'stream-paused',
      detail: `the ${email.stream} stream is paused: ${facts.paused.reason}`,
    };
  }
  if (email.policy.approval === 'summer-card') {
    if (facts.approval === 'pending') {
      return {
        ok: false,
        kind: 'skip',
        code: 'approval-pending',
        detail: 'the Ovie outbound card is still pending',
      };
    }
    if (facts.approval !== 'approved') {
      return {
        ok: false,
        kind: 'reject',
        code: 'approval-not-approved',
        detail: `the Ovie outbound card is ${facts.approval}`,
      };
    }
  }
  if (facts.suppression.suppressed) {
    const reason = facts.suppression.reason;
    const blocks =
      email.policy.suppression === 'all' ||
      DELIVERY_BLOCKING_REASONS.has(reason);
    if (blocks) {
      return {
        ok: false,
        kind: 'skip',
        code: 'suppressed',
        detail: `recipient suppressed (${reason})`,
      };
    }
  }
  if (facts.rateLimited) {
    return {
      ok: false,
      kind: 'skip',
      code: 'rate-limited',
      detail: `the ${email.stream} stream is over ${email.policy.rateLimit.perHour}/hour`,
    };
  }
  return { ok: true };
}
