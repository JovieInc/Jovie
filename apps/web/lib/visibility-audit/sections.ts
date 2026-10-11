import {
  buildCanonicalQuestions,
  type CitationResult,
  computeCitationStats,
  getAeoMeasurementDisclosure,
} from '@/lib/aeo/citation-monitor';
import type { DiscoveredPixels } from '@/lib/db/schema/profiles';
import { APP_FLAG_DEFAULTS } from '@/lib/flags/contracts';
import { SPOTIFY_CATALOG_POLICY } from './derived-metrics';
import type {
  CatalogSection,
  CitationSection,
  PixelSection,
  SearchOwnershipSection,
  VisibilityAuditCatalogMismatch,
  VisibilityAuditInput,
} from './types';

const PIXEL_PLATFORMS = [
  'facebook',
  'tiktok',
  'google',
  'twitter',
  'snapchat',
  'pinterest',
] as const satisfies readonly (keyof DiscoveredPixels)[];

const SEARCH_INSTRUCTION =
  'Google page-1 ownership is a manual check while PROFILE_SEARCH_MONITORING is off. Record query, rank, URL, and whether the result is owned by the artist. This generator does not call SerpAPI.';

export function buildSearchOwnershipSection(
  input: VisibilityAuditInput
): SearchOwnershipSection {
  return {
    mode: 'manual_check',
    monitoringFlag: 'PROFILE_SEARCH_MONITORING',
    monitoringDefault: APP_FLAG_DEFAULTS.PROFILE_SEARCH_MONITORING,
    serpApiRequests: 0,
    instruction: SEARCH_INSTRUCTION,
    rows: input.searchOwnership.map(row => ({
      query: row.query,
      rank: row.rank,
      url: row.url,
      owned: row.owned,
      notes: row.notes ?? null,
    })),
  };
}

export function buildCitationSection(
  input: VisibilityAuditInput
): CitationSection {
  const questions = buildCanonicalQuestions(input.artistName);
  const checks = input.citationChecks;
  const rows = questions.map(question => ({
    question: question.question,
    category: question.category,
    checks: checks.filter(check => check.question === question.question),
  }));
  const statsInput: CitationResult[] = checks.map(check => ({
    engine: check.engine,
    question: check.question,
    profileUrl: input.profileUrl,
    cited: check.cited,
    matchedUrl: check.matchedUrl,
    checkedAt: check.checkedAt,
  }));
  const stats = computeCitationStats(statsInput);
  const disclosure = getAeoMeasurementDisclosure('citation');
  return {
    disclosure: disclosure.description,
    questions: rows,
    totalChecks: stats.totalChecks,
    citedCount: stats.citedCount,
    shareOfCitation: stats.shareOfCitation,
    instruction:
      'Answer-engine citation spot checks use the canonical question set. Paste manual results per engine. This generator does not query answer engines.',
  };
}

export function toCatalogMismatch(
  raw: VisibilityAuditCatalogMismatch
): VisibilityAuditCatalogMismatch {
  return {
    isrc: raw.isrc,
    mismatchType: raw.mismatchType,
    status: raw.status,
    externalTrackName: raw.externalTrackName ?? null,
    externalAlbumName: raw.externalAlbumName ?? null,
    providerId: raw.providerId ?? null,
  };
}

export function buildCatalogSection(
  input: VisibilityAuditInput
): CatalogSection {
  return {
    policy: SPOTIFY_CATALOG_POLICY,
    mismatches: input.catalogMismatches.map(toCatalogMismatch),
  };
}

export function buildPixelSection(input: VisibilityAuditInput): PixelSection {
  const discovered = input.discoveredPixels;
  return {
    rows: PIXEL_PLATFORMS.map(platform => {
      const found = discovered?.[platform];
      return {
        platform,
        present: Boolean(found?.detected),
        pixelIds: found?.pixelIds ?? [],
      };
    }),
  };
}
