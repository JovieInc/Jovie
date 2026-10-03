import { getEnabledBioProviders } from '@/lib/dsp-bio-sync/providers';
import { musicBrainzAuthenticatedEditProvider } from '@/lib/submission-agent/providers/musicbrainz';
import type {
  AuditFix,
  CatalogSection,
  CitationSection,
  DspPresenceSection,
  IdentitySection,
  LinkGraphSection,
  PixelSection,
  SearchOwnershipSection,
} from './types';

/** Matches `xperiAllMusicProvider.id` without importing the email transport. */
export const ALLMUSIC_SUBMISSION_PROVIDER_ID = 'xperi_allmusic_email';

const MUSICBRAINZ_SUBMISSION_PROVIDER_ID =
  musicBrainzAuthenticatedEditProvider.id;

function addFix(
  fixes: AuditFix[],
  priority: number,
  title: string,
  reason: string,
  agenticFix: AuditFix['agenticFix']
): void {
  fixes.push({ priority, title, reason, agenticFix });
}

export function buildAuditFixes(input: {
  readonly identity: IdentitySection;
  readonly dspPresence: DspPresenceSection;
  readonly linkGraph: LinkGraphSection;
  readonly catalog: CatalogSection;
  readonly pixels: PixelSection;
  readonly searchOwnership: SearchOwnershipSection;
  readonly citations: CitationSection;
}): AuditFix[] {
  const fixes: AuditFix[] = [];
  const present = new Set(
    input.dspPresence.platforms.filter(row => row.present).map(row => row.key)
  );

  if (!input.identity.mbid) {
    addFix(
      fixes,
      1,
      'Create or confirm the MusicBrainz artist',
      'The MBID → Wikidata QID → ISNI chain starts at MusicBrainz. No MBID is stored, so QID and ISNI cannot be resolved from MusicBrainz url-rels.',
      {
        kind: 'submission',
        providerId: MUSICBRAINZ_SUBMISSION_PROVIDER_ID,
        ready: false,
      }
    );
  } else {
    if (!input.identity.wikidataQid) {
      addFix(
        fixes,
        2,
        'Resolve the Wikidata QID from the MusicBrainz MBID',
        'An MBID is stored and no Wikidata QID is stored. Re-run entity resolution (MB url-rel type wikidata) and store the QID.',
        { kind: 'manual', action: 'resolve_entity_ids' }
      );
    }
    if (input.identity.isnis.length === 0) {
      addFix(
        fixes,
        3,
        'Resolve ISNI from the MusicBrainz MBID',
        'An MBID is stored and no ISNI is stored. Re-run entity resolution against the MusicBrainz ISNI list.',
        { kind: 'manual', action: 'resolve_entity_ids' }
      );
    }
  }

  if (!present.has('allmusic')) {
    addFix(
      fixes,
      4,
      'Submit the artist to AllMusic',
      'AllMusic is missing from DSP presence. Pro maps this to the Xperi / AllMusic submission provider.',
      {
        kind: 'submission',
        providerId: ALLMUSIC_SUBMISSION_PROVIDER_ID,
        ready: true,
      }
    );
  }

  if (input.linkGraph.conflicts.length > 0) {
    addFix(
      fixes,
      5,
      'Resolve link-in-bio conflicts',
      input.linkGraph.conflicts.map(conflict => conflict.summary).join(' '),
      { kind: 'manual', action: 'consolidate_link_in_bio' }
    );
  }

  const openMismatches = input.catalog.mismatches.filter(
    mismatch => mismatch.status !== 'dismissed'
  );
  if (openMismatches.length > 0) {
    addFix(
      fixes,
      6,
      'Repair catalog ISRC mismatches',
      `${openMismatches.length} open catalog mismatch${openMismatches.length === 1 ? '' : 'es'} (ISRC presence only).`,
      { kind: 'manual', action: 'repair_catalog_isrc' }
    );
  }

  const bioProviders = getEnabledBioProviders().filter(
    ([providerId]) => !present.has(providerId)
  );
  if (bioProviders.length > 0) {
    addFix(
      fixes,
      7,
      'Sync artist bios to DSPs that are missing a profile link',
      `Enabled DSP bio sync has no stored link for: ${bioProviders
        .map(([, provider]) => provider.displayName)
        .join(', ')}.`,
      {
        kind: 'dsp_bio_sync',
        providerIds: bioProviders.map(([providerId]) => providerId),
      }
    );
  }

  const missingPixels = input.pixels.rows.filter(row => !row.present);
  if (missingPixels.length > 0) {
    addFix(
      fixes,
      8,
      'Add missing ad pixels',
      `No pixel init was stored for: ${missingPixels.map(row => row.platform).join(', ')}.`,
      { kind: 'manual', action: 'configure_ad_pixels' }
    );
  }

  if (input.searchOwnership.rows.length === 0) {
    addFix(
      fixes,
      9,
      'Record Google page-1 ownership by hand',
      input.searchOwnership.instruction,
      { kind: 'manual', action: 'manual_search_ownership' }
    );
  }

  if (input.citations.totalChecks === 0) {
    addFix(
      fixes,
      10,
      'Spot-check answer-engine citations',
      input.citations.instruction,
      { kind: 'manual', action: 'manual_citation_spot_check' }
    );
  }

  return fixes.toSorted((a, b) => a.priority - b.priority);
}
