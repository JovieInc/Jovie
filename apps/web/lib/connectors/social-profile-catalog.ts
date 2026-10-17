import type { IngestionPlatform } from '@/lib/ingestion/strategies';
import {
  ARTIST_PROFILE_FIELDS,
  type ArtistProfileContract,
  artistProfileContractSchema,
  unknownArtistProfileContract,
} from './artist-profile-contract';
import { DSP_PROFILE_CATALOG } from './dsp-profile-catalog';

type SocialProfileDestinationId = Exclude<IngestionPlatform, 'unknown'>;
type UnconnectedDestinationId = Exclude<SocialProfileDestinationId, 'youtube'>;

interface SocialProfileEvidence {
  readonly id: UnconnectedDestinationId;
  readonly label: string;
  readonly ingestion: {
    readonly status: 'blocked_policy' | 'blocked_unreliable';
    readonly transport: 'public_html' | 'public_json';
    readonly detail: string;
  };
  readonly validation: {
    readonly profileUrlRef: string;
    readonly constraints: string;
  };
  readonly sourceRefs: readonly string[];
}

const htmlPolicy = 'apps/web/lib/ingestion/social-html-policy.ts';
const networkPolicy = 'docs/network-support-matrix.md';
const strategyRoot = 'apps/web/lib/ingestion/strategies';
const noWrite =
  'No verified official profile-write API adapter, authorization, terms approval, field limits, quota, exact-value preview/confirmation, audit, or rollback evidence.';

/**
 * Source parsers and public URLs grant no destination capability. Keep the
 * operational manifest blocked even when parsing supplied data still works.
 */
function defineBlockedSocialDestination(input: SocialProfileEvidence) {
  const refs = [networkPolicy, ...input.sourceRefs];
  const profile = unknownArtistProfileContract(noWrite);
  for (const name of ARTIST_PROFILE_FIELDS) {
    const field = profile.fields[name];
    field.read = 'unsupported';
    field.authorization.read = {
      status: 'unsupported',
      reason: input.ingestion.detail,
    };
    field.validation = {
      status: 'unknown',
      reason:
        'Only source URL validation is checked in; destination field constraints and mutation limits are unverified.',
    };
    field.evidence = {
      status: 'documented',
      requirements: ['documentation'],
      refs,
    };
  }
  return {
    ...input,
    availability: 'planned' as const,
    blockedReason: `${input.ingestion.detail} ${noWrite}`,
    authorization: {
      read: {
        mechanism: 'none' as const,
        scopes: [],
        detail:
          'Legacy public-source ingestion uses no OAuth; this grants no permission to bypass the read block.',
      },
      write: {
        mechanism: 'unknown' as const,
        scopes: [],
        detail: noWrite,
      },
    },
    quota: {
      status: 'unknown' as const,
      detail:
        'No verified provider profile quota. Fetch timeouts/retries and local scraper settings are not provider quota evidence.',
    },
    evidence: { reviewedOn: '2026-10-16', refs },
    artistProfile: artistProfileContractSchema.parse(profile),
  };
}

/**
 * Sorted social/link-in-bio projection of the shared destination catalog.
 * YouTube is the existing DSP object, including its official-API evidence;
 * neither the OAuth connector nor HTML parser establishes profile readiness.
 */
