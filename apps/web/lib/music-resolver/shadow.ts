import 'server-only';

import { createHash } from 'node:crypto';
import { and, sql as drizzleSql, eq, gt, or } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  providerLinks,
} from '@/lib/db/schema/content';
import { musicResolverReceipts } from '@/lib/db/schema/music-resolver';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import {
  PROVIDER_DOMAINS,
  validateProviderUrl,
} from '@/lib/discography/provider-domains';
import {
  lookupAppleMusicByIsrc,
  lookupDeezerByIsrc,
  lookupSpotifyByIsrc,
} from '@/lib/discography/provider-links';
import { getReleaseById } from '@/lib/discography/queries';
import type { ProviderKey } from '@/lib/discography/types';
import { getRegistryEntry } from '@/lib/dsp-registry';

const territory = z
  .string()
  .regex(/^[A-Z]{2}$/)
  .default('US');
const input = <K extends string, T extends z.ZodRawShape>(kind: K, fields: T) =>
  z.object({ kind: z.literal(kind), ...fields, territory });
export const musicResolverInputSchema = z.discriminatedUnion('kind', [
  input('url', { url: z.url().startsWith('https://') }),
  input('isrc', {
    isrc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/),
  }),
  input('upc', {
    upc: z
      .string()
      .trim()
      .regex(/^\d{8,20}$/),
  }),
  input('metadata', {
    artist: z.string().trim().min(1).max(300),
    title: z.string().trim().min(1).max(300),
  }),
  input('jovie', {
    entityType: z.enum(['release', 'recording']),
    id: z.uuid(),
  }),
]);
export type MusicResolverInput = z.output<typeof musicResolverInputSchema>;

export interface ResolverOutput {
  status: 'resolved' | 'no_match' | 'ambiguous' | 'upstream_error';
  entity?: {
    id: string;
    title: string;
    artist: string | null;
    upc: string | null;
    isrc: string | null;
  };
  providers: Record<string, string>;
  provenance: Record<string, string>;
  confidence: number;
  negativeEvidence?: { reason: string; candidateCount: number };
  requestCount: number;
}

export const MUSIC_RESOLVER_PARITY_CORPUS: ReadonlyArray<{
  id: string;
  input: MusicResolverInput;
  covers: string[];
}> = JSON.parse(
  '[{"id":"tim-take-me-over-spotify","input":{"kind":"url","url":"https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX","territory":"US"},"covers":["tim_catalog","collaboration","reference_success"]},{"id":"tim-take-me-over-youtube","input":{"kind":"url","url":"https://www.youtube.com/watch?v=LtDL1HHq954","territory":"US"},"covers":["long_tail_provider","provider_coverage"]},{"id":"tim-same-name-remix","input":{"kind":"metadata","artist":"Tim White","title":"Take Me Over (Austin Leeds Remix)","territory":"US"},"covers":["ambiguous_artist","feature_or_remix","split_provider_identity"]},{"id":"tim-regional-storefront","input":{"kind":"url","url":"https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX","territory":"GB"},"covers":["regional_storefront"]},{"id":"tim-wrong-beatport-identity","input":{"kind":"url","url":"https://www.beatport.com/artist/tim-white/406847","territory":"US"},"covers":["ambiguous_artist","split_provider_identity","reference_failure"]},{"id":"tim-stale-legacy-link","input":{"kind":"url","url":"https://jov.ie/tim/take-me-over","territory":"US"},"covers":["stale_or_broken_link","reference_failure"]}]'
);

export function musicResolverInputKey(input: MusicResolverInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

function emptyResult(
  status: ResolverOutput['status'],
  reason: string,
  candidateCount = 0,
  requestCount = 0
): ResolverOutput {
  return {
    status,
    providers: {},
    provenance: {},
    confidence: 0,
    negativeEvidence: { reason, candidateCount },
    requestCount,
  };
}

async function findReleaseIds(input: MusicResolverInput): Promise<string[]> {
  const predicate = (() => {
    if (input.kind === 'url') return eq(providerLinks.url, input.url);
    if (input.kind === 'upc') return eq(discogReleases.upc, input.upc);
    if (input.kind === 'isrc') return eq(discogRecordings.isrc, input.isrc);
    if (input.kind === 'metadata')
      return and(
        drizzleSql`lower(${discogReleases.title}) = lower(${input.title})`,
        drizzleSql`lower(${creatorProfiles.displayName}) = lower(${input.artist})`
      );
    return input.entityType === 'release'
      ? eq(discogReleases.id, input.id)
      : eq(discogRecordings.id, input.id);
  })();
  const rows = await db
    .selectDistinct({ id: discogReleases.id })
    .from(discogReleases)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, discogReleases.creatorProfileId)
    )
    .leftJoin(
      discogReleaseTracks,
      eq(discogReleaseTracks.releaseId, discogReleases.id)
    )
    .leftJoin(
      discogRecordings,
      eq(discogRecordings.id, discogReleaseTracks.recordingId)
    )
    .leftJoin(
      providerLinks,
      or(
        eq(providerLinks.releaseId, discogReleases.id),
        eq(providerLinks.releaseTrackId, discogReleaseTracks.id)
      )
    )
    .where(predicate)
    .limit(2);
  return rows.map(row => row.id);
}

