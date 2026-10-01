import 'server-only';

import { createHash } from 'node:crypto';
import { and, sql as drizzleSql, eq, gt, or } from 'drizzle-orm';
import { z } from 'zod';
import { resolveAgentRelease } from '@/lib/agent-acquisition/release-resolution';
import { db } from '@/lib/db';
import {
  discogRecordings,
  discogReleases,
  discogReleaseTracks,
  providerLinks,
} from '@/lib/db/schema/content';
import { musicResolverReceipts } from '@/lib/db/schema/music-resolver';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { lookupByIsrc as musicfetchLookupByIsrc } from '@/lib/discography/musicfetch';
import { validateProviderUrl } from '@/lib/discography/provider-domains';
import {
  lookupAppleMusicByIsrc,
  lookupDeezerByIsrc,
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
  '[{"id":"tim-take-me-over-spotify","input":{"kind":"url","url":"https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX","territory":"US"},"covers":["tim_catalog","collaboration","musicfetch_success"]},{"id":"tim-take-me-over-youtube","input":{"kind":"url","url":"https://www.youtube.com/watch?v=LtDL1HHq954","territory":"US"},"covers":["long_tail_provider","provider_coverage"]},{"id":"tim-same-name-remix","input":{"kind":"metadata","artist":"Tim White","title":"Take Me Over (Austin Leeds Remix)","territory":"US"},"covers":["ambiguous_artist","feature_or_remix","split_provider_identity"]},{"id":"tim-regional-storefront","input":{"kind":"url","url":"https://open.spotify.com/track/4bc0TJNIiGEJjFYDwHuOjX","territory":"GB"},"covers":["regional_storefront"]},{"id":"tim-wrong-beatport-identity","input":{"kind":"url","url":"https://www.beatport.com/artist/tim-white/406847","territory":"US"},"covers":["ambiguous_artist","split_provider_identity","musicfetch_failure"]},{"id":"tim-stale-legacy-link","input":{"kind":"url","url":"https://jov.ie/tim/take-me-over","territory":"US"},"covers":["stale_or_broken_link","musicfetch_failure"]}]'
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

async function resolveMusicfetch(
  input: MusicResolverInput,
  jovie: ResolverOutput
): Promise<ResolverOutput> {
  const lookup =
    input.kind === 'jovie' || input.kind === 'metadata'
      ? jovie.entity?.isrc
        ? { field: 'isrc', value: jovie.entity.isrc }
        : null
      : {
          field: input.kind,
          value:
            input.kind === 'url'
              ? input.url
              : input.kind === 'isrc'
                ? input.isrc
                : input.upc,
        };
  if (!lookup) return emptyResult('no_match', 'no_musicfetch_exact_identifier');
  try {
    let providers: Record<string, string>;
    let entity: ResolverOutput['entity'];
    if (lookup.field === 'isrc') {
      const result = await musicfetchLookupByIsrc(lookup.value);
      if (!result) return emptyResult('no_match', 'musicfetch_no_match', 0, 1);
      providers = result.links;
      entity = {
        id: '',
        title: result.raw.name,
        artist: result.raw.artists?.[0]?.name ?? null,
        upc: null,
        isrc: result.raw.isrc,
      };
    } else {
      const result = await resolveAgentRelease({
        draft_id: '00000000-0000-4000-8000-000000000000',
        draft_token: 'shadow',
        goal: 'resolver parity',
        ...(lookup.field === 'url'
          ? { release_url: lookup.value }
          : { upc: lookup.value }),
      });
      if (result.status === 'error')
        return emptyResult(
          result.code === 'UPSTREAM_FAILURE' ? 'upstream_error' : 'no_match',
          `musicfetch_${result.code.toLowerCase()}`,
          0,
          result.code === 'UNSUPPORTED_RELEASE' ? 0 : 1
        );
      providers = Object.assign(
        {},
        ...result.facts.map(fact => fact.dsp_links)
      );
      const fact = result.facts[0];
      entity = fact && {
        id: '',
        title: fact.title ?? '',
        artist: fact.artist_name,
        upc: fact.upc,
        isrc: null,
      };
    }
    return {
      status: 'resolved',
      entity,
      providers: Object.fromEntries(
        Object.entries(providers).sort(([a], [b]) => a.localeCompare(b))
      ),
      provenance: Object.fromEntries(
        Object.keys(providers).map(provider => [provider, 'musicfetch'])
      ),
      confidence: 0.99,
      requestCount: 1,
    };
  } catch {
    return emptyResult('upstream_error', 'musicfetch_upstream_error', 0, 1);
  }
}

export function compareResolverResults(
  jovie: ResolverOutput,
  musicfetch: ResolverOutput
) {
  const providers = [
    ...new Set(
      Object.keys(jovie.providers).concat(Object.keys(musicfetch.providers))
    ),
  ].sort();
  const disagreements = providers
    .filter(
      provider => jovie.providers[provider] !== musicfetch.providers[provider]
    )
    .map(provider => ({
      provider,
      jovie: jovie.providers[provider] ?? null,
      musicfetch: musicfetch.providers[provider] ?? null,
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
  const musicfetchSummary = summarize(musicfetch);
  const agrees = (field: 'upc' | 'isrc') => {
    const left = jovieSummary.identifiers[field];
    const right = musicfetchSummary.identifiers[field];
    return left && right ? left === right : null;
  };
  return {
    status:
      !disagreements.length && jovie.status === musicfetch.status
        ? 'match'
        : 'disagreement',
    providerCoverage: {
      jovie: Object.keys(jovie.providers).length,
      musicfetch: Object.keys(musicfetch.providers).length,
      overlap: providers.length - disagreements.length,
    },
    urlDisagreements: disagreements,
    identifierAccuracy: {
      jovie: jovieSummary.identifiers,
      musicfetch: musicfetchSummary.identifiers,
      agreement: { upc: agrees('upc'), isrc: agrees('isrc') },
    },
    falsePositiveRate: null,
    metadataCompleteness: {
      jovie: jovieSummary.completeness,
      musicfetch: musicfetchSummary.completeness,
    },
    adjudication: disagreements.length ? 'pending' : 'not_required',
  };
}

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
  if (cached) return cached.receipt;
  const jovieStart = Date.now();
  const jovie = await resolveJovie(parsed.input);
  const jovieLatencyMs = Date.now() - jovieStart;
  const musicfetchStart = Date.now();
  const musicfetch = await resolveMusicfetch(parsed.input, jovie);
  const musicfetchLatencyMs = Date.now() - musicfetchStart;
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const receipt = {
    version: 1,
    inputKey: key,
    corpusSeedId: parsed.corpusSeedId ?? null,
    territory: parsed.input.territory,
    observedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    comparison: compareResolverResults(jovie, musicfetch),
    latencyMs: { jovie: jovieLatencyMs, musicfetch: musicfetchLatencyMs },
    cost: {
      unit: 'requests',
      jovie: jovie.requestCount,
      musicfetch: musicfetch.requestCount,
    },
    failureBehavior: { jovie: jovie.status, musicfetch: musicfetch.status },
    input: parsed.input,
    results: { jovie, musicfetch },
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

export const runMusicResolverParityCorpus = () =>
  Promise.all(
    MUSIC_RESOLVER_PARITY_CORPUS.map(seed =>
      runMusicResolverShadow({ corpusSeedId: seed.id, input: seed.input })
    )
  );
