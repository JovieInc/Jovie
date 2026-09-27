import { type LandingSpec, runLandingPipeline } from '@jovie/copy';
import { describe, expect, it } from 'vitest';
import { MARKETING_LANDING_CHECKS } from '@/data/marketing/landingChecks';

const spec: LandingSpec = {
  id: 'artist-profiles',
  route: '/artist-profiles',
  audience: 'independent artists',
  capabilities: [
    {
      id: 'profile',
      statement: 'Public profile with music, shows, and links',
      status: 'shipped',
      evidence: ['route:/[handle]'],
    },
  ],
  outcomes: [
    {
      id: 'one-place',
      statement: 'Fans find your music, shows, and links in one place.',
      capabilityIds: ['profile'],
    },
  ],
  sections: [
    {
      id: 'hero',
      job: 'promise',
      outcomeId: 'one-place',
      headline: 'Your music, shows, and links. One place.',
      cta: { label: 'Claim your profile', href: '/signup' },
    },
  ],
  layout: { recipeId: 'artist-lp', sectionOrder: ['hero'] },
  style: { theme: 'dark', tokensVersion: 'system-b' },
  designSystem: { components: ['hero'] },
  proof: [
    {
      id: 'profile-moment',
      kind: 'product-moment',
      sectionId: 'hero',
      capabilityIds: ['profile'],
      source: 'fixture:profile-default',
    },
  ],
  stats: [],
  quotes: [],
};

describe('landing pipeline bound to the marketing registry', () => {
  it('passes a spec built from an approved recipe and registered sections', () => {
    expect(runLandingPipeline(spec, MARKETING_LANDING_CHECKS).ok).toBe(true);
  });

  it('rejects an unapproved recipe at the layout stage', () => {
    const result = runLandingPipeline(
      { ...spec, layout: { recipeId: 'freestyle', sectionOrder: ['hero'] } },
      MARKETING_LANDING_CHECKS
    );
    expect(result).toMatchObject({ failedStage: 'layout' });
    expect(result.issues[0]?.code).toBe('UNKNOWN_RECIPE');
  });

  it('rejects unregistered components at the design-system stage', () => {
    const result = runLandingPipeline(
      { ...spec, designSystem: { components: ['hero', 'glass-orb-carousel'] } },
      MARKETING_LANDING_CHECKS
    );
    expect(result).toMatchObject({ failedStage: 'designSystem' });
    expect(result.issues.map(issue => issue.ref)).toEqual([
      'glass-orb-carousel',
    ]);
  });
});
