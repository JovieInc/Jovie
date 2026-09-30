import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const TABLES = vi.hoisted(() => ({
  contacts: { __table: 'contacts' },
  contactEvidenceReviews: { __table: 'contact_evidence_reviews' },
  creatorProfiles: { __table: 'creator_profiles' },
  profileSurfaces: { __table: 'profile_surfaces' },
  profileSurfaceQualificationEvents: {
    __table: 'profile_surface_qualification_events',
  },
  dspArtistMatches: { __table: 'dsp_artist_matches' },
  discogReleases: { __table: 'discog_releases' },
  discogRecordings: { __table: 'discog_recordings' },
  providerLinks: { __table: 'provider_links' },
  dspCatalogScans: { __table: 'dsp_catalog_scans' },
  dspCatalogMismatches: { __table: 'dsp_catalog_mismatches' },
  profileSearchQueries: { __table: 'profile_search_queries' },
  profileSearchResults: { __table: 'profile_search_results' },
  profileSearchRuns: { __table: 'profile_search_runs' },
}));

const state = vi.hoisted(() => ({
  rowsByTable: new Map<object, unknown[]>(),
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
    select: () => ({
      from: (table: object) => chain(state.rowsByTable.get(table) ?? []),
    }),
    insert: (table: object) => ({
      values: (values: unknown) => {
        state.inserts.push({ table, values });
        return {
          onConflictDoUpdate: () => ({
            returning: async () => [{ id: 'contact-1', provenance: {} }],
          }),
          then: (resolve: (value: unknown) => unknown) => resolve(values),
        };
      },
    }),
    update: (table: object) => ({
      set: (values: unknown) => ({
        where: async () => {
          state.updates.push({ table, values });
        },
      }),
    }),
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...args: unknown[]) => ({ and: args })),
  desc: vi.fn((column: unknown) => column),
  eq: vi.fn((column: unknown, value: unknown) => ({ eq: [column, value] })),
  inArray: vi.fn((column: unknown, values: unknown) => ({ inArray: values })),
}));

vi.mock('@/lib/db/schema/contacts', () => ({
  contacts: TABLES.contacts,
  contactEvidenceReviews: TABLES.contactEvidenceReviews,
}));
vi.mock('@/lib/db/schema/content', () => ({
  discogRecordings: TABLES.discogRecordings,
  discogReleases: TABLES.discogReleases,
  providerLinks: TABLES.providerLinks,
}));
vi.mock('@/lib/db/schema/dsp-catalog-scan', () => ({
  dspCatalogMismatches: TABLES.dspCatalogMismatches,
  dspCatalogScans: TABLES.dspCatalogScans,
}));
vi.mock('@/lib/db/schema/dsp-enrichment', () => ({
  dspArtistMatches: TABLES.dspArtistMatches,
}));
vi.mock('@/lib/db/schema/profile-search', () => ({
  profileSearchQueries: TABLES.profileSearchQueries,
  profileSearchResults: TABLES.profileSearchResults,
  profileSearchRuns: TABLES.profileSearchRuns,
}));
vi.mock('@/lib/db/schema/profile-surfaces', () => ({
  profileSurfaceQualificationEvents: TABLES.profileSurfaceQualificationEvents,
  profileSurfaces: TABLES.profileSurfaces,
}));
vi.mock('@/lib/db/schema/profiles', () => ({
  creatorProfiles: TABLES.creatorProfiles,
}));

import {
  certifyContactEvidence,
  getContactCertificationInspection,
  reviewContactEvidence,
} from '@/lib/admin/contact-certification';
import type { CanonicalContactListRow } from '@/lib/admin/contacts';

const NOW = new Date('2026-09-29T00:00:00Z');

const contact = (
  overrides: Partial<CanonicalContactListRow> = {}
): CanonicalContactListRow =>
  ({
    dedupeKey: 'email:ada@example.com',
    stage: 'approved',
    displayName: 'Ada Lovelace',
    email: 'ada@example.com',
    handle: 'ada',
    avatarUrl: null,
    sources: ['waitlist'],
    sourceIds: {},
    stageAt: null,
    activityAt: NOW,
    firstSeenAt: NOW,
    userId: 'u1',
    creatorProfileId: 'p1',
    leadId: null,
    waitlistEntryId: 'w1',
    overrideStage: null,
    certifiedAt: null,
    identityCorrected: false,
    ...overrides,
  }) as CanonicalContactListRow;

