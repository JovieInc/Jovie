/**
 * Email stream registry (JOV email-sending-streams, 2026-10-29).
 *
 * Every outbound email belongs to exactly one stream. Streams exist so a
 * reputation problem in one (cold outreach, a bad lifecycle send) cannot burn
 * the domain that carries sign-in codes and receipts, or jov.ie itself, which
 * hosts the team's Google Workspace mail.
 *
 *   transactional  receipts, sign-in codes, dunning, system notifications
 *   lifecycle      product updates and changelog mail to opted-in subscribers
 *   founder        1:1 plain-text mail from Tim to existing users
 *   cold           outreach to people who never opted in; never on jov.ie
 *
 * Sending domains come from env so a stream moves without a deploy of code:
 * set the variable after the domain is verified at the provider. Defaults keep
 * today's behaviour (everything on send.jov.ie) until that happens.
 * Decision: gbrain decisions/company/email-sending-streams-2026-10-29.
 */

export const EMAIL_STREAMS = [
  'transactional',
  'lifecycle',
  'founder',
  'cold',
] as const;
export type EmailStream = (typeof EMAIL_STREAMS)[number];

/** The core domain and everything under it. */
export const CORE_DOMAIN = 'jov.ie';

/** Env var that overrides each stream's sending domain. */
export const STREAM_DOMAIN_ENV: Record<EmailStream, string> = {
  transactional: 'EMAIL_STREAM_TRANSACTIONAL_DOMAIN',
  lifecycle: 'EMAIL_STREAM_LIFECYCLE_DOMAIN',
  founder: 'EMAIL_STREAM_FOUNDER_DOMAIN',
  cold: 'EMAIL_STREAM_COLD_DOMAIN',
};

/** Defaults preserve current production behaviour. Cold has none by design. */
export const DEFAULT_STREAM_DOMAIN: Record<EmailStream, string | null> = {
  transactional: 'send.jov.ie',
  lifecycle: 'send.jov.ie',
  founder: 'send.jov.ie',
  cold: null,
};

/** Target separation once notify.jov.ie is verified in Resend. */
export const TARGET_STREAM_DOMAIN: Record<EmailStream, string | null> = {
  transactional: 'send.jov.ie',
  lifecycle: 'notify.jov.ie',
  founder: 'notify.jov.ie',
  cold: null,
};

/** Providers whose terms permit each stream. Resend forbids unsolicited mail. */
export const PROVIDER_STREAMS = {
  resend: ['transactional', 'lifecycle', 'founder'],
  'cloudflare-email': ['transactional'],
  // Cold-capable tools. Not wired yet; named so the guard has one vocabulary.
  instantly: ['cold'],
  smartlead: ['cold'],
} as const satisfies Record<string, readonly EmailStream[]>;
export type EmailProviderName = keyof typeof PROVIDER_STREAMS;

/** Deliverability ceilings per stream, as fractions (not percents). */
export const STREAM_THRESHOLDS: Record<
  EmailStream,
  { bounceRate: number; complaintRate: number }
> = {
  // Resend AUP: complaints < 0.08%, bounces < 4%.
  transactional: { bounceRate: 0.02, complaintRate: 0.0008 },
  lifecycle: { bounceRate: 0.02, complaintRate: 0.0008 },
  founder: { bounceRate: 0.03, complaintRate: 0.0008 },
  // Cold tools tolerate more bounce; Google's hard line is 0.3% spam.
  cold: { bounceRate: 0.03, complaintRate: 0.001 },
};

export function normalizeDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^@/, '').replace(/\.$/, '');
}

export function isCoreDomain(domain: string): boolean {
  const d = normalizeDomain(domain);
  return d === CORE_DOMAIN || d.endsWith(`.${CORE_DOMAIN}`);
}

/** `Name <a@b.c>` or `a@b.c` to `b.c`; null when there is no address. */
export function senderDomainOf(from: string | null | undefined): string | null {
  if (!from) return null;
  const match = /@([A-Za-z0-9.-]+\.[A-Za-z]{2,})>?\s*$/u.exec(from.trim());
  return match?.[1] ? normalizeDomain(match[1]) : null;
}

export type StreamEnv = Record<string, string | undefined>;

export function getStreamDomain(
  stream: EmailStream,
  source: StreamEnv = process.env
): string | null {
  const configured = source[STREAM_DOMAIN_ENV[stream]]?.trim();
  if (configured) return normalizeDomain(configured);
  return DEFAULT_STREAM_DOMAIN[stream];
}

export interface StreamViolation {
  stream: EmailStream;
  rule: 'cold-on-core-domain' | 'cold-without-domain';
  domain: string | null;
}

/**
 * Hard rules. Cold mail never uses jov.ie or any subdomain of it. A cold
 * domain that is unset is not a violation of this rule: it means the stream is
 * closed, and `requireStreamDomain` refuses to send.
 */
export function findHardViolations(
  source: StreamEnv = process.env
): StreamViolation[] {
  const cold = getStreamDomain('cold', source);
  return cold && isCoreDomain(cold)
    ? [{ stream: 'cold', rule: 'cold-on-core-domain', domain: cold }]
    : [];
}

/**
 * Separation status. Not a hard failure: it reports whether lifecycle and
 * founder mail still share a domain (and so a reputation) with transactional.
 */
export function separationGaps(
  source: StreamEnv = process.env
): { stream: EmailStream; sharesWith: EmailStream; domain: string }[] {
  const tx = getStreamDomain('transactional', source);
  const gaps: {
    stream: EmailStream;
    sharesWith: EmailStream;
    domain: string;
  }[] = [];
  for (const stream of ['lifecycle', 'founder'] as const) {
    const domain = getStreamDomain(stream, source);
    if (domain && tx && domain === tx) {
      gaps.push({ stream, sharesWith: 'transactional', domain });
    }
  }
  return gaps;
}

/** Throws unless `stream` has a usable sending domain. */
export function requireStreamDomain(
  stream: EmailStream,
  source: StreamEnv = process.env
): string {
  const violations = findHardViolations(source);
  if (stream === 'cold' && violations.length > 0) {
    throw new Error(
      `Cold email stream may not use ${violations[0]?.domain}: cold outreach never uses ${CORE_DOMAIN} or its subdomains.`
    );
  }
  const domain = getStreamDomain(stream, source);
  if (!domain) {
    throw new Error(
      `Email stream "${stream}" has no sending domain. Set ${STREAM_DOMAIN_ENV[stream]}.`
    );
  }
  return domain;
}

export function isProviderAllowedForStream(
  provider: EmailProviderName,
  stream: EmailStream
): boolean {
  return (PROVIDER_STREAMS[provider] as readonly EmailStream[]).includes(
    stream
  );
}

/** Which stream a sender address belongs to, by configured domain. */
export function streamForSenderDomain(
  domain: string,
  source: StreamEnv = process.env
): EmailStream | 'unknown' {
  const d = normalizeDomain(domain);
  // Most specific first: a domain shared by several streams reports the
  // strictest (transactional) so the metric is conservative.
  for (const stream of [
    'transactional',
    'lifecycle',
    'founder',
    'cold',
  ] as const) {
    if (getStreamDomain(stream, source) === d) return stream;
  }
  return 'unknown';
}
