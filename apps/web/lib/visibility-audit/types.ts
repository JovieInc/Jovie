/**
 * Digital Footprint & Visibility Audit — report contract.
 *
 * The generator reads stored identity, DSP links, ingestion results, catalog
 * mismatch rows, and operator-entered manual checks. It does not fetch
 * MusicFetch, SerpAPI, or link-in-bio pages.
 */

import type { CitationEngine } from '@/lib/aeo/citation-monitor';
import type { DiscoveredPixels } from '@/lib/db/schema/profiles';

export type CatalogMismatchType = 'not_in_catalog' | 'missing_from_dsp';
export type CatalogMismatchStatus =
  | 'flagged'
  | 'confirmed_mismatch'
  | 'dismissed';

export interface VisibilityAuditIdentityLink {
  readonly platform: string;
  readonly url: string;
  readonly externalId?: string | null;
}

export interface VisibilityAuditUrlLink {
  readonly platform?: string | null;
  readonly url: string;
}

export interface VisibilityAuditCatalogMismatch {
  readonly isrc: string;
  readonly mismatchType: CatalogMismatchType;
  readonly status: CatalogMismatchStatus;
  readonly externalTrackName?: string | null;
  readonly externalAlbumName?: string | null;
  readonly providerId?: string | null;
}

export interface VisibilityAuditSearchRow {
  readonly query: string;
  /** 1-based rank on Google page 1, when the operator recorded one. */
  readonly rank: number | null;
  readonly url: string | null;
  readonly owned: boolean | null;
  readonly notes?: string | null;
}

export interface VisibilityAuditCitationEntry {
  readonly engine: CitationEngine;
  readonly question: string;
  readonly cited: boolean;
  readonly matchedUrl: string | null;
  readonly checkedAt: string;
  readonly notes?: string | null;
}

export interface VisibilityAuditLinkInBioOutbound {
  readonly sourceUrl: string;
  readonly outboundUrls: readonly string[];
}

export interface VisibilityAuditInput {
  readonly artistName: string;
  readonly profilePath: string;
  readonly profileUrl: string;
  readonly musicbrainzId?: string | null;
  readonly spotifyUrl?: string | null;
  readonly appleMusicUrl?: string | null;
  readonly youtubeUrl?: string | null;
  readonly identityLinks: readonly VisibilityAuditIdentityLink[];
  readonly socialLinks: readonly VisibilityAuditUrlLink[];
  readonly dspLinks: readonly VisibilityAuditUrlLink[];
  /** URLs already collected by ingestion. This audit does not fetch them. */
  readonly ingestedUrls: readonly string[];
  readonly linkInBioOutbound: readonly VisibilityAuditLinkInBioOutbound[];
  readonly catalogMismatches: readonly VisibilityAuditCatalogMismatch[];
  readonly discoveredPixels: DiscoveredPixels | null;
  readonly searchOwnership: readonly VisibilityAuditSearchRow[];
  readonly citationChecks: readonly VisibilityAuditCitationEntry[];
  /** ISO timestamp supplied by the caller so renders stay deterministic. */
  readonly generatedAt: string;
  readonly evidenceNote?: string | null;
}

export interface IdentityChainStep {
  readonly id: 'mbid' | 'wikidata' | 'isni';
  readonly label: string;
  readonly status: 'present' | 'missing';
  readonly values: readonly string[];
}

export interface IdentitySection {
  readonly steps: readonly IdentityChainStep[];
  readonly mbid: string | null;
  readonly wikidataQid: string | null;
  readonly isnis: readonly string[];
  readonly sameAs: readonly string[];
}

export interface DspPresenceRow {
  readonly key: string;
  readonly name: string;
  readonly category: string;
  readonly present: boolean;
  readonly urls: readonly string[];
}

export interface DspPresenceSection {
  readonly registryCount: number;
  readonly presentCount: number;
  readonly missingCount: number;
  readonly platforms: readonly DspPresenceRow[];
}

export interface LinkGraphNode {
  readonly platform: string;
  readonly url: string;
  readonly handle: string | null;
  readonly source: 'profile' | 'ingested' | 'link_in_bio_outbound';
  readonly via: string | null;
}

export interface LinkGraphConflict {
  readonly kind:
    | 'multiple_link_in_bio_products'
    | 'handle_mismatch'
    | 'outbound_disagrees_with_profile';
  readonly summary: string;
}

export interface LinkGraphSection {
  readonly nodes: readonly LinkGraphNode[];
  readonly conflicts: readonly LinkGraphConflict[];
}

export interface SearchOwnershipSection {
  readonly mode: 'manual_check';
  readonly monitoringFlag: 'PROFILE_SEARCH_MONITORING';
  readonly monitoringDefault: boolean;
  readonly serpApiRequests: 0;
  readonly instruction: string;
  readonly rows: readonly VisibilityAuditSearchRow[];
}

export interface CitationQuestionRow {
  readonly question: string;
  readonly category: string;
  readonly checks: readonly VisibilityAuditCitationEntry[];
}

export interface CitationSection {
  readonly disclosure: string;
  readonly questions: readonly CitationQuestionRow[];
  readonly totalChecks: number;
  readonly citedCount: number;
  readonly shareOfCitation: number;
  readonly instruction: string;
}

export interface CatalogSection {
  readonly policy: string;
  readonly mismatches: readonly VisibilityAuditCatalogMismatch[];
}

export interface PixelRow {
  readonly platform: string;
  readonly present: boolean;
  readonly pixelIds: readonly string[];
}

export interface PixelSection {
  readonly rows: readonly PixelRow[];
}

export type AgenticFixKind =
  | {
      readonly kind: 'submission';
      readonly providerId: string;
      readonly ready: boolean;
    }
  | {
      readonly kind: 'dsp_bio_sync';
      readonly providerIds: readonly string[];
    }
  | {
      readonly kind: 'manual';
      readonly action: string;
    };

export interface AuditFix {
  readonly priority: number;
  readonly title: string;
  readonly reason: string;
  readonly agenticFix: AgenticFixKind;
}

export interface VisibilityAuditReport {
  readonly title: 'Digital Footprint & Visibility Audit';
  readonly artistName: string;
  readonly profilePath: string;
  readonly profileUrl: string;
  readonly generatedAt: string;
  readonly priceUsd: number;
  readonly creditNote: string;
  readonly evidenceNote: string | null;
  readonly identity: IdentitySection;
  readonly dspPresence: DspPresenceSection;
  readonly linkGraph: LinkGraphSection;
  readonly searchOwnership: SearchOwnershipSection;
  readonly citations: CitationSection;
  readonly catalog: CatalogSection;
  readonly pixels: PixelSection;
  readonly fixes: readonly AuditFix[];
}
