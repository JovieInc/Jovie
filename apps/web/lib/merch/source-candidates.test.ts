import { describe, expect, it } from 'vitest';
import { buildMerchImagePrompt } from './design-generation';
import {
  hasHumanSafeMerchContract,
  isExplicitUserProvidedSource,
  isMerchDirectionHelpRequest,
  rankMerchSources,
  requiresAssetPreservingRender,
  scoreMerchTitle,
} from './source-candidates';

describe('merch source candidates', () => {
  it('ranks a compact, visual confirmed title above a generic long title', () => {
    const candidates = rankMerchSources([
      {
        sourceType: 'song_title',
        sourceText: 'A Very Long Piece Of Release Metadata For The Artist',
        provenanceTitle: 'A Very Long Piece Of Release Metadata For The Artist',
      },
      {
        sourceType: 'song_title',
        sourceText: 'Testing The Lights',
        provenanceTitle: 'Testing The Lights',
      },
    ]);

    expect(candidates[0]).toMatchObject({
      sourceText: 'Testing The Lights',
      sourceType: 'song_title',
      rightsStatus: 'owned',
    });
    expect(candidates[0]?.merchScore).toBeGreaterThan(
      scoreMerchTitle('A Very Long Piece Of Release Metadata For The Artist')
    );
  });

  it('deduplicates catalog titles without inventing a source', () => {
    const candidates = rankMerchSources([
      {
        sourceType: 'song_title',
        sourceText: 'The Deep End',
        provenanceTitle: 'The Deep End',
      },
      {
        sourceType: 'album_title',
        sourceText: ' the   deep end ',
        provenanceTitle: 'The Deep End EP',
      },
    ]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.sourceType).toBe('song_title');
  });

  it('recognizes the exact help-me-pick and no-fake-people recovery language', () => {
    expect(isMerchDirectionHelpRequest('idk help me pick')).toBe(true);
    expect(isMerchDirectionHelpRequest('These suck. No fake people.')).toBe(
      true
    );
    expect(isMerchDirectionHelpRequest('make a hoodie')).toBe(false);
  });

  it('only accepts a user-provided phrase when it is in the current request', () => {
    const source = {
      sourceType: 'user_provided' as const,
      sourceText: 'Keep The Lights On',
      provenanceTitle: 'Artist-provided phrase',
      rightsStatus: 'user_provided' as const,
    };

    expect(
      isExplicitUserProvidedSource(
        'Make a tee that says Keep The Lights On',
        source
      )
    ).toBe(true);
    expect(isExplicitUserProvidedSource('Make a tee', source)).toBe(false);
  });

  it('fails closed for an uploaded asset until an asset-preserving renderer exists', () => {
    const assetSource = {
      sourceType: 'library_asset' as const,
      sourceText: 'Tim White logo',
      provenanceTitle: 'Tim White logo.svg',
      rightsStatus: 'owned' as const,
      assetId: 'dba16da7-95f1-42e1-ae56-af36e227c426',
      assetUrl: 'https://assets.example/tim-white-logo.svg',
    };

    expect(requiresAssetPreservingRender(assetSource)).toBe(true);
    expect(
      hasHumanSafeMerchContract({
        forbiddenCliches: [
          'no people, faces, portraits, models, or human figures',
        ],
        source: assetSource,
      })
    ).toBe(false);
  });

  it('requires both a source and the no-people contract before selection', () => {
    const source = {
      sourceType: 'song_title' as const,
      sourceText: 'Testing The Lights',
      provenanceTitle: 'Testing The Lights',
      rightsStatus: 'owned' as const,
    };

    expect(
      hasHumanSafeMerchContract({
        forbiddenCliches: [
          'no people, faces, portraits, models, or human figures',
        ],
        source,
      })
    ).toBe(true);
    expect(
      hasHumanSafeMerchContract({
        forbiddenCliches: ['no fake tour dates'],
        source,
      })
    ).toBe(false);
    expect(
      hasHumanSafeMerchContract({
        forbiddenCliches: [
          'no people, faces, portraits, models, or human figures',
        ],
      })
    ).toBe(false);
  });

  it('puts the no-human and no-logo-recreation constraints into every image prompt', () => {
    const prompt = buildMerchImagePrompt(
      'Tim White',
      'A distressed red, white, and blue tee',
      'premium screen-print typography',
      {
        sourceType: 'song_title',
        sourceText: 'Testing The Lights',
        provenanceTitle: 'Testing The Lights',
        rightsStatus: 'owned',
      }
    );

    expect(prompt).toContain('Do not depict people, faces, portraits, models');
    expect(prompt).toContain(
      'Do not invent, imitate, or imply the artist likeness'
    );
    expect(prompt).toContain('Do not recreate logos or trademarks');
    expect(prompt).toContain('Testing The Lights');
  });
});
