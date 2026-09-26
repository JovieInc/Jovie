import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  getMusicBrainzArtist: vi.fn(),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
    const expression = strings.join('?');
    if (expression.includes('<= excluded.updated_at')) return 'only_if_fresh';
    if (expression.includes('COALESCE')) return 'preserved_resolution_time';
    if (expression.includes("THEN 'detected'")) {
      return 'reopen_or_preserve_state';
    }
    if (expression.includes('THEN NULL')) {
      return 'reopen_or_preserve_acted_at';
    }
    const value = expression.includes('::jsonb')
      ? (JSON.parse(String(values[0])) as Record<string, unknown>)
      : values[0];
    return { as: vi.fn(() => value) };
  }),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

vi.mock('@/lib/db/schema/profile-search', () => ({
  profileSurfaceIssues: {
    id: 'id',
    idempotencyKey: 'idempotency_key',
    updatedAt: 'updated_at',
  },
}));

vi.mock('@/lib/db/schema/profile-surfaces', () => ({
  profileSurfaces: {
    id: 'id',
    creatorProfileId: 'creator_profile_id',
    platform: 'platform',
    kind: 'kind',
    qualificationStatus: 'qualification_status',
    identityConfidence: 'identity_confidence',
    externalId: 'external_id',
    normalizedUrl: 'normalized_url',
    retiredAt: 'retired_at',
    updatedAt: 'updated_at',
  },
}));

vi.mock('@/lib/dsp-enrichment/providers/musicbrainz', () => ({
  getMusicBrainzArtist: mocks.getMusicBrainzArtist,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions) => ({ and: conditions })),
  eq: vi.fn((column, value) => ({ column, value })),
  isNull: vi.fn(column => ({ isNull: column })),
  sql: mocks.sql,
}));

const CREATOR_PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const SURFACE_ID = '22222222-2222-4222-8222-222222222222';
const MBID = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-30T12:00:00.000Z');

function surface(overrides: Record<string, unknown> = {}) {
  return {
    id: SURFACE_ID,
    creatorProfileId: CREATOR_PROFILE_ID,
    platform: 'musicbrainz',
    kind: 'authority',
    qualificationStatus: 'qualified',
    identityConfidence: '0.95',
    externalId: MBID,
    normalizedUrl: `https://musicbrainz.org/artist/${MBID}`,
    updatedAt: new Date('2026-08-30T11:00:00.000Z'),
    ...overrides,
  };
}

interface ArrangeDatabaseOptions {
  readonly currentRows?: ReadonlyArray<Record<string, unknown>>;
  readonly existingIssueRows?: ReadonlyArray<{ readonly id: string }>;
  readonly issueRows?: ReadonlyArray<{ readonly id: string }>;
}

function arrangeDatabase(
  rows: ReadonlyArray<Record<string, unknown>>,
  options: ArrangeDatabaseOptions = {}
) {
  const queryFor = (result: ReadonlyArray<Record<string, unknown>>) => {
    const limit = vi.fn().mockResolvedValue(result);
    const lock = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ for: lock, limit });
    const from = vi.fn().mockReturnValue({ where });
    return { from };
  };
  const sourceFor = vi.fn().mockReturnValue({});
  const sourceWhere = vi.fn().mockReturnValue({ for: sourceFor });
  const sourceFrom = vi.fn().mockReturnValue({ where: sourceWhere });
  mocks.select.mockReset();
  mocks.select
    .mockReturnValueOnce(queryFor(rows))
    .mockReturnValueOnce({ from: sourceFrom })
    .mockReturnValueOnce(queryFor(options.currentRows ?? rows))
    .mockReturnValueOnce(queryFor(options.existingIssueRows ?? []));

  const returning = vi
    .fn()
    .mockResolvedValue(options.issueRows ?? [{ id: 'issue-1' }]);
  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
  const select = vi.fn().mockReturnValue({ onConflictDoUpdate });
  mocks.insert.mockReturnValue({ select });

  return { onConflictDoUpdate, select, sourceFor };
}

