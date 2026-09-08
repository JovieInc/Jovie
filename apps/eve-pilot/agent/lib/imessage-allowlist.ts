/**
 * Tim-only iMessage admission for the Ovie Eve door.
 *
 * Portable Photon credentials only. No Vercel Connect.
 * An empty allowlist fails closed.
 */

const ALLOWLIST_ENV = 'OVIE_IMESSAGE_ALLOWED_SENDERS';

export function parseOvieIMessageAllowedSenders(
  raw = process.env[ALLOWLIST_ENV]
): ReadonlySet<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(/[,\n]+/)
      .map(id => id.replace(/[^\d+]/g, ''))
      .filter(Boolean)
  );
}

export type IMessageAdmissionAuthor = {
  readonly handle?: string;
  readonly id?: string;
  readonly isBot?: boolean;
  readonly phone?: string;
  readonly userId?: string;
};

function digits(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.replace(/[^\d+]/g, '');
  return normalized || undefined;
}

export function admitOvieIMessage(
  author: IMessageAdmissionAuthor | undefined,
  allowed?: ReadonlySet<string>,
  rawAllowedSenders?: string
): boolean {
  const resolvedAllowed =
    allowed ?? parseOvieIMessageAllowedSenders(rawAllowedSenders);
  if (resolvedAllowed.size === 0) return false;
  if (!author || author.isBot) return false;
  const candidates = [author.phone, author.handle, author.id, author.userId]
    .map(digits)
    .filter((value): value is string => Boolean(value));
  return candidates.some(value => resolvedAllowed.has(value));
}
