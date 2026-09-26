import { describe, expect, it } from 'vitest';
import { type LandingSpec, runLandingPipeline } from './landing';

const spec: LandingSpec = {
  id: 'artist-profiles',
  route: '/artist-profiles',
  audience: 'independent artists',
  capabilities: [
    {
      id: 'profile',
      statement: 'Public profile with every link',
      status: 'shipped',
      evidence: ['route:/[handle]'],
    },
  ],
  outcomes: [
    {
      id: 'one-link',
      statement: 'Fans find everything from one link.',
      capabilityIds: ['profile'],
    },
  ],
  sections: [
    {
      id: 'hero',
      job: 'promise',
      outcomeId: 'one-link',
      headline: 'Every song, show, and link. One place.',
      cta: { label: 'Claim your profile', href: '/signup' },
    },
  ],
  layout: { recipeId: 'short', sectionOrder: ['hero'] },
  style: { theme: 'dark', tokensVersion: 'b' },
  designSystem: { components: ['MarketingHero'] },
  proof: [
    {
      id: 'p1',
      kind: 'product-moment',
      sectionId: 'hero',
      capabilityIds: ['profile'],
      source: 'fixture:profile-default',
    },
  ],
  stats: [
    {
      id: 's1',
      value: '90M+',
      label: 'streams driven by the founder',
      source: 'founder credits',
      asOf: new Date().toISOString(),
    },
  ],
  quotes: [],
};

describe('landing pipeline runs stages in order', () => {
  it('passes a complete, truthful spec', () => {
    expect(runLandingPipeline(spec)).toMatchObject({
      ok: true,
      passed: expect.arrayContaining(['social']),
    });
  });

  it.each([
    [
      'capabilities',
      'CAPABILITY_WITHOUT_EVIDENCE',
      { capabilities: [{ ...spec.capabilities[0]!, evidence: [] }] },
    ],
    [
      'outcomes',
      'OUTCOME_ON_WAITLIST_ONLY',
      {
        capabilities: [
          { ...spec.capabilities[0]!, status: 'waitlist' as const },
        ],
      },
    ],
    [
      'copy',
      'COPY_CORPORATE_VERB',
      {
        sections: [
          { ...spec.sections[0]!, headline: 'A seamless home for fans.' },
        ],
      },
    ],
    [
      'copy',
      'HEADLINE_TOO_LONG',
      {
        sections: [
          {
            ...spec.sections[0]!,
            headline:
              'Every song and every show and every link you have in one single place.',
          },
        ],
      },
    ],
    [
      'layout',
      'LAYOUT_SECTION_MISMATCH',
      { layout: { recipeId: 'short', sectionOrder: [] } },
    ],
    ['proof', 'HERO_WITHOUT_PROOF', { proof: [] }],
    [
      'social',
      'STAT_STALE',
      { stats: [{ ...spec.stats[0]!, asOf: '2020-01-01' }] },
    ],
  ] as const)('stops at %s with %s', (stage, code, patch) => {
    const result = runLandingPipeline({ ...spec, ...patch } as LandingSpec);
    expect(result.failedStage).toBe(stage);
    expect(result.issues.map(issue => issue.code)).toContain(code);
  });
});