function seed(rows: Partial<Record<keyof typeof TABLES, unknown[]>>) {
  for (const [name, table] of Object.entries(TABLES)) {
    state.rowsByTable.set(table, rows[name as keyof typeof TABLES] ?? []);
  }
}

function seedRichProfile() {
  seed({
    creatorProfiles: [
      {
        id: 'p1',
        bio: 'Analytical engine DJ',
        location: 'London',
        genres: ['electronic'],
        ingestionSourcePlatform: 'spotify',
        updatedAt: NOW,
      },
    ],
    dspArtistMatches: [
      {
        id: 'dsp1',
        providerId: 'apple_music',
        externalArtistName: 'Ada Lovelace',
        externalArtistId: 'ext1',
        externalArtistUrl: 'https://music.apple.com/artist/ada',
        matchSource: 'isrc',
        matchingIsrcCount: 4,
        matchingUpcCount: 1,
        totalTracksChecked: 10,
        confidenceScore: '0.92',
        updatedAt: NOW,
      },
    ],
    profileSurfaces: [
      {
        id: 's1',
        kind: 'social',
        platform: 'instagram',
        displayName: 'ada',
        handle: 'ada',
        url: 'https://instagram.com/ada',
        qualificationStatus: 'suggested',
        identityConfidence: '0.80',
        lastObservedAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 's2',
        kind: 'website',
        platform: 'web',
        url: 'https://ada.example.com',
        qualificationStatus: 'qualified',
        identityConfidence: '0.99',
        lastDiscoveredAt: NOW,
        updatedAt: NOW,
      },
      {
        id: 's3',
        kind: 'jovie',
        platform: 'jovie',
        url: 'https://jov.ie/ada',
        updatedAt: NOW,
      },
      {
        id: 's4',
        kind: 'dsp',
        platform: 'spotify',
        url: 'https://open.spotify.com/artist/ada',
        retiredAt: NOW,
        updatedAt: NOW,
      },
    ],
    discogReleases: [
      {
        id: 'rel1',
        title: 'Engines',
        upc: '123456789012',
        sourceType: 'spotify',
        totalTracks: 1,
        updatedAt: NOW,
      },
    ],
    discogRecordings: [
      {
        id: 'rec1',
        title: 'Engine One',
        isrc: 'USABC2600001',
        sourceType: 'spotify',
        updatedAt: NOW,
      },
      {
        id: 'rec2',
        title: 'Engine Two',
        isrc: null,
        sourceType: 'spotify',
        updatedAt: NOW,
      },
    ],
    dspCatalogScans: [{ id: 'scan1', status: 'completed', updatedAt: NOW }],
    dspCatalogMismatches: [
      {
        id: 'mm1',
        mismatchType: 'isrc_mismatch',
        externalTrackName: 'Engine One (Remix)',
        isrc: 'USABC2600099',
        status: 'open',
        updatedAt: NOW,
      },
      {
        id: 'mm2',
        mismatchType: 'missing_track',
        externalTrackName: null,
        isrc: 'USABC2600100',
        status: 'dismissed',
        updatedAt: NOW,
      },
    ],
    providerLinks: [
      {
        id: 'pl1',
        url: 'https://music.apple.com/album/engines',
        sourceType: 'apple_music',
        updatedAt: NOW,
      },
    ],
    profileSearchRuns: [{ id: 'run1', provider: 'brave', completedAt: NOW }],
    profileSearchResults: [
      {
        id: 'sr1',
        position: 1,
        title: 'Ada Lovelace official',
        url: 'https://ada.example.com',
        classification: 'official',
        snippet: 'Official site',
        createdAt: NOW,
      },
    ],
  });
}

beforeEach(() => {
  state.rowsByTable.clear();
  state.inserts.length = 0;
  state.updates.length = 0;
});