export const SOCIAL_PROFILE_CATALOG = {
  beacons: defineBlockedSocialDestination({
    id: 'beacons',
    label: 'Beacons',
    ingestion: {
      status: 'blocked_policy',
      transport: 'public_html',
      detail:
        'Core beacons.ai/beacons.page HTML reads fail closed in both isolated-provider flag states; supplied-HTML extraction does not enable remote reads.',
    },
    validation: {
      profileUrlRef: `${strategyRoot}/beacons/validation.ts`,
      constraints:
        'validateBeaconsUrl requires an allowed Beacons host and valid profile handle; no destination field mutation limits are verified.',
    },
    sourceRefs: [
      htmlPolicy,
      `${strategyRoot}/beacons/config.ts`,
      `${strategyRoot}/beacons/fetch.ts`,
      `${strategyRoot}/beacons/validation.ts`,
    ],
  }),
  instagram: defineBlockedSocialDestination({
    id: 'instagram',
    label: 'Instagram',
    ingestion: {
      status: 'blocked_policy',
      transport: 'public_html',
      detail:
        'Core Instagram HTML ingestion is prohibited. Detection and supplied-HTML extraction remain; login pages and follower-count descriptions are not profile evidence.',
    },
    validation: {
      profileUrlRef: `${strategyRoot}/instagram.ts`,
      constraints:
        'validateInstagramUrl allows instagram.com/www.instagram.com with a valid handle; extractInstagram requires og:type=profile and excludes follower-count bios.',
    },
    sourceRefs: [htmlPolicy, `${strategyRoot}/instagram.ts`],
  }),
  laylo: defineBlockedSocialDestination({
    id: 'laylo',
    label: 'Laylo',
    ingestion: {
      status: 'blocked_unreliable',
      transport: 'public_json',
      detail:
        'The network matrix describes public ingestion, but fetchLayloProfile requests CloudFront JSON while fetchJson allows only laylo.com/www.laylo.com: INVALID_HOST precedes fetch. Supplied JSON can yield image/website links; no bio is extracted.',
    },
    validation: {
      profileUrlRef: `${strategyRoot}/laylo.ts`,
      constraints:
        'validateLayloUrl requires a Laylo host and handle; extracted links use normalizeUrl/detectPlatform and canonical deduplication. CloudFront source hosts are outside the fetch allowlist.',
    },
    sourceRefs: [`${strategyRoot}/laylo.ts`, `${strategyRoot}/base/fetch.ts`],
  }),
  linktree: defineBlockedSocialDestination({
    id: 'linktree',
    label: 'Linktree',
    ingestion: {
      status: 'blocked_policy',
      transport: 'public_html',
      detail:
        'Core Linktree HTML fetching/imports were removed; detection and supplied-HTML extraction do not authorize remote profile reads. An official API integration is required.',
    },
    validation: {
      profileUrlRef: `${strategyRoot}/linktree/validation.ts`,
      constraints:
        'validateLinktreeUrl requires an allowed Linktree host and a 1–30 character alphanumeric/underscore handle. No destination field mutation limits are verified.',
    },
    sourceRefs: [
      htmlPolicy,
      `${strategyRoot}/linktree/config.ts`,
      `${strategyRoot}/linktree/validation.ts`,
      'apps/web/lib/ingestion/processor.ts',
    ],
  }),
  tiktok: defineBlockedSocialDestination({
    id: 'tiktok',
    label: 'TikTok',
    ingestion: {
      status: 'blocked_policy',
      transport: 'public_html',
      detail:
        'fetchTikTokDocument fails with SOCIAL_HTML_DISABLED; rehydration/OG parsers do not provide live reads. Empty bot-wall responses are rejected.',
    },
    validation: {
      profileUrlRef: `${strategyRoot}/tiktok.ts`,
      constraints:
        'validateTikTokUrl requires a safe allowed host and handle, canonicalized to /@handle; supplied JSON rejects nonzero profile status and validates the external bio link.',
    },
    sourceRefs: [htmlPolicy, `${strategyRoot}/tiktok.ts`],
  }),
  twitter: defineBlockedSocialDestination({
    id: 'twitter',
    label: 'X / Twitter',
    ingestion: {
      status: 'blocked_policy',
      transport: 'public_html',
      detail:
        'fetchTwitterDocument fails with SOCIAL_HTML_DISABLED for X and Twitter. OpenGraph parsing of supplied HTML does not establish reliable remote profile reads.',
    },
    validation: {
      profileUrlRef: `${strategyRoot}/twitter.ts`,
      constraints:
        'validateTwitterUrl accepts x.com/twitter.com and www variants with a valid handle and canonicalizes to x.com; no separate X destination or mutation limits are claimed.',
    },
    sourceRefs: [htmlPolicy, `${strategyRoot}/twitter.ts`],
  }),
  youtube: DSP_PROFILE_CATALOG.youtube,
} satisfies Record<
  SocialProfileDestinationId,
  { readonly artistProfile: ArtistProfileContract }
>;
