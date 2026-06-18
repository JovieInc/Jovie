import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMerchGeneration, selectMerchDesign } from '@/lib/merch/service';
import {
  buildReleaseMerchPrompt,
  generateReleaseMerchDrop,
} from './merch-drop';

const dbMocks = vi.hoisted(() => ({
  select: vi.fn(),
  from: vi.fn(),
  where: vi.fn(),
  limit: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: dbMocks.select,
    update: dbMocks.update,
  },
}));

vi.mock('@/lib/merch/service', () => ({
  createMerchGeneration: vi.fn(),
  selectMerchDesign: vi.fn(),
}));

vi.mock('@/lib/library/approval-status.server', () => ({
  upsertLibraryApprovalStatus: vi.fn(),
}));

const mockCreateMerchGeneration = vi.mocked(createMerchGeneration);
const mockSelectMerchDesign = vi.mocked(selectMerchDesign);

const RELEASE_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_ID = '22222222-2222-4222-8222-222222222222';
const CLERK_USER_ID = 'clerk_123';

function mockSelectChain(rows: unknown[]) {
  dbMocks.limit.mockResolvedValueOnce(rows);
  dbMocks.where.mockReturnValue({ limit: dbMocks.limit });
  dbMocks.from.mockReturnValue({ where: dbMocks.where });
  dbMocks.select.mockReturnValueOnce({ from: dbMocks.from });
}

function mockUpdateChain() {
  dbMocks.set.mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
  dbMocks.update.mockReturnValue({ set: dbMocks.set });
}

describe('buildReleaseMerchPrompt', () => {
  it('includes release metadata and artwork reference', () => {
    const prompt = buildReleaseMerchPrompt({
      releaseId: RELEASE_ID,
      releaseTitle: 'Midnight Static',
      artworkUrl: 'https://cdn.example.com/art.jpg',
      releaseType: 'single',
    });

    expect(prompt).toContain(`release_id:${RELEASE_ID}`);
    expect(prompt).toContain('Midnight Static');
    expect(prompt).toContain('https://cdn.example.com/art.jpg');
    expect(prompt).toContain('premium tee');
  });

  it('falls back when artwork is missing', () => {
    const prompt = buildReleaseMerchPrompt({
      releaseId: RELEASE_ID,
      releaseTitle: 'Midnight Static',
      artworkUrl: null,
      releaseType: 'single',
    });

    expect(prompt).toContain('Release artwork is not attached yet');
  });
});

describe('generateReleaseMerchDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateChain();
  });

  it('returns an existing merch drop without regenerating', async () => {
    mockSelectChain([
      {
        generationId: 'generation_existing',
        merchCardId: 'merch_existing',
      },
    ]);

    const result = await generateReleaseMerchDrop({
      profileId: PROFILE_ID,
      releaseId: RELEASE_ID,
      clerkUserId: CLERK_USER_ID,
    });

    expect(result).toEqual({
      status: 'existing',
      merchCardId: 'merch_existing',
      generationId: 'generation_existing',
      approvalStatus: 'needs_review',
    });
    expect(mockCreateMerchGeneration).not.toHaveBeenCalled();
  });

  it('creates a draft merch card and marks it for review', async () => {
    mockSelectChain([]);
    mockSelectChain([
      {
        id: RELEASE_ID,
        creatorProfileId: PROFILE_ID,
        title: 'Midnight Static',
        artworkUrl: 'https://cdn.example.com/art.jpg',
        releaseType: 'single',
      },
    ]);

    mockCreateMerchGeneration.mockResolvedValueOnce({
      success: true,
      generationId: 'generation_new',
      artistBrief: {} as never,
      options: [],
      prompt: 'prompt',
    });
    mockSelectMerchDesign.mockResolvedValueOnce({
      success: true,
      merchCardId: 'merch_new',
      status: 'draft',
      selectedOptionId: 'option_1',
      title: 'Signal Tee',
      publicUrl: null,
    });

    const { upsertLibraryApprovalStatus } = await import(
      '@/lib/library/approval-status.server'
    );

    const result = await generateReleaseMerchDrop({
      profileId: PROFILE_ID,
      releaseId: RELEASE_ID,
      clerkUserId: CLERK_USER_ID,
    });

    expect(result.status).toBe('created');
    expect(result.merchCardId).toBe('merch_new');
    expect(result.approvalStatus).toBe('needs_review');
    expect(mockCreateMerchGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: PROFILE_ID,
        clerkUserId: CLERK_USER_ID,
        command: 'release_autopilot_merch_drop',
      })
    );
    expect(mockSelectMerchDesign).toHaveBeenCalledWith({
      generationId: 'generation_new',
      clerkUserId: CLERK_USER_ID,
      optionNumber: 1,
      publish: false,
    });
    expect(upsertLibraryApprovalStatus).toHaveBeenCalledWith({
      creatorProfileId: PROFILE_ID,
      assetId: 'merch-merch_new',
      itemKind: 'merch',
      approvalStatus: 'needs_review',
    });
  });
});
