import { findDerivedSpotifyMetricKeys } from './derived-metrics';
import { buildDspPresenceSection } from './dsp-presence';
import { buildAuditFixes } from './fixes';
import { buildIdentitySection } from './identity';
import { buildLinkGraphSection } from './link-graph';
import { visibilityAuditCreditNote, visibilityAuditPriceUsd } from './offer';
import {
  buildCatalogSection,
  buildCitationSection,
  buildPixelSection,
  buildSearchOwnershipSection,
} from './sections';
import type { VisibilityAuditInput, VisibilityAuditReport } from './types';

export function assembleVisibilityAudit(
  input: VisibilityAuditInput
): VisibilityAuditReport {
  const identity = buildIdentitySection(input);
  const dspPresence = buildDspPresenceSection(input);
  const linkGraph = buildLinkGraphSection(input);
  const searchOwnership = buildSearchOwnershipSection(input);
  const citations = buildCitationSection(input);
  const catalog = buildCatalogSection(input);
  const pixels = buildPixelSection(input);
  const fixes = buildAuditFixes({
    identity,
    dspPresence,
    linkGraph,
    catalog,
    pixels,
    searchOwnership,
    citations,
  });

  const report: VisibilityAuditReport = {
    title: 'Digital Footprint & Visibility Audit',
    artistName: input.artistName,
    profilePath: input.profilePath,
    profileUrl: input.profileUrl,
    generatedAt: input.generatedAt,
    priceUsd: visibilityAuditPriceUsd(),
    creditNote: visibilityAuditCreditNote(),
    evidenceNote: input.evidenceNote ?? null,
    identity,
    dspPresence,
    linkGraph,
    searchOwnership,
    citations,
    catalog,
    pixels,
    fixes,
  };

  const derived = findDerivedSpotifyMetricKeys(report);
  if (derived.length > 0) {
    throw new Error(
      `Visibility audit refused derived Spotify metrics: ${derived.join(', ')}`
    );
  }
  if (report.searchOwnership.serpApiRequests !== 0) {
    throw new Error('Visibility audit must not record SerpAPI requests');
  }
  return report;
}