describe('MusicBrainz directory assessment persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists one fresh assessment with evidence and a non-submission action', async () => {
    const write = arrangeDatabase([surface()]);
    mocks.getMusicBrainzArtist.mockResolvedValue({
      id: MBID,
      name: 'Example Artist',
      type: 'Person',
      country: 'US',
    });

    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );
    const result = await assessAndPersistMusicBrainzDirectoryEntity({
      creatorProfileId: CREATOR_PROFILE_ID,
      surfaceId: SURFACE_ID,
      now: NOW,
    });

    expect(mocks.getMusicBrainzArtist).toHaveBeenCalledWith(MBID);
    expect(result).toMatchObject({
      issueId: 'issue-1',
      writeDisposition: 'persisted',
      assessment: {
        outcome: 'current',
        confidence: 0.95,
        owner: 'creator',
        freshness: { status: 'fresh' },
        nextAction: {
          accountCreationAllowed: false,
          externalSubmissionAllowed: false,
        },
      },
    });
    expect(mocks.select.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        creatorProfileId: CREATOR_PROFILE_ID,
        surfaceId: SURFACE_ID,
        issueType: 'directory_entity_assessment',
        state: 'resolved',
        metadata: expect.objectContaining({
          schemaVersion: 1,
          outcome: 'current',
          confidence: 0.95,
          owner: 'creator',
          expectedImpact:
            'Protect the creator authority identity used by Presence.',
          evidence: expect.objectContaining({
            source: 'musicbrainz_api',
            observedEntityId: MBID,
          }),
          freshness: expect.objectContaining({ status: 'fresh' }),
          nextAction: expect.objectContaining({
            externalSubmissionAllowed: false,
          }),
        }),
      })
    );
    expect(write.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        target: 'idempotency_key',
        setWhere: 'only_if_fresh',
      })
    );
    expect(write.sourceFor).toHaveBeenCalledWith('update');
    expect(write.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          creatorProfileId: CREATOR_PROFILE_ID,
          resolvedAt: 'preserved_resolution_time',
        }),
      })
    );
    expect(write.onConflictDoUpdate.mock.calls[0]?.[0]?.set).not.toHaveProperty(
      'actedAt'
    );
  });

  it('normalizes an uppercase surface MBID before the provider read', async () => {
    const uppercaseMbid = MBID.toUpperCase();
    arrangeDatabase([
      surface({
        externalId: uppercaseMbid,
        normalizedUrl: `https://musicbrainz.org/artist/${uppercaseMbid}`,
      }),
    ]);
    mocks.getMusicBrainzArtist.mockResolvedValue({
      id: MBID,
      name: 'Example Artist',
    });
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    const result = await assessAndPersistMusicBrainzDirectoryEntity({
      creatorProfileId: CREATOR_PROFILE_ID,
      surfaceId: SURFACE_ID,
      now: NOW,
    });

    expect(mocks.getMusicBrainzArtist).toHaveBeenCalledWith(MBID);
    expect(result.assessment.outcome).toBe('current');
  });

  it('does not persist evidence if the source surface changes during fetch', async () => {
    arrangeDatabase([surface()], {
      currentRows: [
        surface({ updatedAt: new Date('2026-08-30T11:30:00.000Z') }),
      ],
      issueRows: [],
    });
    mocks.getMusicBrainzArtist.mockResolvedValue({
      id: MBID,
      name: 'Example Artist',
    });
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    await expect(
      assessAndPersistMusicBrainzDirectoryEntity({
        creatorProfileId: CREATOR_PROFILE_ID,
        surfaceId: SURFACE_ID,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'surface_changed_during_assessment' });
    expect(mocks.insert).toHaveBeenCalledTimes(1);
  });

  it.each([
    { id: '99999999-9999-4999-8999-999999999999' },
    { creatorProfileId: '55555555-5555-4555-8555-555555555555' },
    { platform: 'wikipedia' },
    { kind: 'social' },
  ])('rejects a surface with a mismatched identity tuple: %o', async mismatch => {
    arrangeDatabase([surface(mismatch)]);

    const {
      assessAndPersistMusicBrainzDirectoryEntity,
      DirectoryAssessmentPrerequisiteError,
    } = await import('./directory-assessment.server');

    await expect(
      assessAndPersistMusicBrainzDirectoryEntity({
        creatorProfileId: CREATOR_PROFILE_ID,
        surfaceId: SURFACE_ID,
        now: NOW,
      })
    ).rejects.toEqual(
      expect.objectContaining<
        Partial<InstanceType<typeof DirectoryAssessmentPrerequisiteError>>
      >({ code: 'surface_identity_mismatch' })
    );
    expect(mocks.getMusicBrainzArtist).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('stops when the canonical surface is absent', async () => {
    arrangeDatabase([]);
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    await expect(
      assessAndPersistMusicBrainzDirectoryEntity({
        creatorProfileId: CREATOR_PROFILE_ID,
        surfaceId: SURFACE_ID,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'surface_not_found' });
    expect(mocks.getMusicBrainzArtist).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('stops when the canonical surface has no MBID', async () => {
    arrangeDatabase([surface({ externalId: null })]);
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    await expect(
      assessAndPersistMusicBrainzDirectoryEntity({
        creatorProfileId: CREATOR_PROFILE_ID,
        surfaceId: SURFACE_ID,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'surface_missing_mbid' });
    expect(mocks.getMusicBrainzArtist).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('stops before fetching when the canonical surface MBID is malformed', async () => {
    arrangeDatabase([surface({ externalId: 'not-an-mbid' })]);
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    await expect(
      assessAndPersistMusicBrainzDirectoryEntity({
        creatorProfileId: CREATOR_PROFILE_ID,
        surfaceId: SURFACE_ID,
        now: NOW,
      })
    ).rejects.toMatchObject({ code: 'surface_invalid_mbid' });
    expect(mocks.getMusicBrainzArtist).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('persists a missing entity as an unresolved high-impact assessment', async () => {
    const write = arrangeDatabase([surface()]);
    mocks.getMusicBrainzArtist.mockResolvedValue(null);
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    const result = await assessAndPersistMusicBrainzDirectoryEntity({
      creatorProfileId: CREATOR_PROFILE_ID,
      surfaceId: SURFACE_ID,
      now: NOW,
    });

    expect(result.assessment.outcome).toBe('listing_missing');
    expect(mocks.select.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        state: 'detected',
        severity: 'high',
        verifiedAt: null,
        resolvedAt: null,
      })
    );
    expect(write.onConflictDoUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({
          state: 'reopen_or_preserve_state',
          actedAt: 'reopen_or_preserve_acted_at',
          verifiedAt: null,
          resolvedAt: null,
        }),
      })
    );
    const reopenExpressions = mocks.sql.mock.calls
      .map(([strings]) => strings.join('?'))
      .filter(expression => expression.includes('CASE WHEN'));
    expect(reopenExpressions).toHaveLength(2);
    expect(reopenExpressions).toEqual(
      expect.arrayContaining([
        expect.stringContaining("OR ? = 'resolved'"),
        expect.stringContaining("OR ? = 'resolved'"),
      ])
    );
  });

  it('persists weak identity evidence as an unresolved medium assessment', async () => {
    arrangeDatabase([
      surface({ qualificationStatus: 'suggested', identityConfidence: '0.70' }),
    ]);
    mocks.getMusicBrainzArtist.mockResolvedValue({
      id: MBID,
      name: 'Example Artist',
    });
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    const result = await assessAndPersistMusicBrainzDirectoryEntity({
      creatorProfileId: CREATOR_PROFILE_ID,
      surfaceId: SURFACE_ID,
      now: NOW,
    });

    expect(result.assessment.outcome).toBe('identity_unverified');
    expect(mocks.select.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ state: 'detected', severity: 'medium' })
    );
  });

  it('fails closed if the issue upsert does not return a persisted row', async () => {
    arrangeDatabase([surface()], { issueRows: [] });
    mocks.getMusicBrainzArtist.mockResolvedValue({ id: MBID, name: 'Artist' });
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    await expect(
      assessAndPersistMusicBrainzDirectoryEntity({
        creatorProfileId: CREATOR_PROFILE_ID,
        surfaceId: SURFACE_ID,
        now: NOW,
      })
    ).rejects.toThrow('MusicBrainz directory assessment was not persisted.');
  });

  it('does not let an older concurrent assessment replace a newer row', async () => {
    arrangeDatabase([surface()], {
      issueRows: [],
      existingIssueRows: [{ id: 'newer-issue' }],
    });
    mocks.getMusicBrainzArtist.mockResolvedValue({ id: MBID, name: 'Artist' });
    const { assessAndPersistMusicBrainzDirectoryEntity } = await import(
      './directory-assessment.server'
    );

    const result = await assessAndPersistMusicBrainzDirectoryEntity({
      creatorProfileId: CREATOR_PROFILE_ID,
      surfaceId: SURFACE_ID,
      now: NOW,
    });

    expect(result).toMatchObject({
      issueId: 'newer-issue',
      writeDisposition: 'stale_ignored',
    });
  });
});
