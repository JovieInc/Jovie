// biome-ignore-all format: compact table-driven regressions keep full behavior coverage below the hard PR cap.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const state = vi.hoisted(() => ({
  rows: new Map<object, unknown[]>(),
  inserts: [] as { table: object; values: unknown }[],
  updates: [] as { table: object; values: unknown }[],
}));

function chain(rows: unknown[]) {
  const node: Record<string, unknown> = {
    where: () => node,
    orderBy: () => node,
    limit: () => node,
    innerJoin: () => node,
    then: (resolve: (value: unknown[]) => unknown) => resolve(rows),
  };
  return node;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: (table: object) => chain(state.rows.get(table) ?? []) }),
    insert: (table: object) => ({ values: (values: unknown) => {
      state.inserts.push({ table, values });
      return { onConflictDoUpdate: () => ({ returning: async () => [{ id: 'contact-1', provenance: {} }] }), then: (resolve: (value: unknown) => unknown) => resolve(values) };
    } }),
    update: (table: object) => ({ set: (values: unknown) => ({ where: async () => { state.updates.push({ table, values }); } }) }),
  },
}));

import { certifyContactEvidence, getContactCertificationInspection, reviewContactEvidence } from '@/lib/admin/contact-certification';
import type { CanonicalContactListRow } from '@/lib/admin/contacts';
import { contactEvidenceReviews, contacts } from '@/lib/db/schema/contacts';
import { discogRecordings, discogReleases, providerLinks } from '@/lib/db/schema/content';
import { dspCatalogMismatches, dspCatalogScans } from '@/lib/db/schema/dsp-catalog-scan';
import { dspArtistMatches } from '@/lib/db/schema/dsp-enrichment';
import { profileSearchResults, profileSearchRuns } from '@/lib/db/schema/profile-search';
import { profileSurfaceQualificationEvents, profileSurfaces } from '@/lib/db/schema/profile-surfaces';
import { creatorProfiles } from '@/lib/db/schema/profiles';

const TABLES = { contactEvidenceReviews, contacts, creatorProfiles, profileSurfaces, profileSurfaceQualificationEvents, dspArtistMatches, discogReleases, discogRecordings, providerLinks, dspCatalogScans, dspCatalogMismatches, profileSearchRuns, profileSearchResults };
const NOW = new Date('2026-09-29T00:00:00Z');
const contact = (overrides: Partial<CanonicalContactListRow> = {}) => ({ dedupeKey: 'email:ada@example.com', stage: 'approved', displayName: 'Ada Lovelace', email: 'ada@example.com', handle: 'ada', avatarUrl: null, sources: ['waitlist'], sourceIds: {}, stageAt: null, activityAt: NOW, firstSeenAt: NOW, userId: 'u1', creatorProfileId: 'p1', leadId: null, waitlistEntryId: 'w1', overrideStage: null, certifiedAt: null, identityCorrected: false, ...overrides }) as CanonicalContactListRow;

function seed(rows: Partial<Record<keyof typeof TABLES, unknown[]>> = {}) {
  for (const [name, table] of Object.entries(TABLES)) state.rows.set(table, rows[name as keyof typeof TABLES] ?? []);
}

