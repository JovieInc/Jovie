import { z } from 'zod';
import { CITATION_ENGINES } from '@/lib/aeo/citation-monitor';
import type { VisibilityAuditInput } from './types';

const urlLinkSchema = z.object({
  platform: z.string().max(80).nullish(),
  url: z.string().min(1).max(2000),
});

export const visibilityAuditInputSchema = z.object({
  artistName: z.string().min(1).max(200),
  profilePath: z.string().min(1).max(200),
  profileUrl: z.string().min(1).max(2000),
  musicbrainzId: z.string().max(80).nullish(),
  spotifyUrl: z.string().max(2000).nullish(),
  appleMusicUrl: z.string().max(2000).nullish(),
  youtubeUrl: z.string().max(2000).nullish(),
  identityLinks: z
    .array(
      z.object({
        platform: z.string().min(1).max(80),
        url: z.string().min(1).max(2000),
        externalId: z.string().max(80).nullish(),
      })
    )
    .max(100),
  socialLinks: z.array(urlLinkSchema).max(100),
  dspLinks: z.array(urlLinkSchema).max(100),
  ingestedUrls: z.array(z.string().min(1).max(2000)).max(200),
  linkInBioOutbound: z
    .array(
      z.object({
        sourceUrl: z.string().min(1).max(2000),
        outboundUrls: z.array(z.string().min(1).max(2000)).max(100),
      })
    )
    .max(50),
  catalogMismatches: z
    .array(
      z.object({
        isrc: z.string().min(1).max(32),
        mismatchType: z.enum(['not_in_catalog', 'missing_from_dsp']),
        status: z.enum(['flagged', 'confirmed_mismatch', 'dismissed']),
        externalTrackName: z.string().max(300).nullish(),
        externalAlbumName: z.string().max(300).nullish(),
        providerId: z.string().max(80).nullish(),
      })
    )
    .max(500),
  discoveredPixels: z
    .object(
      Object.fromEntries(
        (
          [
            'facebook',
            'tiktok',
            'google',
            'twitter',
            'snapchat',
            'pinterest',
          ] as const
        ).map(platform => [
          platform,
          z
            .object({
              detected: z.literal(true),
              pixelIds: z.array(z.string().max(64)).max(20),
            })
            .optional(),
        ])
      )
    )
    .strict()
    .nullable(),
  searchOwnership: z
    .array(
      z.object({
        query: z.string().min(1).max(300),
        rank: z.number().int().min(1).max(10).nullable(),
        url: z.string().max(2000).nullable(),
        owned: z.boolean().nullable(),
        notes: z.string().max(500).nullish(),
      })
    )
    .max(50),
  citationChecks: z
    .array(
      z.object({
        engine: z.enum(CITATION_ENGINES),
        question: z.string().min(1).max(300),
        cited: z.boolean(),
        matchedUrl: z.string().max(2000).nullable(),
        checkedAt: z.string().min(1).max(40),
        notes: z.string().max(500).nullish(),
      })
    )
    .max(100),
  generatedAt: z.string().min(1).max(40),
  evidenceNote: z.string().max(1000).nullish(),
});

export function parseVisibilityAuditInput(
  raw: unknown
): { ok: true; input: VisibilityAuditInput } | { ok: false; error: string } {
  const parsed = visibilityAuditInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid audit input',
    };
  }
  const data = parsed.data;
  return {
    ok: true,
    input: {
      artistName: data.artistName,
      profilePath: data.profilePath,
      profileUrl: data.profileUrl,
      musicbrainzId: data.musicbrainzId ?? null,
      spotifyUrl: data.spotifyUrl ?? null,
      appleMusicUrl: data.appleMusicUrl ?? null,
      youtubeUrl: data.youtubeUrl ?? null,
      identityLinks: data.identityLinks.map(link => ({
        platform: link.platform,
        url: link.url,
        externalId: link.externalId ?? null,
      })),
      socialLinks: data.socialLinks.map(link => ({
        platform: link.platform ?? null,
        url: link.url,
      })),
      dspLinks: data.dspLinks.map(link => ({
        platform: link.platform ?? null,
        url: link.url,
      })),
      ingestedUrls: data.ingestedUrls,
      linkInBioOutbound: data.linkInBioOutbound,
      catalogMismatches: data.catalogMismatches.map(row => ({
        isrc: row.isrc,
        mismatchType: row.mismatchType,
        status: row.status,
        externalTrackName: row.externalTrackName ?? null,
        externalAlbumName: row.externalAlbumName ?? null,
        providerId: row.providerId ?? null,
      })),
      discoveredPixels: data.discoveredPixels,
      searchOwnership: data.searchOwnership.map(row => ({
        query: row.query,
        rank: row.rank,
        url: row.url,
        owned: row.owned,
        notes: row.notes ?? null,
      })),
      citationChecks: data.citationChecks.map(row => ({
        engine: row.engine,
        question: row.question,
        cited: row.cited,
        matchedUrl: row.matchedUrl,
        checkedAt: row.checkedAt,
        notes: row.notes ?? null,
      })),
      generatedAt: data.generatedAt,
      evidenceNote: data.evidenceNote ?? null,
    },
  };
}
