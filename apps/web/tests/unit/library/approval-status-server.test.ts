import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockDbSelect, mockCaptureWarning } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockCaptureWarning: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: mockDbSelect,
  },
}));

vi.mock('@/lib/db/schema/library', () => ({
  libraryAssetApprovalStatuses: {
    assetId: 'asset_id',
    approvalStatus: 'approval_status',
    creatorProfileId: 'creator_profile_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ eq: val })),
  and: vi.fn((...args: unknown[]) => ({ and: args })),
}));

vi.mock('@/lib/error-tracking', () => ({
  captureWarning: mockCaptureWarning,
}));

/**
 * Mirrors the prod migration-drift failure (JOV-3359): Drizzle wraps the PG
 * 42P01 (undefined_table) error, so the outer message is "Failed query: ..."
 * and the real error lives on `.cause`.
 */
function createMissingApprovalStatusTableError() {
  return new Error(
    'Failed query: select "asset_id", "approval_status" from "library_asset_approval_statuses" where "library_asset_approval_statuses"."creator_profile_id" = $1',
    {
      cause: {
        code: '42P01',
        message: 'relation "library_asset_approval_statuses" does not exist',
      },
    }
  );
}

function setupDbSelectMock(
  rows: Array<{ assetId: string; approvalStatus: string }>
) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  });
}

function setupDbSelectError(error: unknown) {
  mockDbSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockRejectedValue(error),
    }),
  });
}

describe('getLibraryApprovalStatusMapForProfile', () => {
  let getLibraryApprovalStatusMapForProfile: typeof import('@/lib/library/approval-status.server').getLibraryApprovalStatusMapForProfile;
  let isMissingLibraryApprovalStatusTableError: typeof import('@/lib/library/approval-status.server').isMissingLibraryApprovalStatusTableError;

  beforeEach(async () => {
    vi.resetModules();
    mockDbSelect.mockClear();
    mockCaptureWarning.mockClear();

    const mod = await import('@/lib/library/approval-status.server');
    getLibraryApprovalStatusMapForProfile =
      mod.getLibraryApprovalStatusMapForProfile;
    isMissingLibraryApprovalStatusTableError =
      mod.isMissingLibraryApprovalStatusTableError;
  });

  it('returns explicit approval statuses keyed by asset id (happy path unchanged)', async () => {
    setupDbSelectMock([
      { assetId: 'release_1', approvalStatus: 'approved' },
      { assetId: 'release_2', approvalStatus: 'needs_review' },
    ]);

    const result = await getLibraryApprovalStatusMapForProfile('profile-1');

    expect(result.size).toBe(2);
    expect(result.get('release_1')).toBe('approved');
    expect(result.get('release_2')).toBe('needs_review');
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('degrades to an empty map with one warning when the relation is missing in prod (JOV-3359)', async () => {
    setupDbSelectError(createMissingApprovalStatusTableError());

    const result = await getLibraryApprovalStatusMapForProfile('profile-1');

    expect(result.size).toBe(0);
    expect(mockCaptureWarning).toHaveBeenCalledTimes(1);
    expect(mockCaptureWarning.mock.calls[0][0]).toContain(
      'library_asset_approval_statuses'
    );
  });

  it('still throws non-drift DB errors (no broad swallow)', async () => {
    setupDbSelectError(new Error('connection terminated unexpectedly'));

    await expect(
      getLibraryApprovalStatusMapForProfile('profile-1')
    ).rejects.toThrow('connection terminated unexpectedly');
    expect(mockCaptureWarning).not.toHaveBeenCalled();
  });

  it('matches only the missing library_asset_approval_statuses relation', () => {
    expect(
      isMissingLibraryApprovalStatusTableError(
        createMissingApprovalStatusTableError()
      )
    ).toBe(true);
    expect(
      isMissingLibraryApprovalStatusTableError(
        new Error('relation "waitlist_settings" does not exist', {
          cause: { code: '42P01' },
        })
      )
    ).toBe(false);
    expect(isMissingLibraryApprovalStatusTableError(new Error('boom'))).toBe(
      false
    );
  });
});
