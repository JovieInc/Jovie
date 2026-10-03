/**
 * Press-to-audience coverage domain (JOV-7408).
 *
 * Binds third-party coverage to the correct creator via the provenance-bound
 * inspection boundary built for JOV-5469 (extract-press-source.ts +
 * safe-fetch-public-html.ts). Fetched article content is untrusted data —
 * it is stored only as bounded headline/excerpt evidence and rendered as
 * plain text. Unknown provenance is never published as third-party proof.
 *
 * Experiment: LAUNCH-AUDIENCE-2026-10-01/press-to-audience
 *   Arm A — tracked direct link (existing /s/[code] redirect).
 *   Arm B — this owned coverage page at /{username}/press/{slug}, whose
 *   "Read on {publisher}" action also flows through /s/[code] so outbound
 *   publisher clicks are measured identically across arms.
 */

import { and, eq } from 'drizzle-orm';
import { sanitizeText } from '@/lib/ai/tools/extract-bio-candidate';
import {
  extractPressSourceEvidence,
  hasPressSourceEvidence,
  inspectPressSourceHtml,
} from '@/lib/ai/tools/extract-press-source';
import {
  type SafeFetchError,
  safeFetchPublicHtml,
} from '@/lib/ai/tools/safe-fetch-public-html';
import { createUniqueSourceLinkCode } from '@/lib/audience/source-links';
import type { DbOrTransaction } from '@/lib/db';
import { audienceSourceLinks } from '@/lib/db/schema/analytics';
import {
  type PressCoverage,
  type PressCoverageInspection,
  pressCoverages,
} from '@/lib/db/schema/press-coverage';
import { creatorProfiles } from '@/lib/db/schema/profiles';
import { logger } from '@/lib/utils/logger';

export const PRESS_COVERAGE_EXPERIMENT_KEY =
  'LAUNCH-AUDIENCE-2026-10-01/press-to-audience';

/** Bounded excerpt cap — a permitted short quote, never the article body. */
export const PRESS_COVERAGE_EXCERPT_MAX_LENGTH = 280;
const PRESS_COVERAGE_PUBLISHER_MAX_LENGTH = 120;
const MENTION_MIN_NAME_LENGTH = 3;

const JOVIE_HOST_SUFFIXES = ['jov.ie', 'jovie.com'] as const;

export type PressCoverageRejection =
  | SafeFetchError
  | 'no_source_evidence'
  | 'self_published'
  | 'no_verified_mention';

export type PressCoverageInspectionResult =
  | {
      readonly ok: true;
      readonly sourceUrl: string;
      readonly publisherDomain: string;
      readonly headline: string | null;
      readonly publishedAt: Date | null;
      readonly excerpt: string | null;
      readonly mentionVerified: true;
      readonly inspection: PressCoverageInspection;
    }
  | { readonly ok: false; readonly reason: PressCoverageRejection };

export function normalizeMentionText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Candidate names that count as a genuine mention of this creator.
 * Display name is primary; the handle (with separators expanded) covers
 * articles that name the project rather than the person.
 */
export function creatorMentionCandidates(input: {
  readonly displayName: string | null;
  readonly usernameNormalized: string;
}): string[] {
  const candidates = new Set<string>();
  for (const raw of [
    input.displayName,
    input.usernameNormalized,
    input.usernameNormalized.replace(/[-_.]+/g, ' '),
  ]) {
    if (!raw) continue;
    const normalized = normalizeMentionText(raw);
    if (normalized.length >= MENTION_MIN_NAME_LENGTH) {
      candidates.add(normalized);
    }
  }
  return [...candidates];
}

/**
 * Word-boundary mention check on normalized article evidence. Substring
 * matches inside other words do not count — "Tim White" must not match
 * "time whiteboard".
 */
export function hasVerifiedCreatorMention(
  evidence: { readonly headline: string | null; readonly body: string | null },
  candidates: readonly string[]
): boolean {
  const haystack = ` ${normalizeMentionText(
    `${evidence.headline ?? ''} ${evidence.body ?? ''}`
  )} `;
  if (haystack.trim().length === 0) return false;
  return candidates.some(candidate => haystack.includes(` ${candidate} `));
}

export function publisherDomainFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
  } catch {
    return null;
  }
}

