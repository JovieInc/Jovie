/**
 * Email stream registry, typed. The data lives in stream-registry.json (one
 * source of truth, read by the gateway, the CI guard and the deliverability
 * loop); this module only types it and answers questions about it.
 *
 * Every outbound email belongs to exactly one stream so a reputation problem
 * in one (a bad broadcast, cold outreach) cannot burn the domain that carries
 * sign-in codes and receipts, or jov.ie itself, which hosts Google Workspace.
 * Decision: gbrain decisions/company/email-sending-streams-2026-10-29.
 */
import registry from './stream-registry.json';

export const EMAIL_STREAMS = [
  'transactional',
  'lifecycle',
  'founder',
  'broadcast',
  'inbox',
  'cold',
] as const;
export type EmailStream = (typeof EMAIL_STREAMS)[number];

export const CONSENT_BASES = [
  'auth-request',
  'account-transaction',
  'opt-in',
  'artist-request',
  'account-relationship',
  'existing-relationship',
  'inbound-reply',
  'legitimate-interest',
] as const;
export type ConsentBasis = (typeof CONSENT_BASES)[number];

export type SuppressionScope = 'all' | 'delivery';
export type EmailProviderName = keyof typeof registry.providers;

export interface StreamThresholds {
  /** Fractions, not percents. Above `*Rate`: incident. Above `*Pause`: pause. */
  readonly bounceRate: number;
  readonly bounceRatePause: number;
  readonly complaintRate: number;
  readonly complaintRatePause: number;
}

export interface StreamPolicy {
  readonly status: 'open' | 'closed';
  readonly closedReason?: string;
  readonly description: string;
  readonly provider: EmailProviderName | null;
  readonly fromDomain: string | null;
  readonly fromDomainEnv: string;
  readonly targetFromDomain?: string;
  readonly fromLocalPart: string | null;
  readonly fromLocalPartOverride: boolean;
  readonly defaultFromName: string;
  readonly fromNameOverride: boolean;
  readonly replyTo: string | null;
  readonly replyToOverride: boolean;
  readonly consentBases: readonly ConsentBasis[];
  readonly requiredHeaders: readonly string[];
  readonly requirePostalAddress: boolean;
  readonly suppression: SuppressionScope;
  readonly rateLimit: { readonly perHour: number };
  readonly approval: 'none' | 'summer-card';
  readonly pausable: boolean;
  readonly thresholds: StreamThresholds;
}

export interface EmailStreamRegistry {
  readonly schema: string;
  readonly coreDomain: string;
  readonly mailingAddressEnv: string;
  readonly providers: Record<
    EmailProviderName,
    {
      readonly status: 'live' | 'not-approved';
      readonly hosts: readonly string[];
      readonly streams: readonly EmailStream[];
    }
  >;
  readonly streams: Record<EmailStream, StreamPolicy>;
  readonly deliverability: {
    readonly windowDays: number;
    readonly minSample: number;
    readonly forge: {
      readonly status: string;
      readonly readyWhen: {
        readonly minDeliveredPerStream: number;
        readonly maxBounceRate: number;
        readonly maxComplaintRate: number;
      };
    };
  };
}

export const EMAIL_STREAM_REGISTRY = registry as unknown as EmailStreamRegistry;

/** The core domain; cold mail never uses it or any subdomain. */
export const CORE_DOMAIN = EMAIL_STREAM_REGISTRY.coreDomain;

export function isEmailStream(value: unknown): value is EmailStream {
  return (
    typeof value === 'string' &&
    (EMAIL_STREAMS as readonly string[]).includes(value)
  );
}

export function streamPolicy(
  stream: EmailStream,
  source: EmailStreamRegistry = EMAIL_STREAM_REGISTRY
): StreamPolicy {
  return source.streams[stream];
}

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

/** The stream's sending domain: env override (after verification), else registry. */
export function getStreamDomain(
  stream: EmailStream,
  source: StreamEnv = process.env,
  reg: EmailStreamRegistry = EMAIL_STREAM_REGISTRY
): string | null {
  const policy = streamPolicy(stream, reg);
  const configured = source[policy.fromDomainEnv]?.trim();
  if (configured) return normalizeDomain(configured);
  return policy.fromDomain;
}

export interface StreamViolation {
  readonly stream: EmailStream;
  readonly rule:
    | 'cold-on-core-domain'
    | 'cold-on-transactional-provider'
    | 'provider-not-allowed';
  readonly detail: string;
}

/**
 * Registry and environment rules that must always hold. Cold mail never uses
 * jov.ie or a subdomain, and never a provider whose terms forbid it.
 */
export function findHardViolations(
  source: StreamEnv = process.env,
  reg: EmailStreamRegistry = EMAIL_STREAM_REGISTRY
): StreamViolation[] {
  const out: StreamViolation[] = [];
  const cold = getStreamDomain('cold', source, reg);
  if (cold && isCoreDomain(cold)) {
    out.push({
      stream: 'cold',
      rule: 'cold-on-core-domain',
      detail: `cold domain ${cold} is ${CORE_DOMAIN} or a subdomain of it`,
    });
  }
  const coldProvider = streamPolicy('cold', reg).provider;
  if (coldProvider === 'resend') {
    out.push({
      stream: 'cold',
      rule: 'cold-on-transactional-provider',
      detail: 'cold may not use the Resend transactional account',
    });
  }
  for (const stream of Object.keys(reg.streams) as EmailStream[]) {
    const provider = streamPolicy(stream, reg).provider;
    if (!provider) continue;
    const allowed = reg.providers[provider]?.streams ?? [];
    if (!allowed.includes(stream)) {
      out.push({
        stream,
        rule: 'provider-not-allowed',
        detail: `${provider} does not permit the ${stream} stream`,
      });
    }
  }
  return out;
}

/** Streams that still share a domain (and so a reputation) with transactional. */
export function separationGaps(
  source: StreamEnv = process.env
): { stream: EmailStream; sharesWith: EmailStream; domain: string }[] {
  const tx = getStreamDomain('transactional', source);
  const gaps: {
    stream: EmailStream;
    sharesWith: EmailStream;
    domain: string;
  }[] = [];
  for (const stream of ['lifecycle', 'founder', 'broadcast'] as const) {
    const domain = getStreamDomain(stream, source);
    if (domain && tx && domain === tx) {
      gaps.push({ stream, sharesWith: 'transactional', domain });
    }
  }
  return gaps;
}

/**
 * The stream a sender domain belongs to, for provider events that carry no
 * `stream` tag. A domain shared by several streams reports the first match
 * (transactional), so the attribution is conservative.
 */
export function streamForSenderDomain(
  domain: string,
  source: StreamEnv = process.env
): EmailStream | 'unknown' {
  const d = normalizeDomain(domain);
  for (const stream of EMAIL_STREAMS) {
    if (getStreamDomain(stream, source) === d) return stream;
  }
  return 'unknown';
}

/** The stream's default sender address, e.g. `notifications@send.jov.ie`. */
export function streamFromEmail(
  stream: EmailStream,
  source: StreamEnv = process.env
): string | null {
  const policy = streamPolicy(stream);
  const domain = getStreamDomain(stream, source);
  if (!domain || !policy.fromLocalPart) return null;
  return `${policy.fromLocalPart}@${domain}`;
}
