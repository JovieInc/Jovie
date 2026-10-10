import { CHARTMETRIC_ENDPOINTS } from './chartmetric-endpoints';
import {
  CANONICAL_ASSERTION_BLOCKER,
  CHARTMETRIC_ACCESS_BLOCKER,
  CHARTMETRIC_DOCS_URL,
  CHARTMETRIC_SCORE_BLOCKER,
  FRESHNESS_BLOCKER,
  METERING_BLOCKER,
  MUSICFETCH_AGGREGATOR_BLOCKER,
  MUSICFETCH_DOCS_URL,
  MUSICFETCH_DOCUMENTED_SERVICES,
  MUSICFETCH_LIVE_BLOCKER,
  MUSICFETCH_TERMS_URL,
  PRODUCTION_CERTIFICATION_BLOCKER,
  PUBLIC_CONTRACT_BLOCKER,
  SAME_NAME_LEASE_BLOCKER,
  SOCIALBLADE_ACCESS_BLOCKER,
  SOCIALBLADE_HISTORY_BLOCKER,
  SOCIALBLADE_OPAQUE_BLOCKER,
  STORY_ENGINE_BLOCKER,
} from './permissions';
import { SOCIALBLADE_DOC_URL, SOCIALBLADE_ROWS } from './socialblade-rows';
import type {
  Blocker,
  CatalogEntry,
  Evidence,
  ParityRow,
  ParityStatus,
  ProbeResult,
} from './types';

export const REQUIRED_LOCAL_PASS_IDS = [
  'musicfetch:search',
  'musicfetch:url',
  'musicfetch:upc',
  'musicfetch:isrc',
  'jovie:distinct-mbid-not-success',
  'jovie:empty-isrc-not-success',
  'jovie:upstream-error-not-success',
  'jovie:ambiguous-remix-not-success',
  'jovie:musicfetch-dormant-not-renewal',
] as const;

function probeEntry(
  id: string,
  vendor: CatalogEntry['vendor'],
  capability: string,
  docUrl: string,
  probeId: string
): CatalogEntry {
  return {
    id,
    vendor,
    capability,
    docUrl,
    admission: { type: 'probe', probeId },
  };
}

function blockedEntry(
  id: string,
  vendor: CatalogEntry['vendor'],
  capability: string,
  docUrl: string,
  status: ParityStatus,
  blocker: Blocker
): CatalogEntry {
  return {
    id,
    vendor,
    capability,
    docUrl,
    admission: { type: 'blocked', status, blocker },
  };
}