/**
 * Coverage hosted on Jovie itself (or an obvious Jovie domain) is
 * self-published material, not third-party proof.
 */
export function isSelfPublishedDomain(domain: string): boolean {
  const lower = domain.toLowerCase();
  return JOVIE_HOST_SUFFIXES.some(
    suffix => lower === suffix || lower.endsWith(`.${suffix}`)
  );
}

/**
 * Inspect a candidate source URL through the provenance boundary and return
 * publishable coverage fields, or a typed rejection. Rejects auth-walled,
 * non-public, self-published, and no-mention sources.
 */
export async function inspectCoverageSource(
  url: string,
  creator: {
    readonly displayName: string | null;
    readonly usernameNormalized: string;
  },
  now: Date = new Date()
): Promise<PressCoverageInspectionResult> {
  const fetched = await safeFetchPublicHtml(url);
  if (!fetched.ok) {
    return { ok: false, reason: fetched.error };
  }

  const publisherDomain = publisherDomainFromUrl(fetched.finalUrl);
  if (!publisherDomain || isSelfPublishedDomain(publisherDomain)) {
    return { ok: false, reason: 'self_published' };
  }

  const evidence = extractPressSourceEvidence(fetched.html);
  if (
    !hasPressSourceEvidence({
      headline: evidence.headline,
      bodyEvidence: evidence.body,
    })
  ) {
    return { ok: false, reason: 'no_source_evidence' };
  }

  const candidates = creatorMentionCandidates(creator);
  if (!hasVerifiedCreatorMention(evidence, candidates)) {
    return { ok: false, reason: 'no_verified_mention' };
  }

  const inspection = inspectPressSourceHtml(
    fetched.html,
    fetched.finalUrl,
    now
  );

  return {
    ok: true,
    sourceUrl: fetched.finalUrl,
    publisherDomain,
    headline: evidence.headline,
    publishedAt: evidence.publishedAt ? new Date(evidence.publishedAt) : null,
    excerpt: evidence.body
      ? sanitizeText(evidence.body, PRESS_COVERAGE_EXCERPT_MAX_LENGTH)
      : null,
    mentionVerified: true,
    inspection: {
      inspectedAt: inspection.inspectedAt,
      freshness: inspection.freshness,
      factualVerification: false,
      publishedAtSource: inspection.publishedAtSource,
    },
  };
}

/**
 * Create a verified coverage row plus its tracked outbound source link.
 * External I/O (source fetch/inspection) must already be done — pass the
 * inspection result in. Runs inside the caller's authenticated tx.
 */