const rich = () => seed({ creatorProfiles: [{ id: 'p1', bio: 'Analytical engine DJ', location: 'London', genres: ['electronic'], ingestionSourcePlatform: 'spotify', updatedAt: NOW }], dspArtistMatches: [{ id: 'dsp1', providerId: 'apple_music', externalArtistName: 'Ada Lovelace', externalArtistId: 'ext1', externalArtistUrl: 'https://music.apple.com/artist/ada', matchSource: 'isrc', matchingIsrcCount: 4, matchingUpcCount: 1, totalTracksChecked: 10, confidenceScore: '0.92', updatedAt: NOW }], profileSurfaces: [{ id: 's1', kind: 'social', platform: 'instagram', displayName: 'ada', handle: 'ada', url: 'https://instagram.com/ada', qualificationStatus: 'suggested', identityConfidence: '0.80', lastObservedAt: NOW, updatedAt: NOW }, { id: 's2', kind: 'website', platform: 'web', url: 'https://ada.example.com', qualificationStatus: 'qualified', identityConfidence: '0.99', lastDiscoveredAt: NOW, updatedAt: NOW }, { id: 's3', kind: 'jovie', platform: 'jovie', url: 'https://jov.ie/ada', updatedAt: NOW }, { id: 's4', kind: 'dsp', platform: 'spotify', url: 'https://open.spotify.com/artist/ada', retiredAt: NOW, updatedAt: NOW }], discogReleases: [{ id: 'rel1', title: 'Engines', upc: '123456789012', sourceType: 'spotify', totalTracks: 1, updatedAt: NOW }], discogRecordings: [{ id: 'rec1', title: 'Engine One', isrc: 'USABC2600001', sourceType: 'spotify', updatedAt: NOW }, { id: 'rec2', title: 'Engine Two', isrc: null, sourceType: 'spotify', updatedAt: NOW }], dspCatalogScans: [{ id: 'scan1', status: 'completed', updatedAt: NOW }], dspCatalogMismatches: [{ id: 'mm1', mismatchType: 'isrc_mismatch', externalTrackName: 'Engine One (Remix)', isrc: 'USABC2600099', status: 'open', updatedAt: NOW }, { id: 'mm2', mismatchType: 'missing_track', externalTrackName: null, isrc: 'USABC2600100', status: 'dismissed', updatedAt: NOW }], providerLinks: [{ id: 'pl1', url: 'https://music.apple.com/album/engines', sourceType: 'apple_music', updatedAt: NOW }], profileSearchRuns: [{ id: 'run1', provider: 'brave', completedAt: NOW }], profileSearchResults: [{ id: 'sr1', position: 1, title: 'Ada Lovelace official', url: 'https://ada.example.com', classification: 'official', snippet: 'Official site', createdAt: NOW }] });

const certifiable = () => seed({ dspArtistMatches: [{ id: 'dsp1', providerId: 'spotify', externalArtistName: 'Ada Lovelace', matchSource: 'isrc', matchingIsrcCount: 3, matchingUpcCount: 0, totalTracksChecked: 3, confidenceScore: '0.99', updatedAt: NOW }], profileSurfaces: [{ id: 's1', kind: 'social', platform: 'instagram', handle: 'ada', url: 'https://instagram.com/ada', qualificationStatus: 'qualified', identityConfidence: '0.95', lastObservedAt: NOW, updatedAt: NOW }], discogReleases: [{ id: 'rel1', title: 'Engines', upc: '123456789012', sourceType: 'spotify', totalTracks: 2, updatedAt: NOW }], profileSearchRuns: [{ id: 'run1', provider: 'brave', completedAt: NOW }] });

beforeEach(() => { state.rows.clear(); state.inserts.length = 0; state.updates.length = 0; });

describe('contact certification inspection', () => {
  it('groups every supported source and ignores retired or dismissed evidence', async () => { rich(); const result = await getContactCertificationInspection(contact(), NOW); expect(new Set(result.items.map(row => row.category))).toEqual(new Set(['identity', 'dsp', 'social', 'websites', 'catalog', 'destinations', 'facts', 'search', 'conflicts'])); expect(result.items.map(row => row.key)).not.toEqual(expect.arrayContaining(['surface:s3', 'surface:s4', 'catalog-conflict:mm2'])); expect(result).toMatchObject({ status: 'conflicted', coverage: { missingSourceClasses: [] } }); });
  it('adds missing coverage and honors corrected and exact-revision identity reviews', async () => { seed(); const subject = contact({ creatorProfileId: null, identityCorrected: true }); const corrected = await getContactCertificationInspection(subject, NOW); expect(corrected.items.find(row => row.key === 'canonical:display-name')).toMatchObject({ confidence: 1, source: 'founder correction' }); const target = corrected.items.find(row => row.key === 'canonical:handle')!; seed({ contactEvidenceReviews: [{ evidenceKey: target.key, evidenceRevision: target.revision, decision: 'yes', createdAt: NOW }] }); const reviewed = await getContactCertificationInspection(subject, NOW); expect(reviewed.items.find(row => row.key === target.key)?.decision).toBe('yes'); expect(reviewed.coverage.missingSourceClasses).toEqual(['dsp', 'catalog', 'search', 'reachability']); });
});