export function buildCatalog(): readonly CatalogEntry[] {
  const musicfetch: CatalogEntry[] = [
    probeEntry(
      'musicfetch:search',
      'musicfetch',
      'Search by query',
      MUSICFETCH_DOCS_URL,
      'search-exact'
    ),
    probeEntry(
      'musicfetch:url',
      'musicfetch',
      'Lookup by URL',
      `${MUSICFETCH_DOCS_URL}/url`,
      'url-lookup'
    ),
    probeEntry(
      'musicfetch:upc',
      'musicfetch',
      'Lookup album by UPC',
      `${MUSICFETCH_DOCS_URL}/upc`,
      'upc-lookup'
    ),
    probeEntry(
      'musicfetch:isrc',
      'musicfetch',
      'Lookup track by ISRC',
      `${MUSICFETCH_DOCS_URL}/isrc`,
      'isrc-lookup'
    ),
    blockedEntry(
      'musicfetch:sdk',
      'musicfetch',
      'Musicfetch SDK',
      `${MUSICFETCH_DOCS_URL}/sdk`,
      'access-blocked',
      MUSICFETCH_LIVE_BLOCKER
    ),
    blockedEntry(
      'musicfetch:service-coverage',
      'musicfetch',
      `documented services: ${MUSICFETCH_DOCUMENTED_SERVICES.join(', ')}`,
      MUSICFETCH_DOCS_URL,
      'access-blocked',
      MUSICFETCH_LIVE_BLOCKER
    ),
    blockedEntry(
      'musicfetch:live-api',
      'musicfetch',
      'Live Musicfetch API call',
      MUSICFETCH_DOCS_URL,
      'access-blocked',
      MUSICFETCH_LIVE_BLOCKER
    ),
    blockedEntry(
      'musicfetch:substitutable-aggregator',
      'musicfetch',
      'Substitutable music-data aggregation service',
      MUSICFETCH_TERMS_URL,
      'rights-blocked',
      MUSICFETCH_AGGREGATOR_BLOCKER
    ),
  ];

  const jovie: CatalogEntry[] = [
    probeEntry(
      'jovie:distinct-mbid-not-success',
      'jovie',
      'Distinct MusicBrainz ids stay ambiguous',
      MUSICFETCH_DOCS_URL,
      'distinct-mbid-not-success'
    ),
    probeEntry(
      'jovie:empty-isrc-not-success',
      'jovie',
      'Empty ISRC lookup is not a saved resolution',
      MUSICFETCH_DOCS_URL,
      'empty-isrc-not-success'
    ),
    probeEntry(
      'jovie:upstream-error-not-success',
      'jovie',
      'Upstream source failure is not a saved resolution',
      MUSICFETCH_DOCS_URL,
      'upstream-error-not-success'
    ),
    probeEntry(
      'jovie:ambiguous-remix-not-success',
      'jovie',
      'Remix-only search stays a choice',
      MUSICFETCH_DOCS_URL,
      'ambiguous-remix-not-success'
    ),
    probeEntry(
      'jovie:musicfetch-dormant-not-renewal',
      'jovie',
      'Missing MusicFetch token does not open a renewal',
      MUSICFETCH_TERMS_URL,
      'musicfetch-dormant-not-renewal'
    ),
    blockedEntry(
      'jovie:same-name-without-mbid',
      'jovie',
      'Same-name artists without a MusicBrainz id',
      MUSICFETCH_DOCS_URL,
      'missing',
      SAME_NAME_LEASE_BLOCKER
    ),
    blockedEntry(
      'jovie:canonical-assertions',
      'jovie',
      'Canonical assertion store',
      MUSICFETCH_DOCS_URL,
      'missing',
      CANONICAL_ASSERTION_BLOCKER
    ),
    blockedEntry(
      'jovie:public-contract',
      'jovie',
      'One public CLI and API contract',
      MUSICFETCH_DOCS_URL,
      'missing',
      PUBLIC_CONTRACT_BLOCKER
    ),
    blockedEntry(
      'jovie:freshness-cost',
      'jovie',
      'Freshness, shared cache, and cost controls',
      CHARTMETRIC_DOCS_URL,
      'access-blocked',
      FRESHNESS_BLOCKER
    ),
    blockedEntry(
      'jovie:replay-metering',
      'jovie',
      'Replay-safe entitlement metering',
      CHARTMETRIC_DOCS_URL,
      'access-blocked',
      METERING_BLOCKER
    ),
    blockedEntry(
      'jovie:story-engine-webhooks',
      'jovie',
      'Story Engine webhooks and outreach',
      SOCIALBLADE_DOC_URL,
      'access-blocked',
      STORY_ENGINE_BLOCKER
    ),
    blockedEntry(
      'jovie:production-certification',
      'jovie',
      'Deployed SHA and seven-day production soak',
      MUSICFETCH_DOCS_URL,
      'access-blocked',
      PRODUCTION_CERTIFICATION_BLOCKER
    ),
  ];

  const chartmetric = CHARTMETRIC_ENDPOINTS.map(([method, path, admission]) =>
    blockedEntry(
      `chartmetric:${method} ${path}`,
      'chartmetric',
      `${method} ${path}`,
      CHARTMETRIC_DOCS_URL,
      admission,
      admission === 'vendor-only-opaque-metric'
        ? CHARTMETRIC_SCORE_BLOCKER
        : CHARTMETRIC_ACCESS_BLOCKER
    )
  );

  const socialblade = SOCIALBLADE_ROWS.map(row => {
    const status: ParityStatus =
      row.kind === 'grade' || row.kind === 'sbrank'
        ? 'vendor-only-opaque-metric'
        : row.kind === 'history-downgrade'
          ? 'historical-coverage-gap'
          : 'access-blocked';
    const blocker =
      status === 'vendor-only-opaque-metric'
        ? SOCIALBLADE_OPAQUE_BLOCKER
        : status === 'historical-coverage-gap'
          ? SOCIALBLADE_HISTORY_BLOCKER
          : SOCIALBLADE_ACCESS_BLOCKER;
    return blockedEntry(
      `socialblade:${row.platform}:${row.kind}`,
      'socialblade',
      `${row.platform} ${row.kind}`,
      SOCIALBLADE_DOC_URL,
      status,
      blocker
    );
  });

  return [...musicfetch, ...jovie, ...chartmetric, ...socialblade];
}

function evidenceForProbe(probe: ProbeResult | undefined): {
  readonly status: ParityStatus;
  readonly evidence: Evidence;
} {
  if (!probe) {
    return { status: 'missing', evidence: { kind: 'untested', ref: '' } };
  }
  if (probe.outcome === 'skipped') {
    return {
      status: 'implemented',
      evidence: { kind: 'skipped', ref: probe.ref },
    };
  }
  if (probe.outcome === 'failed') {
    return {
      status: 'implemented',
      evidence: { kind: 'untested', ref: probe.ref },
    };
  }
  return {
    status: 'locally-tested',
    evidence: { kind: 'local-test', ref: probe.ref },
  };
}

export function materializeCatalog(
  entries: readonly CatalogEntry[],
  probes: readonly ProbeResult[]
): readonly ParityRow[] {
  const byId = new Map(probes.map(probe => [probe.id, probe]));
  return entries.map(entry => {
    if (entry.admission.type === 'blocked') {
      return {
        id: entry.id,
        vendor: entry.vendor,
        capability: entry.capability,
        docUrl: entry.docUrl,
        status: entry.admission.status,
        blocker: entry.admission.blocker,
      };
    }
    const materialized = evidenceForProbe(byId.get(entry.admission.probeId));
    return {
      id: entry.id,
      vendor: entry.vendor,
      capability: entry.capability,
      docUrl: entry.docUrl,
      status: materialized.status,
      evidence: materialized.evidence,
    };
  });
}
