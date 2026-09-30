import { describe, expect, it } from 'vitest';
import {
  decideMedium,
  FACTORY_MEDIA_SOURCING_ORDER,
  FACTORY_MEDIUM_RECIPES,
  FACTORY_MEDIUMS,
  type FactoryMediaDecisionInput,
  factoryMediumToVariantMedia,
} from '@/data/marketing/factory/mediaDecision';

const base: FactoryMediaDecisionInput = {
  sectionJob: 'other',
  family: 'feature',
  audience: 'general',
  evidence: {},
  fold: 'below',
};

function decide(
  overrides: Partial<FactoryMediaDecisionInput>
): ReturnType<typeof decideMedium> {
  return decideMedium({ ...base, ...overrides });
}

describe('decideMedium decision table (JOV-7250)', () => {
  it('locks the decision table with a snapshot across every rule', () => {
    const cases: Record<string, FactoryMediaDecisionInput> = {
      'hero + capture + default family → product-shot': {
        ...base,
        sectionJob: 'hero',
        fold: 'above',
        evidence: { captureScenarioId: 'homepage-hero-desktop' },
      },
      'hero + capture + creator family → phone': {
        ...base,
        sectionJob: 'hero',
        family: 'creator',
        fold: 'above',
        evidence: { captureScenarioId: 'artist-profile-hero-section-desktop' },
      },
      'hero + capture + mobile family → phone': {
        ...base,
        sectionJob: 'hero',
        family: 'mobile',
        fold: 'above',
        evidence: { captureScenarioId: 'artist-spec-creator-menu-mobile' },
      },
      'hero without capture → ladder omit': {
        ...base,
        sectionJob: 'hero',
        fold: 'above',
        evidence: {},
      },
      'proof + capture → product-shot': {
        ...base,
        sectionJob: 'proof',
        evidence: { captureScenarioId: 'dashboard-analytics-desktop' },
      },
      'feature + video only → video (never autoplay)': {
        ...base,
        sectionJob: 'feature',
        evidence: { video: true },
      },
      'feature without assets → ladder omit': {
        ...base,
        sectionJob: 'feature',
        evidence: {},
      },
      'comparison → table': { ...base, sectionJob: 'comparison' },
      'number → callout': { ...base, sectionJob: 'number' },
      'concept below fold + pen ref → illustration': {
        ...base,
        sectionJob: 'concept',
        fold: 'below',
        evidence: { penRefId: 'pen:concept-aurora' },
      },
      'concept below fold + generation → illustration': {
        ...base,
        sectionJob: 'concept',
        fold: 'below',
        evidence: { generationAllowed: true },
      },
      'concept above fold → ladder (not illustration)': {
        ...base,
        sectionJob: 'concept',
        fold: 'above',
        evidence: { penRefId: 'pen:concept-aurora' },
      },
      'steps below fold → lottie': {
        ...base,
        sectionJob: 'steps',
        fold: 'below',
        evidence: { penRefId: 'pen:steps-flow' },
      },
      'identity + real photo → photo': {
        ...base,
        sectionJob: 'identity',
        evidence: { photo: true },
      },
      'person + character model → photo': {
        ...base,
        sectionJob: 'person',
        evidence: { characterModelId: 'imani' },
      },
      'identity with no imagery → none (never stock)': {
        ...base,
        sectionJob: 'identity',
        evidence: {},
      },
      'developer audience → code': {
        ...base,
        audience: 'developer',
      },
      'developer hero + capture → product-shot (r1 first)': {
        ...base,
        sectionJob: 'hero',
        audience: 'developer',
        fold: 'above',
        evidence: { captureScenarioId: 'design-studio-shell-library-desktop' },
      },
      'ladder: capture → product-shot': {
        ...base,
        evidence: { captureScenarioId: 'dashboard-earnings-desktop' },
      },
      'ladder: pen ref → illustration': {
        ...base,
        evidence: { penRefId: 'pen:empty-state' },
      },
      'ladder: generation authorized → illustration': {
        ...base,
        evidence: { generationAllowed: true },
      },
      'ladder: nothing → none': { ...base, evidence: {} },
    };

    const table = Object.fromEntries(
      Object.entries(cases).map(([name, input]) => [name, decideMedium(input)])
    );
    expect(table).toMatchSnapshot();
  });

  it('fixes the sourcing order: registry, capture, pen ref, generation', () => {
    expect(FACTORY_MEDIA_SOURCING_ORDER).toEqual([
      'screenshot-registry',
      'capture-scenario',
      'pen-ref',
      'generation',
    ]);
  });

  it('extends VariantMedia and maps every medium back onto it', () => {
    for (const medium of FACTORY_MEDIUMS) {
      expect(factoryMediumToVariantMedia(medium)).toBeTruthy();
    }
    expect(factoryMediumToVariantMedia('product-shot')).toBe('screenshot');
    expect(factoryMediumToVariantMedia('phone')).toBe('phone');
    expect(factoryMediumToVariantMedia('code')).toBe('code');
    expect(factoryMediumToVariantMedia('none')).toBe('none');
  });

  it('attaches an approved recipe only to mediums that render through one', () => {
    expect(FACTORY_MEDIUM_RECIPES['product-shot']).toBe('dark-glass');
    expect(FACTORY_MEDIUM_RECIPES.lottie).toBe('flowing-accent');
    expect(FACTORY_MEDIUM_RECIPES.code).toBeNull();
    expect(FACTORY_MEDIUM_RECIPES.none).toBeNull();
  });

  it('records a full rule trace on every decision', () => {
    const decision = decide({
      sectionJob: 'comparison',
      evidence: { captureScenarioId: 'ignored-by-r3' },
    });
    expect(decision.medium).toBe('table');
    expect(decision.trace.map(t => t.rule)).toEqual([
      'r1-hero-capture',
      'r2-proof-or-feature',
      'r3-number-or-comparison',
    ]);
    expect(decision.trace.at(-1)?.matched).toBe(true);
  });
});