describe('getContactCertificationInspection', () => {
  it('builds evidence drafts across every checked source class', async () => {
    seedRichProfile();
    const result = await getContactCertificationInspection(contact(), NOW);

    const categories = new Set(result.items.map(row => row.category));
    expect(categories).toContain('identity');
    expect(categories).toContain('dsp');
    expect(categories).toContain('social');
    expect(categories).toContain('websites');
    expect(categories).toContain('catalog');
    expect(categories).toContain('destinations');
    expect(categories).toContain('facts');
    expect(categories).toContain('search');
    expect(categories).toContain('conflicts');
    expect(categories).not.toContain('coverage');

    // jovie + retired surfaces are skipped; dismissed mismatch is skipped.
    expect(result.items.some(row => row.key === 'surface:s3')).toBe(false);
    expect(result.items.some(row => row.key === 'surface:s4')).toBe(false);
    expect(result.items.some(row => row.key === 'catalog-conflict:mm2')).toBe(
      false
    );

    expect(result.coverage.missingSourceClasses).toEqual([]);
    expect(result.status).toBe('conflicted');
  });

  it('adds coverage rows for unchecked classes without a profile', async () => {
    seed({});
    const result = await getContactCertificationInspection(
      contact({ creatorProfileId: null }),
      NOW
    );
    const coverage = result.items.filter(row => row.category === 'coverage');
    expect(coverage.map(row => row.key).sort()).toEqual([
      'coverage:catalog',
      'coverage:dsp',
      'coverage:reachability',
      'coverage:search',
    ]);
    expect(result.status).toBe('needs_review');
  });

  it('marks corrected canonical identity at full confidence', async () => {
    seed({});
    const result = await getContactCertificationInspection(
      contact({ creatorProfileId: null, identityCorrected: true }),
      NOW
    );
    const name = result.items.find(row => row.key === 'canonical:display-name');
    expect(name?.confidence).toBe(1);
    expect(name?.source).toBe('founder correction');
  });

  it('applies founder reviews by exact key and revision', async () => {
    seedRichProfile();
    const first = await getContactCertificationInspection(contact(), NOW);
    const target = first.items.find(row => row.key === 'canonical:handle');
    expect(target).toBeDefined();

    seed({
      contactEvidenceReviews: [
        {
          evidenceKey: target!.key,
          evidenceRevision: target!.revision,
          decision: 'yes',
          createdAt: NOW,
        },
        {
          evidenceKey: target!.key,
          evidenceRevision: 'other-revision',
          decision: 'no',
          createdAt: NOW,
        },
      ],
    });
    const second = await getContactCertificationInspection(contact(), NOW);
    const reviewed = second.items.find(row => row.key === target!.key);
    expect(reviewed?.decision).toBe('yes');
    expect(reviewed?.freshness).toBe('fresh');
  });
});

describe('reviewContactEvidence', () => {
  it('returns stale when the evidence key or revision no longer matches', async () => {
    seed({});
    const result = await reviewContactEvidence({
      contact: contact({ creatorProfileId: null }),
      evidenceKey: 'canonical:email',
      evidenceRevision: 'bogus',
      decision: 'yes',
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: false, reason: 'stale' });
  });

  it('rejects corrections on non-canonical evidence', async () => {
    seedRichProfile();
    const inspection = await getContactCertificationInspection(contact(), NOW);
    const target = inspection.items.find(row => row.key === 'dsp:dsp1');
    const result = await reviewContactEvidence({
      contact: contact(),
      evidenceKey: target!.key,
      evidenceRevision: target!.revision,
      decision: 'no',
      correction: 'Different Artist',
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: false, reason: 'not_correctable' });
  });

  it('records a correction and rewrites the canonical identity', async () => {
    seed({});
    const subject = contact({ creatorProfileId: null });
    const inspection = await getContactCertificationInspection(subject, NOW);
    const target = inspection.items.find(row => row.key === 'canonical:handle');
    const result = await reviewContactEvidence({
      contact: subject,
      evidenceKey: target!.key,
      evidenceRevision: target!.revision,
      decision: 'yes',
      correction: ' @ada2 ',
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: true });

    const review = state.inserts.find(
      row => row.table === TABLES.contactEvidenceReviews
    );
    expect(review?.values).toMatchObject({
      dedupeKey: subject.dedupeKey,
      evidenceKey: 'canonical:handle',
      decision: 'no',
      correction: { value: '@ada2' },
    });

    const update = state.updates.find(row => row.table === TABLES.contacts);
    expect(update?.values).toMatchObject({
      primaryHandle: 'ada2',
      provenance: { identityCorrection: true },
    });
  });

  it('projects a yes decision onto the surface qualification state', async () => {
    seedRichProfile();
    const subject = contact();
    const inspection = await getContactCertificationInspection(subject, NOW);
    const target = inspection.items.find(row => row.key === 'surface:s1');
    const result = await reviewContactEvidence({
      contact: subject,
      evidenceKey: target!.key,
      evidenceRevision: target!.revision,
      decision: 'yes',
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: true });

    const update = state.updates.find(
      row => row.table === TABLES.profileSurfaces
    );
    expect(update?.values).toMatchObject({
      qualificationStatus: 'qualified',
      identityConfidence: '1.00',
      isOfficial: true,
    });
    const event = state.inserts.find(
      row => row.table === TABLES.profileSurfaceQualificationEvents
    );
    expect(event?.values).toMatchObject({
      surfaceId: 's1',
      previousStatus: 'suggested',
      nextStatus: 'qualified',
      reason: 'crm_yes',
    });
  });

  it('projects a no decision onto the DSP artist match', async () => {
    seedRichProfile();
    const subject = contact();
    const inspection = await getContactCertificationInspection(subject, NOW);
    const target = inspection.items.find(row => row.key === 'dsp:dsp1');
    const result = await reviewContactEvidence({
      contact: subject,
      evidenceKey: target!.key,
      evidenceRevision: target!.revision,
      decision: 'no',
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: true });
    const update = state.updates.find(
      row => row.table === TABLES.dspArtistMatches
    );
    expect(update?.values).toMatchObject({
      status: 'rejected',
      rejectionReason: 'crm_founder_rejected',
    });
  });

  it('projects an unsure decision as conflicting surface state', async () => {
    seedRichProfile();
    const subject = contact();
    const inspection = await getContactCertificationInspection(subject, NOW);
    const target = inspection.items.find(row => row.key === 'surface:s1');
    const result = await reviewContactEvidence({
      contact: subject,
      evidenceKey: target!.key,
      evidenceRevision: target!.revision,
      decision: 'unsure',
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: true });
    const update = state.updates.find(
      row => row.table === TABLES.profileSurfaces
    );
    expect(update?.values).toMatchObject({
      qualificationStatus: 'conflicting',
      isOfficial: false,
      lastVerifiedAt: null,
    });
  });
});

