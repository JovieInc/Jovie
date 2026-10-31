import 'server-only';

import { createHash } from 'node:crypto';
import { desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { musicResolverReceipts } from '@/lib/db/schema/music-resolver';
import {
  lookupAppleMusicByIsrc,
  lookupDeezerByIsrc,
  lookupSpotifyByIsrc,
} from '@/lib/discography/provider-links';
import { captureError } from '@/lib/error-tracking';
import { scheduleAfter } from '@/lib/next/schedule-after';
import { logger } from '@/lib/utils/logger';
import type { InHouseResolution } from './in-house-contracts';
import {
  type ParitySummary,
  type ShadowReceipt,
  summarizeShadowParity,
} from './parity-summary';

/**
 * Event-driven parity on real resolves (JOV-7323 loop).
 *
 * For a sampled resolved track, every in-house link that was NOT itself
 * derived from the ISRC (MusicBrainz URL relations, exact-name search) is
 * checked against each provider's own ISRC lookup. ISRC-derived links are left
 * out of the comparison: checking them against the same lookup would be
 * self-agreement, not evidence. A disagreement fires the false-link alarm on
 * the spot; the receipt joins the history the daily summary reads.
 */

export const RESOLVE_PARITY_RECEIPT_VERSION = 2;
export const RESOLVE_PARITY_SAMPLE_RATE = 0.25;
const RECEIPT_TTL_MS = 90 * 24 * 60 * 60 * 1000;
export const FALSE_LINK_ALARM_FINGERPRINT =
  'remediation:music-resolver-false-link' as const;

/** Provenance that already came from an exact identifier or the caller. */
export function isSelfEvidencedProvenance(provenance: string): boolean {
  return (
    provenance === 'input_url' ||
    provenance === 'isrc_exact' ||
    provenance === 'upc_exact' ||
    provenance.endsWith('_isrc')
  );
}

type IsrcLookups = {
  spotify: typeof lookupSpotifyByIsrc;
  apple_music: typeof lookupAppleMusicByIsrc;
  deezer: typeof lookupDeezerByIsrc;
};

const defaultLookups: IsrcLookups = {
  spotify: lookupSpotifyByIsrc,
  apple_music: lookupAppleMusicByIsrc,
  deezer: lookupDeezerByIsrc,
};

export async function buildResolveParityReceipt(
  result: InHouseResolution,
  territory: string,
  lookups: IsrcLookups = defaultLookups,
  now = new Date()
): Promise<(ShadowReceipt & Record<string, unknown>) | null> {
  if (result.status !== 'resolved' || result.kind !== 'track' || !result.isrc)
    return null;
  const checkable = result.links.filter(
    link => !isSelfEvidencedProvenance(link.provenance)
  );
  const excluded = result.links
    .filter(link => isSelfEvidencedProvenance(link.provenance))
    .map(link => link.provider);
  const isrc = result.isrc;
  const [spotify, apple, deezer] = await Promise.all([
    lookups.spotify(isrc, { market: territory }).catch(() => null),
    lookups
      .apple_music(isrc, { storefront: territory.toLowerCase() })
      .catch(() => null),
    lookups.deezer(isrc).catch(() => null),
  ]);
  const reference: Record<string, string> = {};
  if (spotify) reference.spotify = spotify.url;
  if (apple) reference.apple_music = apple.url;
  if (deezer) reference.deezer = deezer.albumUrl ?? deezer.url;
  for (const provider of excluded) delete reference[provider];
  const jovie = Object.fromEntries(
    checkable.map(link => [link.provider, link.url])
  );
  return {
    version: RESOLVE_PARITY_RECEIPT_VERSION,
    source: 'organic_resolve',
    corpusSeedId: null,
    territory,
    observedAt: now.toISOString(),
    excludedSelfEvidenced: excluded.sort(),
    results: {
      jovie: {
        status: result.status,
        providers: jovie,
        provenance: Object.fromEntries(
          checkable.map(link => [link.provider, link.provenance])
        ),
        entity: { isrc, upc: result.upc },
      },
      reference: {
        status: Object.keys(reference).length ? 'resolved' : 'no_match',
        providers: reference,
        provenance: Object.fromEntries(
          Object.keys(reference).map(provider => [provider, `${provider}_isrc`])
        ),
        entity: { isrc, upc: null },
      },
    },
  };
}

async function recordResolveParity(
  result: InHouseResolution,
  territory: string
): Promise<void> {
  const receipt = await buildResolveParityReceipt(result, territory);
  if (!receipt) return;
  const day = receipt.observedAt?.slice(0, 10);
  const inputKey = `organic:${createHash('sha256')
    .update(`${result.isrc}:${territory}`)
    .digest('hex')}:${day}`;
  const expiresAt = new Date(Date.now() + RECEIPT_TTL_MS);
  const row = { inputKey, receipt, expiresAt };
  await db.insert(musicResolverReceipts).values(row).onConflictDoUpdate({
    target: musicResolverReceipts.inputKey,
    set: row,
  });
  const summary = summarizeShadowParity([receipt]);
  if (summary.falseLinkAlarm.firing) {
    // Provider URLs are public catalog facts; no caller input is attached.
    await captureError(
      'Music resolver false link',
      new Error(FALSE_LINK_ALARM_FINGERPRINT),
      {
        fingerprint: FALSE_LINK_ALARM_FINGERPRINT,
        providers: summary.providers
          .filter(provider => provider.candidateFalseLinks > 0)
          .map(provider => provider.provider),
      }
    );
  }
}

/** Sample a real resolve into the parity loop without delaying the response. */
export function scheduleResolveParity(
  result: InHouseResolution,
  territory = 'US',
  random: () => number = Math.random
): boolean {
  if (result.status !== 'resolved' || result.kind !== 'track' || !result.isrc)
    return false;
  if (random() >= RESOLVE_PARITY_SAMPLE_RATE) return false;
  scheduleAfter(
    () =>
      recordResolveParity(result, territory).catch(error =>
        logger.warn('Resolve parity check failed', {
          error: error instanceof Error ? error.message : String(error),
        })
      ),
    { fallback: 'skip' }
  );
  return true;
}

/** Every stored receipt, newest first, summarized per family for Summer. */
export async function readShadowParitySummary(
  limit = 5000
): Promise<ParitySummary> {
  const rows = await db
    .select({ receipt: musicResolverReceipts.receipt })
    .from(musicResolverReceipts)
    .orderBy(desc(musicResolverReceipts.expiresAt))
    .limit(limit);
  return summarizeShadowParity(rows.map(row => row.receipt as ShadowReceipt));
}