async function resolveJovie(
  input: MusicResolverInput
): Promise<ResolverOutput> {
  const ids = [...new Set(await findReleaseIds(input))];
  if (ids.length !== 1)
    return emptyResult(
      ids.length ? 'ambiguous' : 'no_match',
      ids.length ? 'multiple_exact_entities' : 'no_exact_entity',
      ids.length
    );
  const release = await getReleaseById(ids[0]);
  if (!release) return emptyResult('no_match', 'entity_missing');
  const [recording] = await db
    .select({ isrc: discogRecordings.isrc })
    .from(discogReleaseTracks)
    .innerJoin(
      discogRecordings,
      eq(discogRecordings.id, discogReleaseTracks.recordingId)
    )
    .where(eq(discogReleaseTracks.releaseId, release.id))
    .limit(1);
  const overrides: Record<string, { url: string; discovered_from: string }> =
    {};
  for (const link of release.providerLinks) {
    const entry = getRegistryEntry(link.providerId);
    if (entry && validateProviderUrl(link.url, entry.key as ProviderKey).valid)
      overrides[entry.key] = {
        url: link.url,
        discovered_from: `provider_links:${link.sourceType}`,
      };
  }
  const providers = Object.fromEntries(
    Object.entries(overrides).map(([provider, value]) => [provider, value.url])
  );
  const provenance = Object.fromEntries(
    Object.entries(overrides).map(([provider, value]) => [
      provider,
      value.discovered_from,
    ])
  );
  let requestCount = 0;
  if (recording?.isrc) {
    const needsApple = !providers.apple_music;
    const needsDeezer = !providers.deezer;
    requestCount = Number(needsApple) + Number(needsDeezer);
    const [apple, deezer] = await Promise.all([
      needsApple
        ? lookupAppleMusicByIsrc(recording.isrc, {
            storefront: input.territory.toLowerCase(),
          })
        : null,
      needsDeezer ? lookupDeezerByIsrc(recording.isrc) : null,
    ]);
    if (apple) {
      providers.apple_music = apple.url;
      provenance.apple_music = 'apple_music_isrc';
    }
    if (deezer) {
      providers.deezer = deezer.albumUrl ?? deezer.url;
      provenance.deezer = 'deezer_isrc';
    }
  }
  return {
    status: 'resolved',
    entity: {
      id: release.id,
      title: release.title,
      artist: release.artistNames?.join(', ') || null,
      upc: release.upc,
      isrc: recording?.isrc ?? null,
    },
    providers: Object.fromEntries(
      Object.entries(providers).sort(([a], [b]) => a.localeCompare(b))
    ),
    provenance,
    confidence: 0.99,
    requestCount,
  };
}

function providerForUrl(url: string): ProviderKey | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    for (const [provider, domains] of Object.entries(PROVIDER_DOMAINS)) {
      if (
        domains.some(
          domain => hostname === domain || hostname.endsWith(`.${domain}`)
        )
      )
        return provider as ProviderKey;
    }
  } catch {
    return null;
  }
  return null;
}

// Independent parity reference built from official DSP APIs only (JOV-7369
// benchmark-source gate: no third-party vendor oracle without written
// permission covering comparison, caching, and retention).
const REFERENCE_ISRC_PROVIDERS = ['spotify', 'apple_music', 'deezer'] as const;

async function resolveReference(
  input: MusicResolverInput,
  jovie: ResolverOutput
): Promise<ResolverOutput> {
  const providers: Record<string, string> = {};
  const provenance: Record<string, string> = {};
  if (input.kind === 'url') {
    const provider = providerForUrl(input.url);
    if (provider) {
      providers[provider] = input.url;
      provenance[provider] = 'input_url';
    }
  }
  const isrc =
    input.kind === 'isrc' ? input.isrc : (jovie.entity?.isrc ?? null);
  if (!isrc)
    return Object.keys(providers).length
      ? {
          status: 'resolved',
          providers,
          provenance,
          confidence: 0.9,
          requestCount: 0,
        }
      : emptyResult('no_match', 'no_reference_exact_identifier');
  const requestCount = REFERENCE_ISRC_PROVIDERS.length;
  try {
    const [spotify, apple, deezer] = await Promise.all([
      lookupSpotifyByIsrc(isrc, { market: input.territory }),
      lookupAppleMusicByIsrc(isrc, {
        storefront: input.territory.toLowerCase(),
      }),
      lookupDeezerByIsrc(isrc),
    ]);
    if (spotify) {
      providers.spotify = spotify.url;
      provenance.spotify = 'spotify_isrc';
    }
    if (apple) {
      providers.apple_music = apple.url;
      provenance.apple_music = 'apple_music_isrc';
    }
    if (deezer) {
      providers.deezer = deezer.albumUrl ?? deezer.url;
      provenance.deezer = 'deezer_isrc';
    }
    if (!Object.keys(providers).length)
      return emptyResult('no_match', 'reference_no_match', 0, requestCount);
    return {
      status: 'resolved',
      entity: apple
        ? {
            id: '',
            title: apple.trackName ?? '',
            artist: apple.artistName,
            upc: null,
            isrc,
          }
        : undefined,
      providers: Object.fromEntries(
        Object.entries(providers).sort(([a], [b]) => a.localeCompare(b))
      ),
      provenance,
      confidence: 0.9,
      requestCount,
    };
  } catch {
    return emptyResult(
      'upstream_error',
      'reference_upstream_error',
      0,
      requestCount
    );
  }
}