describe('certifyContactEvidence', () => {
  it('refuses when the revision does not match or evidence is unresolved', async () => {
    seedRichProfile();
    const subject = contact();
    const result = await certifyContactEvidence({
      contact: subject,
      evidenceRevision: 'wrong',
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: false, reason: 'not_certifiable' });
  });

  it('persists certification and promotes the contact stage', async () => {
    // Minimal profile so every required class is checked and every item is
    // machine-resolvable: fresh, non-conflict, confidence >= 0.9.
    seed({
      dspArtistMatches: [
        {
          id: 'dsp1',
          providerId: 'spotify',
          externalArtistName: 'Ada Lovelace',
          matchSource: 'isrc',
          matchingIsrcCount: 3,
          matchingUpcCount: 0,
          totalTracksChecked: 3,
          confidenceScore: '0.99',
          updatedAt: NOW,
        },
      ],
      profileSurfaces: [
        {
          id: 's1',
          kind: 'social',
          platform: 'instagram',
          handle: 'ada',
          url: 'https://instagram.com/ada',
          qualificationStatus: 'qualified',
          identityConfidence: '0.95',
          lastObservedAt: NOW,
          updatedAt: NOW,
        },
      ],
      discogReleases: [
        {
          id: 'rel1',
          title: 'Engines',
          upc: '123456789012',
          sourceType: 'spotify',
          totalTracks: 2,
          updatedAt: NOW,
        },
      ],
      profileSearchRuns: [{ id: 'run1', provider: 'brave', completedAt: NOW }],
      profileSearchResults: [],
    });
    const subject = contact();
    const inspection = await getContactCertificationInspection(subject, NOW);
    expect(inspection.canCertify).toBe(true);

    const result = await certifyContactEvidence({
      contact: subject,
      evidenceRevision: inspection.evidenceRevision,
      actorUserId: 'f1',
    });
    expect(result).toEqual({ ok: true });

    const review = state.inserts.find(
      row => row.table === TABLES.contactEvidenceReviews
    );
    expect(review?.values).toMatchObject({
      evidenceKey: 'profile:certification',
      evidenceRevision: inspection.evidenceRevision,
      decision: 'yes',
    });
    const update = state.updates.find(row => row.table === TABLES.contacts);
    expect(update?.values).toMatchObject({
      stage: 'certified',
      certifiedByUserId: 'f1',
      stageSource: 'founder',
    });
  });
});
