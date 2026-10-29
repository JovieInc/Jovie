/**
 * CAN-SPAM and stream preflight for one cold email (outreach engine).
 *
 * Fail-closed: every check must pass or the message does not leave. The rules
 * that apply (15 U.S.C. 7704, FTC CAN-SPAM compliance guide):
 * - honest header information: the from name is a real person at Jovie and
 *   the sending domain is the cold stream's own domain, never jov.ie;
 * - no deceptive subject line;
 * - a valid physical postal address (JOV-9648);
 * - a working opt-out, honoured permanently across every stream.
 *
 * The cold domain and the core-domain rule come from the stream registry
 * (lib/email/streams.ts); the caller passes its verdict in so this module has
 * no second copy of that rule.
 */

export const COLD_COMPLIANCE_VERSION = 'cold-compliance/v1';

export interface ColdMessage {
  readonly fromName: string;
  readonly fromAddress: string;
  readonly subject: string;
  readonly body: string;
}

export interface ColdComplianceContext {
  /** Physical postal address for the footer; null until Tim sets it. */
  readonly mailingAddress: string | null;
  /** One-click unsubscribe URL minted for this recipient. */
  readonly unsubscribeUrl: string | null;
  /** The stream registry's verdict on the cold stream. */
  readonly coldStream: {
    readonly domain: string | null;
    /** True when the configured cold domain is jov.ie or a subdomain. */
    readonly onCoreDomain: boolean;
  };
  /** Opted out, bounced or complained on any stream, ever. */
  readonly suppressed: boolean;
  /** Is this a follow-up in an existing thread (a real "Re:")? */
  readonly isFollowUp: boolean;
}

export type ColdComplianceFailure =
  | 'mailing_address_missing'
  | 'unsubscribe_missing'
  | 'cold_stream_closed'
  | 'cold_on_core_domain'
  | 'from_domain_mismatch'
  | 'from_name_not_a_person'
  | 'deceptive_subject'
  | 'recipient_suppressed';

export interface ColdComplianceResult {
  readonly ok: boolean;
  readonly failures: readonly ColdComplianceFailure[];
}

/** A postal address has a number and is long enough to be one. */
export function isPlausibleMailingAddress(value: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return trimmed.length >= 12 && /\d/.test(trimmed);
}

function domainOf(address: string): string | null {
  const match = /@([A-Za-z0-9.-]+\.[A-Za-z]{2,})$/u.exec(address.trim());
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Subjects that misstate the message: fake reply/forward markers on a first
 * touch, transactional or account bait, urgency, and money claims.
 */
const DECEPTIVE_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\b(invoice|receipt|order|payment|refund|account (?:suspended|locked)|password|verify your)\b/i,
  /\b(urgent|final notice|act now|last chance|limited time)\b/i,
  /\b(congratulations|you(?:'ve| have) won|winner)\b/i,
  /\$\s?\d/,
];

export function isDeceptiveSubject(
  subject: string,
  isFollowUp: boolean
): boolean {
  const trimmed = subject.trim();
  if (!trimmed) return true;
  if (!isFollowUp && /^(re|fwd?|fw)\s*:/i.test(trimmed)) return true;
  return DECEPTIVE_SUBJECT_PATTERNS.some(pattern => pattern.test(trimmed));
}

/** A person's name: two to four words, letters only, not a role or brand. */
function isPersonName(fromName: string): boolean {
  const words = fromName.trim().split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  if (!words.every(word => /^[\p{L}'.-]+$/u.test(word))) return false;
  return !/\b(team|support|notifications?|no-?reply|info|admin|billing)\b/i.test(
    fromName
  );
}

export function checkColdCompliance(
  message: ColdMessage,
  context: ColdComplianceContext
): ColdComplianceResult {
  const failures: ColdComplianceFailure[] = [];
  if (!isPlausibleMailingAddress(context.mailingAddress))
    failures.push('mailing_address_missing');
  if (!context.unsubscribeUrl?.startsWith('https://'))
    failures.push('unsubscribe_missing');
  if (!context.coldStream.domain) failures.push('cold_stream_closed');
  if (context.coldStream.onCoreDomain) failures.push('cold_on_core_domain');
  const fromDomain = domainOf(message.fromAddress);
  if (
    context.coldStream.domain &&
    fromDomain !== context.coldStream.domain.toLowerCase()
  )
    failures.push('from_domain_mismatch');
  if (!isPersonName(message.fromName)) failures.push('from_name_not_a_person');
  if (isDeceptiveSubject(message.subject, context.isFollowUp))
    failures.push('deceptive_subject');
  if (context.suppressed) failures.push('recipient_suppressed');
  return { ok: failures.length === 0, failures };
}

/**
 * The footer every cold email carries. Plain text, after Tim's signature.
 * Only rendered once compliance has passed, so both values are present.
 */
export function renderColdFooter(input: {
  readonly mailingAddress: string;
  readonly unsubscribeUrl: string;
}): string {
  return [
    '',
    '--',
    `Jovie, ${input.mailingAddress.trim()}`,
    `Don't want emails like this? ${input.unsubscribeUrl}`,
  ].join('\n');
}
