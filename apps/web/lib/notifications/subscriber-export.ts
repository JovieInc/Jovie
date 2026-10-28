import { z } from 'zod';
import { isArtistEmailOptedIn } from './artist-email';

const emailSchema = z.email();

/** Export only an artist's confirmed email opt-ins. Billing and owner checks are server-side. */
export const subscriberExportRowSchema = z
  .object({
    id: z.string().uuid(),
    email: z.string(),
    name: z.string().nullable(),
    countryCode: z.string().nullable(),
    consentedAt: z.string().datetime(),
  })
  .strict();

export type SubscriberExportRow = z.infer<typeof subscriberExportRowSchema>;

export interface SubscriberExportCandidate {
  readonly id: string;
  readonly email: string | null;
  readonly name: string | null;
  readonly countryCode: string | null;
  readonly channel: string;
  readonly createdAt: Date | string | null;
  readonly confirmedAt: Date | string | null;
  readonly unsubscribedAt: Date | string | null;
  readonly artistEmailOptInAt: Date | string | null;
  readonly artistEmailOptOutAt: Date | string | null;
}

function epoch(value: Date | string | null): number | null {
  if (value === null) return null;
  const result = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(result) ? result : null;
}

/** Prevent spreadsheet formulas without changing stored contact values. */
function exportCell(value: string | null): string | null {
  return value !== null && /^[\s]*[=+\-@]/u.test(value) ? `'${value}` : value;
}

export function buildSubscriberExportRows(
  candidates: readonly SubscriberExportCandidate[],
  blockedEmails: ReadonlySet<string>,
  now: Date,
  selectedIds?: ReadonlySet<string>
): SubscriberExportRow[] {
  if (!Number.isFinite(now.getTime())) return [];
  const result: SubscriberExportRow[] = [];
  const seen = new Set<string>();
  // Consent can change after creation. A later revocation on any normalized
  // duplicate blocks older opt-ins, regardless of which record was created last.
  const latestRevocation = new Map<string, number>();
  for (const row of candidates) {
    const email = row.email?.trim().toLowerCase();
    if (
      row.channel !== 'email' ||
      !email ||
      !emailSchema.safeParse(email).success
    )
      continue;
    for (const revokedAt of [row.artistEmailOptOutAt, row.unsubscribedAt]) {
      if (revokedAt !== null) {
        latestRevocation.set(
          email,
          Math.max(
            latestRevocation.get(email) ?? Number.NEGATIVE_INFINITY,
            epoch(revokedAt) ?? Number.POSITIVE_INFINITY
          )
        );
      }
    }
  }
  const newestConsentFirst = [...candidates].sort(
    (a, b) =>
      (epoch(b.artistEmailOptInAt) ?? Number.NEGATIVE_INFINITY) -
        (epoch(a.artistEmailOptInAt) ?? Number.NEGATIVE_INFINITY) ||
      (epoch(b.createdAt) ?? Number.NEGATIVE_INFINITY) -
        (epoch(a.createdAt) ?? Number.NEGATIVE_INFINITY) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
  for (const row of newestConsentFirst) {
    const email = row.email?.trim().toLowerCase();
    if (
      row.channel !== 'email' ||
      !email ||
      !emailSchema.safeParse(email).success ||
      seen.has(email)
    )
      continue;
    const createdAt = epoch(row.createdAt);
    const confirmedAt = epoch(row.confirmedAt);
    const optInAt = epoch(row.artistEmailOptInAt);
    if (
      createdAt === null ||
      createdAt > now.getTime() ||
      confirmedAt === null ||
      confirmedAt > now.getTime() ||
      optInAt === null ||
      optInAt > now.getTime() ||
      row.unsubscribedAt !== null ||
      !isArtistEmailOptedIn(row.artistEmailOptInAt, row.artistEmailOptOutAt) ||
      optInAt <= (latestRevocation.get(email) ?? Number.NEGATIVE_INFINITY) ||
      blockedEmails.has(email)
    )
      continue;
    // Resolve the current eligible identity before intersecting selected IDs.
    seen.add(email);
    if (selectedIds && !selectedIds.has(row.id)) continue;
    result.push({
      id: row.id,
      email: exportCell(email) ?? '',
      name: exportCell(row.name),
      countryCode: exportCell(row.countryCode),
      consentedAt: new Date(optInAt).toISOString(),
    });
  }
  return result;
}
