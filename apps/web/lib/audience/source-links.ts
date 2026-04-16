import { and, eq, gte } from 'drizzle-orm';
import type { DbOrTransaction } from '@/lib/db';
import {
  audienceActions,
  audienceSourceLinks,
} from '@/lib/db/schema/analytics';
import { logger } from '@/lib/utils/logger';
import { validateSocialLinkUrl } from '@/lib/utils/url-validation';
import { slugify } from '@/lib/utm/build-url';

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 8;

function randomCodeSegment(length: number): string {
  let result = '';
  const cryptoObject = globalThis.crypto;
  const alphabetLength = CODE_ALPHABET.length;
  const maxValidByte = 256 - (256 % alphabetLength);

  while (result.length < length) {
    const randomValues = new Uint8Array(length);
    cryptoObject.getRandomValues(randomValues);

    for (const value of randomValues) {
      if (value >= maxValidByte) continue;
      result += CODE_ALPHABET[value % alphabetLength];
      if (result.length === length) break;
    }
  }

  return result;
}

export function buildSourceLinkCode(seed?: string | null): string {
  const prefix = seed ? slugify(seed).slice(0, 18) : '';
  const suffix = randomCodeSegment(CODE_LENGTH);
  return prefix ? `${prefix}-${suffix}` : suffix;
}

export async function createUniqueSourceLinkCode(
  tx: DbOrTransaction,
  seed?: string | null
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = buildSourceLinkCode(seed);
    const [existing] = await tx
      .select({ id: audienceSourceLinks.id })
      .from(audienceSourceLinks)
      .where(eq(audienceSourceLinks.code, code))
      .limit(1);

    if (!existing) return code;
  }

  logger.warn(
    '[source-links] Seeded code generation exhausted, trying seedless fallback',
    {
      seed,
      attempts: 5,
    }
  );

  const fallbackCode = buildSourceLinkCode(null);
  const [existingFallback] = await tx
    .select({ id: audienceSourceLinks.id })
    .from(audienceSourceLinks)
    .where(eq(audienceSourceLinks.code, fallbackCode))
    .limit(1);

  if (!existingFallback) {
    return fallbackCode;
  }

  throw new Error(
    'Unable to generate a unique source link code after 6 attempts'
  );
}

export function appendSourceUtmParams(
  destinationUrl: string,
  utmParams: Record<string, string | undefined> | null | undefined
): string {
  const url = new URL(destinationUrl);
  if (!utmParams) return url.toString();

  for (const [key, value] of Object.entries(utmParams)) {
    if (!value) continue;
    const normalizedKey = key.startsWith('utm_') ? key : `utm_${key}`;
    url.searchParams.set(normalizedKey, value);
  }

  return url.toString();
}

export function isSafeAudienceSourceDestinationUrl(url: string): boolean {
  return validateSocialLinkUrl(url).valid;
}

export async function isRecentSourceScanDuplicate(
  tx: DbOrTransaction,
  params: {
    readonly audienceMemberId: string;
    readonly sourceLinkId: string;
    readonly since: Date;
  }
): Promise<boolean> {
  const [existing] = await tx
    .select({ id: audienceActions.id })
    .from(audienceActions)
    .where(
      and(
        eq(audienceActions.audienceMemberId, params.audienceMemberId),
        eq(audienceActions.sourceLinkId, params.sourceLinkId),
        eq(audienceActions.eventType, 'source_scanned'),
        gte(audienceActions.timestamp, params.since)
      )
    )
    .limit(1);

  return Boolean(existing);
}
