import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const mockDbSelect = vi.fn();
  const mockDbUpdateWhere = vi.fn().mockResolvedValue(undefined);
  const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
  const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));

  return {
    mockDbSelect,
    mockDbUpdate,
    mockDbUpdateSet,
    mockGetSubmissionProvider: vi.fn(),
    mockGetStoredSubmissionPackage: vi.fn(),
    mockLoadCanonicalSubmissionContext: vi.fn(),
    mockSend: vi.fn(),
  };
});

function createSelectOrderByChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        orderBy: vi.fn().mockResolvedValue(result),
      }),
    }),
  };
}

vi.mock('@/lib/db', () => ({
  db: {
    select: hoisted.mockDbSelect,
    update: hoisted.mockDbUpdate,
  },
}));

vi.mock('drizzle-orm', () => ({
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock('@/lib/db/schema/metadata-submissions', () => ({
  metadataSubmissionRequests: {
    id: 'id',
    status: 'status',
    createdAt: 'createdAt',
  },
}));

vi.mock('@/lib/submission-agent/providers/registry', () => ({
  getSubmissionProvider: hoisted.mockGetSubmissionProvider,
}));

vi.mock('@/lib/submission-agent/service', () => ({
  getStoredSubmissionPackage: hoisted.mockGetStoredSubmissionPackage,
  loadCanonicalSubmissionContext: hoisted.mockLoadCanonicalSubmissionContext,
}));

describe('processQueuedMetadataSubmissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    hoisted.mockDbSelect.mockReturnValue(
      createSelectOrderByChain([
        {
          id: 'request-1',
          status: 'queued',
          providerId: 'xperi_allmusic_email',
          creatorProfileId: 'profile-1',
          releaseId: 'release-1',
        },
        {
          id: 'request-2',
          status: 'queued',
          providerId: 'xperi_allmusic_email',
          creatorProfileId: 'profile-1',
          releaseId: 'release-2',
        },
      ])
    );

    hoisted.mockGetSubmissionProvider.mockReturnValue({
      send: hoisted.mockSend,
    });
    hoisted.mockGetStoredSubmissionPackage.mockResolvedValue({
      subject: 'Submission',
      text: 'Body',
      html: '<p>Body</p>',
      attachments: [],
      monitoringBaseline: {},
    });
    hoisted.mockLoadCanonicalSubmissionContext.mockResolvedValue({
      profileId: 'profile-1',
      artistName: 'Test Artist',
      artistBio: 'Bio',
      artistContactEmail: 'artist@example.com',
      replyToEmail: 'artist@example.com',
      release: null,
      tracks: [],
      pressPhotos: [],
    });
  });

  it('fails the current request but continues processing later queued requests', async () => {
    hoisted.mockSend
      .mockRejectedValueOnce(new Error('Attachment download failed'))
      .mockResolvedValueOnce({
        status: 'sent',
        providerMessageId: 'provider-msg-2',
      });

    const { processQueuedMetadataSubmissions } = await import(
      '@/lib/submission-agent/send-worker'
    );
    const results = await processQueuedMetadataSubmissions({
      requestIds: ['request-1', 'request-2'],
    });

    expect(results).toEqual([
      {
        requestId: 'request-1',
        status: 'failed',
        error: 'Attachment download failed',
      },
      {
        requestId: 'request-2',
        status: 'sent',
        providerMessageId: 'provider-msg-2',
      },
    ]);

    expect(hoisted.mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        lastError: 'Attachment download failed',
      })
    );
    expect(hoisted.mockDbUpdateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'sent',
        providerMessageId: 'provider-msg-2',
        lastError: null,
      })
    );
    expect(hoisted.mockSend).toHaveBeenCalledTimes(2);
  });
});