export function compareResolverResults(
  jovie: ResolverOutput,
  reference: ResolverOutput
) {
  const providers = [
    ...new Set(
      Object.keys(jovie.providers).concat(Object.keys(reference.providers))
    ),
  ].sort();
  const disagreements = providers
    .filter(
      provider => jovie.providers[provider] !== reference.providers[provider]
    )
    .map(provider => ({
      provider,
      jovie: jovie.providers[provider] ?? null,
      reference: reference.providers[provider] ?? null,
    }));
  const summarize = (result: ResolverOutput) => ({
    identifiers: {
      upc: result.entity?.upc ?? null,
      isrc: result.entity?.isrc ?? null,
    },
    completeness:
      [
        result.entity?.title,
        result.entity?.artist,
        result.entity?.upc,
        result.entity?.isrc,
      ].filter(Boolean).length / 4,
  });
  const jovieSummary = summarize(jovie);
  const referenceSummary = summarize(reference);
  const agrees = (field: 'upc' | 'isrc') => {
    const left = jovieSummary.identifiers[field];
    const right = referenceSummary.identifiers[field];
    return left && right ? left === right : null;
  };
  return {
    status:
      !disagreements.length && jovie.status === reference.status
        ? 'match'
        : 'disagreement',
    providerCoverage: {
      jovie: Object.keys(jovie.providers).length,
      reference: Object.keys(reference.providers).length,
      overlap: providers.length - disagreements.length,
    },
    urlDisagreements: disagreements,
    identifierAccuracy: {
      jovie: jovieSummary.identifiers,
      reference: referenceSummary.identifiers,
      agreement: { upc: agrees('upc'), isrc: agrees('isrc') },
    },
    falsePositiveRate: null,
    metadataCompleteness: {
      jovie: jovieSummary.completeness,
      reference: referenceSummary.completeness,
    },
    adjudication: disagreements.length ? 'pending' : 'not_required',
  };
}

export const SHADOW_RECEIPT_VERSION = 2;

export const musicResolverShadowPayloadSchema = z.object({
  corpusSeedId: z.string().max(100).optional(),
  input: musicResolverInputSchema,
});

export async function runMusicResolverShadow(
  payload: z.input<typeof musicResolverShadowPayloadSchema>
) {
  const parsed = musicResolverShadowPayloadSchema.parse(payload);
  const key = musicResolverInputKey(parsed.input);
  const now = new Date();
  const [cached] = await db
    .select({ receipt: musicResolverReceipts.receipt })
    .from(musicResolverReceipts)
    .where(
      and(
        eq(musicResolverReceipts.inputKey, key),
        gt(musicResolverReceipts.expiresAt, now)
      )
    )
    .limit(1);
  if (
    (cached?.receipt as { version?: number } | undefined)?.version ===
    SHADOW_RECEIPT_VERSION
  )
    return cached.receipt;
  const jovieStart = Date.now();
  const jovie = await resolveJovie(parsed.input);
  const jovieLatencyMs = Date.now() - jovieStart;
  const referenceStart = Date.now();
  const reference = await resolveReference(parsed.input, jovie);
  const referenceLatencyMs = Date.now() - referenceStart;
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const receipt = {
    version: SHADOW_RECEIPT_VERSION,
    inputKey: key,
    corpusSeedId: parsed.corpusSeedId ?? null,
    territory: parsed.input.territory,
    observedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    comparison: compareResolverResults(jovie, reference),
    latencyMs: { jovie: jovieLatencyMs, reference: referenceLatencyMs },
    cost: {
      unit: 'requests',
      jovie: jovie.requestCount,
      reference: reference.requestCount,
    },
    failureBehavior: { jovie: jovie.status, reference: reference.status },
    input: parsed.input,
    results: { jovie, reference },
  };
  const row = {
    inputKey: key,
    receipt,
    expiresAt,
  };
  await db.insert(musicResolverReceipts).values(row).onConflictDoUpdate({
    target: musicResolverReceipts.inputKey,
    set: row,
  });
  return receipt;
}

/** Catalog plus official DSP lookups. Does not call MusicFetch. */
export function resolveJovieRelease(
  input: MusicResolverInput
): Promise<ResolverOutput> {
  return resolveJovie(input);
}

export const runMusicResolverParityCorpus = () =>
  Promise.all(
    MUSIC_RESOLVER_PARITY_CORPUS.map(seed =>
      runMusicResolverShadow({ corpusSeedId: seed.id, input: seed.input })
    )
  );
