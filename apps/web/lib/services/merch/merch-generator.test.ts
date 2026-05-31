import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMerchGeneration, selectMerchDesign } from '@/lib/merch/service';
import {
  canFulfillMerch,
  generateMerchFromConcept,
  previewMerchFromConcept,
  selectAndCreateMerchCard,
} from './merch-generator';

vi.mock('@/lib/merch/service', () => ({
  createMerchGeneration: vi.fn(),
  selectMerchDesign: vi.fn(),
}));

const mockCreateMerchGeneration = vi.mocked(createMerchGeneration);
const mockSelectMerchDesign = vi.mocked(selectMerchDesign);

describe('merch-generator wrappers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps generateMerchFromConcept arguments and appends item type hint', async () => {
    mockCreateMerchGeneration.mockResolvedValueOnce({} as never);

    await generateMerchFromConcept({
      profileId: 'profile_1',
      clerkUserId: 'clerk_1',
      prompt: 'Neon tour visual',
      itemType: 'hoodie',
      conversationId: 'conversation_1',
      turnId: 'turn_1',
    });

    expect(mockCreateMerchGeneration).toHaveBeenCalledWith({
      profileId: 'profile_1',
      clerkUserId: 'clerk_1',
      prompt: 'Neon tour visual\nItem type: hoodie',
      command: 'create_merch',
      conversationId: 'conversation_1',
      turnId: 'turn_1',
    });
  });

  it('uses default generate prompt when prompt input is empty', async () => {
    mockCreateMerchGeneration.mockResolvedValueOnce({} as never);

    await generateMerchFromConcept({
      profileId: 'profile_2',
      clerkUserId: 'clerk_2',
      prompt: '',
      itemType: null,
    });

    expect(mockCreateMerchGeneration).toHaveBeenCalledWith({
      profileId: 'profile_2',
      clerkUserId: 'clerk_2',
      prompt: 'Generate premium merch for this artist.',
      command: 'create_merch',
      conversationId: null,
      turnId: null,
    });
  });

  it('maps previewMerchFromConcept arguments and command', async () => {
    mockCreateMerchGeneration.mockResolvedValueOnce({} as never);

    await previewMerchFromConcept({
      profileId: 'profile_3',
      clerkUserId: 'clerk_3',
      prompt: 'Soft preview concept',
      itemType: null,
    });

    expect(mockCreateMerchGeneration).toHaveBeenCalledWith({
      profileId: 'profile_3',
      clerkUserId: 'clerk_3',
      prompt: 'Soft preview concept',
      command: 'preview_merch_options',
      conversationId: null,
      turnId: null,
    });
  });

  it('maps selectAndCreateMerchCard arguments with publish and null coalescing', async () => {
    mockSelectMerchDesign.mockResolvedValueOnce({} as never);

    await selectAndCreateMerchCard({
      generationId: 'generation_1',
      clerkUserId: 'clerk_4',
      optionNumber: 2,
      optionId: undefined,
      publish: true,
    });

    expect(mockSelectMerchDesign).toHaveBeenCalledWith({
      generationId: 'generation_1',
      clerkUserId: 'clerk_4',
      optionId: null,
      optionNumber: 2,
      publish: true,
    });
  });
});

describe('canFulfillMerch', () => {
  it('returns true (mock data always available)', () => {
    expect(canFulfillMerch()).toBe(true);
  });
});
