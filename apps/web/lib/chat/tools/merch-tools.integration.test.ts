import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * JOV-4743 integration test: the `createMerch` and `previewMerchOptions` chat
 * tools must enter the SAME canonical, quality-gated generation pipeline
 * (`generateMerchDesigns`) and produce the SAME option contract — including
 * the versioned contract stamp and the truthful-mockup lifecycle state — and
 * neither tool may bypass the verified-source / no-person gate.
 */

const hoisted = vi.hoisted(() => ({
  generateMerchDesigns: vi.fn(),
  proposeMerchAction: vi.fn(),
  getMerchSourceCandidates: vi.fn(),
  isExplicitUserProvidedSource: vi.fn(),
  requiresAssetPreservingRender: vi.fn(),
}));

vi.mock('@/lib/merch/design-generation', () => ({
  generateMerchDesigns: hoisted.generateMerchDesigns,
}));

vi.mock('@/lib/chat/tools/merch-propose', () => ({
  proposeMerchAction: hoisted.proposeMerchAction,
}));

vi.mock('@/lib/merch/source-candidates', () => ({
  getMerchSourceCandidates: hoisted.getMerchSourceCandidates,
  isExplicitUserProvidedSource: hoisted.isExplicitUserProvidedSource,
  requiresAssetPreservingRender: hoisted.requiresAssetPreservingRender,
}));

import { createMerchGenerateTool, createMerchPreviewTool } from './merch-tools';

const PROFILE_ID = 'profile-1';
const CLERK_USER_ID = 'user_1';

const VERIFIED_SOURCE = {
  sourceType: 'song_title' as const,
  sourceText: 'Midnight Run',
  provenanceTitle: 'Midnight Run',
  rightsStatus: 'owned' as const,
};

const CANONICAL_RESULT = {
  success: true as const,
  generationId: '11111111-1111-1111-1111-111111111111',
  prompt: 'stadium tee graphic\nItem type: premium tee',
  contractVersion: 'merch-generation/v1',
  nextStep: 'Pick one and I’ll put it on products.',
  designs: [
    {
      id: 'option-1',
      option_number: 1,
      design_name: 'Midnight Run Signal Field',
      concept: 'Signal Field direction: stadium tee graphic',
      status: 'ready' as const,
      mockup_status: 'pending_mockup' as const,
      preview_url:
        'https://blob.vercel-storage.com/merch/generated/profile-1/gen/option-1.png',
      slots: {
        artist_name: 'Test Artist',
        short_text: 'Midnight Run',
        source_label: 'song title: Midnight Run',
        source_type: 'song_title' as const,
      },
      recommended: true,
    },
  ],
};

function makeTools() {
  const params = {
    profileId: PROFILE_ID,
    clerkUserId: CLERK_USER_ID,
    conversationId: 'conv-1',
    turnId: 'turn-1',
  };
  return {
    createMerch: createMerchGenerateTool(params),
    previewMerchOptions: createMerchPreviewTool(params),
  };
}

describe('merch chat tools converge on the canonical pipeline (JOV-4743)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.generateMerchDesigns.mockResolvedValue(CANONICAL_RESULT);
    hoisted.requiresAssetPreservingRender.mockReturnValue(false);
    hoisted.isExplicitUserProvidedSource.mockReturnValue(true);
    hoisted.getMerchSourceCandidates.mockResolvedValue([]);
  });

  it('both tools invoke the same canonical generator with the same gate inputs', async () => {
    const { createMerch, previewMerchOptions } = makeTools();
    const input = {
      prompt: 'stadium tee graphic',
      itemType: 'premium tee',
      source: VERIFIED_SOURCE,
    };

    const createResult = await createMerch.execute!(
      { ...input, makeLive: false },
      {} as never
    );
    const previewResult = await previewMerchOptions.execute!(
      input,
      {} as never
    );

    // Same canonical gate invoked once per tool, with identical inputs.
    expect(hoisted.generateMerchDesigns).toHaveBeenCalledTimes(2);
    const [createCall, previewCall] = hoisted.generateMerchDesigns.mock.calls;
    expect(createCall[0]).toEqual(previewCall[0]);
    expect(createCall[0]).toMatchObject({
      profileId: PROFILE_ID,
      clerkUserId: CLERK_USER_ID,
      source: VERIFIED_SOURCE,
      conversationId: 'conv-1',
      turnId: 'turn-1',
    });

    // Same option contract from both entry points: versioned contract stamp,
    // pending_mockup lifecycle state, identical design payload keys.
    expect(createResult).toEqual(previewResult);
    for (const result of [createResult, previewResult]) {
      expect(result).toMatchObject({
        success: true,
        contractVersion: 'merch-generation/v1',
      });
      const designs = (result as typeof CANONICAL_RESULT).designs;
      expect(designs).toHaveLength(1);
      expect(designs[0]).toMatchObject({
        status: 'ready',
        mockup_status: 'pending_mockup',
      });
    }
  });

  it('neither tool can bypass the verified-source gate', async () => {
    hoisted.isExplicitUserProvidedSource.mockReturnValue(false);
    // Catalog candidates exist but none match the requested source.
    hoisted.getMerchSourceCandidates.mockResolvedValue([
      {
        ...VERIFIED_SOURCE,
        sourceText: 'Other Song',
        merchScore: 1,
        whyItWorks: 'confirmed catalog title',
      },
    ]);

    const { createMerch, previewMerchOptions } = makeTools();
    const input = { prompt: 'bootleg design', source: VERIFIED_SOURCE };

    const createResult = await createMerch.execute!(
      { ...input, makeLive: true },
      {} as never
    );
    const previewResult = await previewMerchOptions.execute!(
      input,
      {} as never
    );

    expect(createResult).toEqual(previewResult);
    expect(createResult).toMatchObject({
      success: false,
      error: expect.stringContaining('not a confirmed title'),
    });
    // The gate stopped both tools before any generation happened.
    expect(hoisted.generateMerchDesigns).not.toHaveBeenCalled();
  });

  it('neither tool can force an asset-preserving Library asset through prompt generation', async () => {
    hoisted.requiresAssetPreservingRender.mockReturnValue(true);

    const assetSource = {
      sourceType: 'library_asset' as const,
      sourceText: 'Logo',
      provenanceTitle: 'Logo',
      rightsStatus: 'owned' as const,
      assetId: '22222222-2222-2222-2222-222222222222',
    };
    const { createMerch, previewMerchOptions } = makeTools();

    const createResult = await createMerch.execute!(
      { prompt: 'recreate my logo', source: assetSource },
      {} as never
    );
    const previewResult = await previewMerchOptions.execute!(
      { prompt: 'recreate my logo', source: assetSource },
      {} as never
    );

    expect(createResult).toEqual(previewResult);
    expect(createResult).toMatchObject({
      success: false,
      error: expect.stringContaining('asset-preserving render path'),
    });
    expect(hoisted.generateMerchDesigns).not.toHaveBeenCalled();
  });

  it('both tools require a verified source before any model call', async () => {
    const { createMerch, previewMerchOptions } = makeTools();

    const createResult = await createMerch.execute!(
      { prompt: 'surprise me' },
      {} as never
    );
    const previewResult = await previewMerchOptions.execute!(
      { prompt: 'surprise me' },
      {} as never
    );

    expect(createResult).toEqual(previewResult);
    expect(createResult).toMatchObject({
      success: true,
      state: 'source_selection_required',
    });
    expect(hoisted.generateMerchDesigns).not.toHaveBeenCalled();
  });
});