export async function insertPressCoverage(
  tx: DbOrTransaction,
  input: {
    readonly creatorProfileId: string;
    readonly releaseId: string | null;
    readonly inspected: Extract<PressCoverageInspectionResult, { ok: true }>;
    readonly excerptKind: 'excerpt' | 'creator_summary';
    readonly creatorSummary?: string | null;
    readonly publisherName?: string | null;
    readonly now?: Date;
  }
): Promise<PressCoverage> {
  const slug = await createUniqueSourceLinkCode(tx, 'press');
  const linkCode = await createUniqueSourceLinkCode(tx, 'read');
  const now = input.now ?? new Date();

  const excerpt =
    input.excerptKind === 'excerpt'
      ? input.inspected.excerpt
      : input.creatorSummary
        ? sanitizeText(input.creatorSummary, PRESS_COVERAGE_EXCERPT_MAX_LENGTH)
        : null;

  const [link] = await tx
    .insert(audienceSourceLinks)
    .values({
      creatorProfileId: input.creatorProfileId,
      code: linkCode,
      name: input.inspected.headline ?? input.inspected.publisherDomain,
      sourceType: 'press_coverage',
      destinationKind: 'external_url',
      destinationId: null,
      destinationUrl: input.inspected.sourceUrl,
      utmParams: {
        source: 'jovie',
        medium: 'press',
        campaign: 'press-to-audience',
      },
      metadata: { kind: 'press_coverage', coverageSlug: slug },
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: audienceSourceLinks.id });

  const [coverage] = await tx
    .insert(pressCoverages)
    .values({
      slug,
      creatorProfileId: input.creatorProfileId,
      releaseId: input.releaseId,
      sourceUrl: input.inspected.sourceUrl,
      publisherDomain: input.inspected.publisherDomain,
      publisherName: input.publisherName
        ? sanitizeText(input.publisherName, PRESS_COVERAGE_PUBLISHER_MAX_LENGTH)
        : null,
      headline: input.inspected.headline,
      publishedAt: input.inspected.publishedAt,
      excerpt: excerpt || null,
      excerptKind: input.excerptKind,
      provenance: 'verified_inspection',
      mentionVerified: input.inspected.mentionVerified,
      inspection: input.inspected.inspection,
      outboundSourceLinkId: link?.id ?? null,
      status: 'published',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  if (!coverage) {
    throw new Error('Press coverage insert returned no row');
  }
  return coverage;
}

export interface PublishedCoverageView {
  readonly id: string;
  readonly slug: string;
  readonly headline: string | null;
  readonly publishedAt: string | null;
  readonly excerpt: string | null;
  readonly excerptKind: 'excerpt' | 'creator_summary';
  readonly publisherDomain: string;
  readonly publisherName: string | null;
  readonly sourceUrl: string;
  /** /s/{code} tracked outbound path; null when the link was removed. */
  readonly outboundPath: string | null;
  readonly experimentKey: string;
  readonly creator: {
    readonly profileId: string;
    readonly displayName: string;
    readonly usernameNormalized: string;
    readonly avatarUrl: string | null;
  };
}

/**
 * Load the published, mention-verified coverage for the public page.
 * Drafts, archived rows, and unverified provenance are invisible.
 */
export async function getPublishedPressCoverage(
  tx: DbOrTransaction,
  input: { readonly usernameNormalized: string; readonly slug: string }
): Promise<PublishedCoverageView | null> {
  const [row] = await tx
    .select({
      coverage: pressCoverages,
      outboundCode: audienceSourceLinks.code,
      profile: {
        id: creatorProfiles.id,
        displayName: creatorProfiles.displayName,
        username: creatorProfiles.username,
        usernameNormalized: creatorProfiles.usernameNormalized,
        avatarUrl: creatorProfiles.avatarUrl,
      },
    })
    .from(pressCoverages)
    .innerJoin(
      creatorProfiles,
      eq(creatorProfiles.id, pressCoverages.creatorProfileId)
    )
    .leftJoin(
      audienceSourceLinks,
      eq(audienceSourceLinks.id, pressCoverages.outboundSourceLinkId)
    )
    .where(
      and(
        eq(pressCoverages.slug, input.slug),
        eq(
          creatorProfiles.usernameNormalized,
          input.usernameNormalized.toLowerCase()
        ),
        eq(pressCoverages.status, 'published'),
        eq(pressCoverages.mentionVerified, true)
      )
    )
    .limit(1);

  if (!row) return null;
  const { coverage, outboundCode, profile } = row;

  return {
    id: coverage.id,
    slug: coverage.slug,
    headline: coverage.headline,
    publishedAt: coverage.publishedAt?.toISOString() ?? null,
    excerpt: coverage.excerpt,
    excerptKind: coverage.excerptKind,
    publisherDomain: coverage.publisherDomain,
    publisherName: coverage.publisherName,
    sourceUrl: coverage.sourceUrl,
    outboundPath: outboundCode ? `/s/${outboundCode}` : null,
    experimentKey: coverage.experimentKey,
    creator: {
      profileId: profile.id,
      displayName: profile.displayName ?? profile.username,
      usernameNormalized: profile.usernameNormalized,
      avatarUrl: profile.avatarUrl,
    },
  };
}

export async function loadCoverageInspectionProfile(
  tx: DbOrTransaction,
  creatorProfileId: string
): Promise<{
  readonly displayName: string | null;
  readonly usernameNormalized: string;
} | null> {
  const [profile] = await tx
    .select({
      displayName: creatorProfiles.displayName,
      usernameNormalized: creatorProfiles.usernameNormalized,
    })
    .from(creatorProfiles)
    .where(eq(creatorProfiles.id, creatorProfileId))
    .limit(1);
  return profile ?? null;
}

export function logCoverageRejection(
  reason: PressCoverageRejection,
  context: { readonly creatorProfileId: string; readonly url: string }
): void {
  logger.info('Press coverage rejected', {
    reason,
    creatorProfileId: context.creatorProfileId,
    publisherDomain: publisherDomainFromUrl(context.url),
  });
}
