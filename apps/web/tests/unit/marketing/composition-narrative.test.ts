import { describe, expect, it } from 'vitest';
import { resolveComposition } from '@/data/marketing/composition';
import type { MarketingNarrativePlan } from '@/data/marketing/generation';

const brief = {
  businessObjective: 'Explain the public profile and voluntary updates',
  targetAudience: 'general',
  desiredConversion: 'claim-handle',
  trafficSource: 'home',
  intent: 'category',
  brandConstraints: { waitlistEnabled: true },
};

function story(ids: string[]): MarketingNarrativePlan {
  return {
    pageId: 'homepage',
    sections: ids.map((sectionId, index) => ({
      sectionInstanceId: `beat-${index}`,
      sectionId,
      question: `Question ${index}?`,
      sectionJob: `Job ${index}`,
      primaryResponsibility: `Responsibility ${index}`,
      newInformation: `Information ${index}`,
      customerBelief: `Belief ${index}`,
      evidenceRefs: ['capability:artist-profiles'],
      mustNotRepeat: [],
    })),
  };
}

describe('composition of a verified narrative', () => {
  it('retains an alternative story and repeated section identities without requiring a feature grid', () => {
    const narrativePlan = story([
      'hero',
      'feature-split',
      'feature-split',
      'faq',
      'cta',
    ]);
    const composition = resolveComposition(brief, {
      narrativePlan,
      sectionVariants: { 'beat-1': 'editorial', 'beat-2': 'phone-right' },
    });
    expect(composition.recipeId).toBe('homepage');
    expect(
      composition.sections.map(({ sectionId, sectionInstanceId }) => ({
        sectionId,
        sectionInstanceId,
      }))
    ).toEqual(
      narrativePlan.sections.map(({ sectionId, sectionInstanceId }) => ({
        sectionId,
        sectionInstanceId,
      }))
    );
  });

  it('requires explicit occurrence variants instead of inheriting legacy narrative roles', () => {
    const narrativePlan = story([
      'hero',
      'feature-split',
      'feature-split',
      'cta',
    ]);
    expect(() => resolveComposition(brief, { narrativePlan })).toThrow(
      'explicit variant'
    );
    const selected = resolveComposition(brief, {
      narrativePlan,
      sectionVariants: {
        'beat-1': 'editorial',
        'beat-2': 'phone-right',
      },
    });
    expect(
      selected.sections.slice(1, 3).map(section => section.variantId)
    ).toEqual(['editorial', 'phone-right']);
    expect(() =>
      resolveComposition(brief, {
        narrativePlan,
        sectionVariants: { 'beat-1': 'invented', 'beat-2': 'phone-right' },
      })
    ).toThrow('Unregistered story variant');
  });

  it('rejects a planned section that ordering or proof rules would silently drop', () => {
    expect(() =>
      resolveComposition(brief, { narrativePlan: story(['hero', 'cta']) })
    ).toThrow('Incomplete story');
    expect(() =>
      resolveComposition(brief, {
        narrativePlan: story(['hero', 'logo-cloud', 'feature-split', 'cta']),
      })
    ).toThrow('Incomplete story');
  });

  it('rejects unknown families and duplicated story identities', () => {
    expect(() =>
      resolveComposition(brief, {
        narrativePlan: story(['hero', 'invented-family', 'cta']),
      })
    ).toThrow();
    const narrativePlan = story(['hero', 'feature-split', 'cta']);
    const sections = narrativePlan.sections.map(section => ({
      ...section,
      sectionInstanceId: 'duplicate',
    }));
    expect(() =>
      resolveComposition(brief, {
        narrativePlan: { ...narrativePlan, sections },
      })
    ).toThrow('unique');
  });

  it('rejects a required recipe beat lost during gap degradation', () => {
    expect(() =>
      resolveComposition(
        { ...brief, intent: 'feature' },
        {
          sectionJobs: [
            {
              job: 'spec-wall',
              contentShape: { 'tile-title': 9999 },
              mediaNeed: 'none',
              evidence: [
                'The detail beat needs content beyond its certified budget',
              ],
              essential: false,
            },
          ],
        }
      )
    ).toThrow('Incomplete story');
  });
});