describe('contact evidence decisions', () => {
  it('rejects stale revisions and non-canonical corrections', async () => { seed(); await expect(reviewContactEvidence({ contact: contact({ creatorProfileId: null }), evidenceKey: 'canonical:email', evidenceRevision: 'bogus', decision: 'yes', actorUserId: 'f1' })).resolves.toEqual({ ok: false, reason: 'stale' }); rich(); const dsp = (await getContactCertificationInspection(contact(), NOW)).items.find(row => row.key === 'dsp:dsp1')!; await expect(reviewContactEvidence({ contact: contact(), evidenceKey: dsp.key, evidenceRevision: dsp.revision, decision: 'no', correction: 'Different Artist', actorUserId: 'f1' })).resolves.toEqual({ ok: false, reason: 'not_correctable' }); });
  it('preserves the rejected candidate while correcting canonical identity', async () => { seed(); const subject = contact({ creatorProfileId: null }); const target = (await getContactCertificationInspection(subject, NOW)).items.find(row => row.key === 'canonical:handle')!; await expect(reviewContactEvidence({ contact: subject, evidenceKey: target.key, evidenceRevision: target.revision, decision: 'yes', correction: ' @ada2 ', actorUserId: 'f1' })).resolves.toEqual({ ok: true }); expect(state.inserts.find(row => row.table === contactEvidenceReviews)?.values).toMatchObject({ evidenceKey: target.key, decision: 'no', correction: { value: '@ada2' } }); expect(state.updates.find(row => row.table === contacts)?.values).toMatchObject({ primaryHandle: 'ada2', provenance: { identityCorrection: true } }); });
  it.each([['surface:s1', 'yes', profileSurfaces, { qualificationStatus: 'qualified', identityConfidence: '1.00', isOfficial: true }], ['surface:s1', 'unsure', profileSurfaces, { qualificationStatus: 'conflicting', isOfficial: false, lastVerifiedAt: null }], ['dsp:dsp1', 'no', dspArtistMatches, { status: 'rejected', rejectionReason: 'crm_founder_rejected' }]] as const)('projects %s = %s', async (key, decision, table, expected) => { rich(); const subject = contact(); const target = (await getContactCertificationInspection(subject, NOW)).items.find(row => row.key === key)!; await expect(reviewContactEvidence({ contact: subject, evidenceKey: target.key, evidenceRevision: target.revision, decision, actorUserId: 'f1' })).resolves.toEqual({ ok: true }); expect(state.updates.find(row => row.table === table)?.values).toMatchObject(expected); });
});

describe('profile certification', () => {
  it('binds certification to the current complete revision and promotes the contact', async () => { rich(); await expect(certifyContactEvidence({ contact: contact(), evidenceRevision: 'wrong', actorUserId: 'f1' })).resolves.toEqual({ ok: false, reason: 'not_certifiable' }); certifiable(); const inspection = await getContactCertificationInspection(contact(), NOW); expect(inspection.canCertify).toBe(true); await expect(certifyContactEvidence({ contact: contact(), evidenceRevision: inspection.evidenceRevision, actorUserId: 'f1' })).resolves.toEqual({ ok: true }); expect(state.inserts.find(row => row.table === contactEvidenceReviews)?.values).toMatchObject({ evidenceKey: 'profile:certification', evidenceRevision: inspection.evidenceRevision, decision: 'yes' }); expect(state.updates.find(row => row.table === contacts)?.values).toMatchObject({ stage: 'certified', certifiedByUserId: 'f1', stageSource: 'founder' }); });
});
