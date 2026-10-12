import { describe, expect, it } from 'vitest';
import { JOVIE_MARKETING_CHARACTER_SYSTEM } from '../characterSystem';
import { MarketingBriefSchema } from '../composition';
import {
  isApprovedMarketingMediaRecipeId,
  MARKETING_MEDIA_RECIPE_SOURCE_MATRIX,
} from '../mediaRecipes';
import { MARKETING_SECTION_IDS } from '../sections';
import {
  decideMedium,
  FACTORY_MEDIA_AUDIENCES,
  FACTORY_MEDIA_JOB_BY_SECTION_ID,
  FACTORY_MEDIA_RULE_IDS,
  FACTORY_MEDIA_SECTION_JOBS,
  FACTORY_MEDIUM_RECIPES,
  FACTORY_MEDIUM_TO_VARIANT_MEDIA,
  type FactoryMediaDecisionInput,
  type FactoryMediaEvidence,
  type FactoryMediaSourcingContext,
  isEligibleVirtualModel,
  resolveMediaSourcing,
  toFactoryMediaPlanSection,
} from './mediaDecision';
import { FACTORY_MEDIA_KINDS, FACTORY_STAGE_ARTIFACT_SCHEMAS } from './spine';

const base: FactoryMediaDecisionInput = {
  sectionJob: 'feature',
  family: 'feature',
  audience: 'artist',
  evidence: {},
  fold: 'below',
};

const input = (
  overrides: Partial<FactoryMediaDecisionInput>
): FactoryMediaDecisionInput => ({ ...base, ...overrides });

const eligible = JOVIE_MARKETING_CHARACTER_SYSTEM.boardDecisions.find(
  decision => decision.campaignEligibility === 'eligible'
)?.id;
const blocked = JOVIE_MARKETING_CHARACTER_SYSTEM.boardDecisions.find(
  decision => decision.campaignEligibility !== 'eligible'
)?.id;

const sourcing: FactoryMediaSourcingContext = {
  isRegisteredCapture: id => id === 'profile-phone',
  isCertifiedPenRef: id => id === 'pen-certified',
};

describe('factory media decision table', () => {
  it('locks the decision table', () => {
    const rows: [string, FactoryMediaDecisionInput][] = [
      [
        'hero + capture',
        input({ sectionJob: 'hero', evidence: { captureScenario: 'crm' } }),
      ],
      [
        'hero + capture, artist-lp',
        input({
          sectionJob: 'hero',
          family: 'artist-lp',
          evidence: { captureScenario: 'profile-phone' },
        }),
      ],
      [
        'hero + capture, fan',
        input({
          sectionJob: 'hero',
          audience: 'fan',
          evidence: { captureScenario: 'profile-phone' },
        }),
      ],
      ['hero, no capture', input({ sectionJob: 'hero', fold: 'above' })],
      [
        'hero, no capture, developer',
        input({ sectionJob: 'hero', audience: 'developer', fold: 'above' }),
      ],
      ['feature + capture', input({ evidence: { captureScenario: 'crm' } })],
      [
        'proof + demo',
        input({
          sectionJob: 'proof',
          evidence: { liveDemo: { id: 'demo-1' } },
        }),
      ],
      ['feature, nothing', input({})],
      ['number', input({ sectionJob: 'number' })],
      ['comparison', input({ sectionJob: 'comparison' })],
      ['abstract below', input({ sectionJob: 'abstract' })],
      ['abstract above', input({ sectionJob: 'abstract', fold: 'above' })],
      ['steps below', input({ sectionJob: 'steps' })],
      [
        'person + licensed photo',
        input({
          sectionJob: 'person',
          evidence: {
            realPhoto: { id: 'p1', rights: 'licensed', credit: 'Photog' },
          },
        }),
      ],
      [
        'identity + virtual model',
        input({ sectionJob: 'identity', evidence: { virtualModel: eligible } }),
      ],
      [
        'person + stock photo',
        input({
          sectionJob: 'person',
          evidence: { realPhoto: { id: 's1', rights: 'stock', credit: 'X' } },
        }),
      ],
      ['faq, developer', input({ sectionJob: 'faq', audience: 'developer' })],
      ['cta', input({ sectionJob: 'cta' })],
      [
        'prose + capture',
        input({ sectionJob: 'prose', evidence: { captureScenario: 'crm' } }),
      ],
    ];
    const table = rows.map(([label, row]) => {
      const decision = decideMedium(row);
      return `${label} -> ${decision.medium} / ${decision.recipeId ?? '-'} / ${decision.rule}`;
    });
    expect(table).toMatchInlineSnapshot(`
      [
        "hero + capture -> product-shot / dark-glass / hero-capture",
        "hero + capture, artist-lp -> phone / compact-glass / hero-capture",
        "hero + capture, fan -> phone / compact-glass / hero-capture",
        "hero, no capture -> none / - / degradation-ladder",
        "hero, no capture, developer -> code / - / developer-code",
        "feature + capture -> product-shot / dark-glass / proof-feature",
        "proof + demo -> video / dark-glass / proof-feature",
        "feature, nothing -> none / - / degradation-ladder",
        "number -> callout / compact-glass / number-comparison",
        "comparison -> table / - / number-comparison",
        "abstract below -> illustration / soft-editorial-background / abstract-below-fold",
        "abstract above -> none / - / degradation-ladder",
        "steps below -> lottie / flowing-accent / abstract-below-fold",
        "person + licensed photo -> photo / soft-editorial-background / identity-person",
        "identity + virtual model -> photo / soft-editorial-background / identity-person",
        "person + stock photo -> none / - / degradation-ladder",
        "faq, developer -> code / - / developer-code",
        "cta -> none / - / degradation-ladder",
        "prose + capture -> product-shot / dark-glass / degradation-ladder",
      ]
    `);
  });

  it('only emits spine media kinds and resolvable recipes', () => {
    expect(Object.keys(FACTORY_MEDIUM_RECIPES).sort()).toEqual(
      [...FACTORY_MEDIA_KINDS].sort()
    );
    expect(Object.keys(FACTORY_MEDIUM_TO_VARIANT_MEDIA).sort()).toEqual(
      [...FACTORY_MEDIA_KINDS].sort()
    );
    for (const recipeId of Object.values(FACTORY_MEDIUM_RECIPES)) {
      if (recipeId !== null) {
        expect(isApprovedMarketingMediaRecipeId(recipeId)).toBe(true);
      }
    }
    expect(FACTORY_MEDIUM_RECIPES.table).toBeNull();
    expect(FACTORY_MEDIUM_RECIPES.code).toBeNull();
    expect(FACTORY_MEDIUM_RECIPES.none).toBeNull();
  });

  it('keeps audiences a superset of the brief and jobs complete per section', () => {
    for (const audience of MarketingBriefSchema.shape.targetAudience.options) {
      expect(FACTORY_MEDIA_AUDIENCES).toContain(audience);
    }
    expect(Object.keys(FACTORY_MEDIA_JOB_BY_SECTION_ID).sort()).toEqual(
      [...MARKETING_SECTION_IDS].sort()
    );
    for (const job of Object.values(FACTORY_MEDIA_JOB_BY_SECTION_ID)) {
      expect(FACTORY_MEDIA_SECTION_JOBS).toContain(job);
    }
  });

  it('rejects inputs outside the schema', () => {
    expect(() =>
      decideMedium({ ...base, sectionJob: 'bogus' as 'hero' })
    ).toThrow();
    expect(() => decideMedium({ ...base, fold: 'side' as 'above' })).toThrow();
  });
});

describe('each rule', () => {
  it('rule 1: hero with a capture is a product shot, or a phone when mobile-first', () => {
    const shot = decideMedium(
      input({ sectionJob: 'hero', evidence: { captureScenario: 'crm' } })
    );
    expect(shot).toMatchObject({
      medium: 'product-shot',
      recipeId: 'dark-glass',
      rule: 'hero-capture',
    });
    expect(shot.trace).toEqual([
      expect.objectContaining({ rule: 'hero-capture', outcome: 'matched' }),
    ]);
    const phone = decideMedium(
      input({
        sectionJob: 'hero',
        family: 'artist-lp',
        evidence: { captureScenario: 'profile-phone' },
      })
    );
    expect(phone).toMatchObject({ medium: 'phone', recipeId: 'compact-glass' });
  });

  it('rule 2: proof or feature uses the capture, else click-to-play video, never autoplay', () => {
    const video = decideMedium(
      input({ sectionJob: 'proof', evidence: { liveDemo: { id: 'demo' } } })
    );
    expect(video).toMatchObject({
      medium: 'video',
      playback: 'click-to-play',
      rule: 'proof-feature',
    });
    expect(JSON.stringify(video)).not.toMatch(/autoplay/i);
    const both = decideMedium(
      input({
        evidence: { captureScenario: 'crm', liveDemo: { id: 'demo' } },
      })
    );
    expect(both.medium).toBe('product-shot');
    expect(both.playback).toBeNull();
  });

  it('rule 3: numbers are callouts and comparisons are tables', () => {
    expect(decideMedium(input({ sectionJob: 'number' })).medium).toBe(
      'callout'
    );
    expect(decideMedium(input({ sectionJob: 'comparison' })).medium).toBe(
      'table'
    );
  });

  it('rule 4: abstract below the fold is illustration, steps are lottie, above falls through', () => {
    expect(decideMedium(input({ sectionJob: 'abstract' }))).toMatchObject({
      medium: 'illustration',
      recipeId: 'soft-editorial-background',
    });
    expect(decideMedium(input({ sectionJob: 'steps' }))).toMatchObject({
      medium: 'lottie',
      recipeId: 'flowing-accent',
    });
    const above = decideMedium(input({ sectionJob: 'steps', fold: 'above' }));
    expect(above.rule).toBe('degradation-ladder');
    expect(above.trace).toContainEqual(
      expect.objectContaining({
        rule: 'abstract-below-fold',
        outcome: 'skipped',
      })
    );
  });

  it('rule 5: people use an owned or licensed photo, or an eligible virtual model', () => {
    const owned = decideMedium(
      input({
        sectionJob: 'identity',
        evidence: { realPhoto: { id: 'p', rights: 'owned', credit: 'Tim' } },
      })
    );
    expect(owned).toMatchObject({
      medium: 'photo',
      photoSource: 'real-photo',
      characterId: null,
    });
    expect(eligible).toBeDefined();
    const model = decideMedium(
      input({ sectionJob: 'person', evidence: { virtualModel: eligible } })
    );
    expect(model).toMatchObject({
      medium: 'photo',
      photoSource: 'virtual-model',
      characterId: eligible,
    });
  });

  it('rule 6: developer audiences get code', () => {
    expect(
      decideMedium(input({ sectionJob: 'cta', audience: 'developer' }))
    ).toMatchObject({ medium: 'code', recipeId: null, rule: 'developer-code' });
  });

  it('rule 7: the ladder takes a capture when one exists, then ends at none', () => {
    expect(
      decideMedium(
        input({ sectionJob: 'prose', evidence: { captureScenario: 'crm' } })
      )
    ).toMatchObject({ medium: 'product-shot', rule: 'degradation-ladder' });
    const none = decideMedium(input({ sectionJob: 'faq' }));
    expect(none).toMatchObject({ medium: 'none', recipeId: null });
    expect(none.trace.map(entry => entry.rule)).toEqual([
      ...FACTORY_MEDIA_RULE_IDS,
    ]);
  });

  it('is deterministic', () => {
    const row = input({
      sectionJob: 'person',
      evidence: { virtualModel: eligible },
    });
    expect(decideMedium(row)).toEqual(decideMedium(row));
  });
});

describe('never stock', () => {
  it('refuses a stock photo even when it is the only person evidence', () => {
    const decision = decideMedium(
      input({
        sectionJob: 'person',
        evidence: {
          realPhoto: { id: 'stock-1', rights: 'stock', credit: 'X' },
        },
      })
    );
    expect(decision.medium).toBe('none');
    expect(decision.photoSource).toBeNull();
    expect(decision.trace).toContainEqual({
      rule: 'identity-person',
      outcome: 'skipped',
      note: 'stock photo stock-1 refused; never stock',
    });
  });

  it('falls back from stock to an eligible virtual model', () => {
    const decision = decideMedium(
      input({
        sectionJob: 'person',
        evidence: {
          realPhoto: { id: 'stock-1', rights: 'stock', credit: 'X' },
          virtualModel: eligible,
        },
      })
    );
    expect(decision).toMatchObject({
      photoSource: 'virtual-model',
      characterId: eligible,
    });
  });

  it('refuses a virtual model that is not campaign-eligible', () => {
    expect(blocked).toBeDefined();
    expect(isEligibleVirtualModel(String(blocked))).toBe(false);
    expect(isEligibleVirtualModel('C99')).toBe(false);
    const decision = decideMedium(
      input({ sectionJob: 'person', evidence: { virtualModel: blocked } })
    );
    expect(decision.medium).toBe('none');
    expect(decision.trace).toContainEqual(
      expect.objectContaining({
        rule: 'identity-person',
        note: `virtual model ${blocked} is not campaign-eligible; never stock`,
      })
    );
  });

  it('honours an injected roster', () => {
    const decision = decideMedium(
      input({ sectionJob: 'person', evidence: { virtualModel: 'Z1' } }),
      {
        characterSystem: {
          models: [
            {
              ...JOVIE_MARKETING_CHARACTER_SYSTEM.models[0],
              id: 'Z1',
            },
          ],
          boardDecisions: [
            {
              ...JOVIE_MARKETING_CHARACTER_SYSTEM.boardDecisions[0],
              id: 'Z1',
              campaignEligibility: 'eligible',
            },
          ],
        },
      }
    );
    expect(decision.characterId).toBe('Z1');
  });
});

describe('sourcing order', () => {
  const source = (
    row: Partial<FactoryMediaDecisionInput>,
    evidence: FactoryMediaEvidence = row.evidence ?? {}
  ) => resolveMediaSourcing(decideMedium(input(row)), evidence, sourcing);

  it('1: uses an existing registry capture first', () => {
    expect(
      source({
        sectionJob: 'hero',
        evidence: { captureScenario: 'profile-phone' },
      })
    ).toEqual({ kind: 'registry-capture', scenarioId: 'profile-phone' });
    expect(
      source({
        sectionJob: 'proof',
        evidence: { liveDemo: { id: 'd', posterScenario: 'profile-phone' } },
      })
    ).toEqual({ kind: 'registry-capture', scenarioId: 'profile-phone' });
  });

  it('2: requests a new capture scenario and never generates product UI', () => {
    expect(
      source({
        sectionJob: 'hero',
        evidence: { captureScenario: 'new-aha', penRef: 'pen-certified' },
      })
    ).toMatchObject({ kind: 'capture-request', scenarioId: 'new-aha' });
    expect(
      source({ sectionJob: 'proof', evidence: { liveDemo: { id: 'd' } } })
    ).toMatchObject({ kind: 'capture-request', scenarioId: null });
  });

  it('3: uses a certified Pen ref before generating', () => {
    expect(
      source({ sectionJob: 'abstract', evidence: { penRef: 'pen-certified' } })
    ).toEqual({ kind: 'pen-ref', penRef: 'pen-certified' });
  });

  it('4: generates only with provenance and the art evaluator', () => {
    expect(
      source({ sectionJob: 'steps', evidence: { penRef: 'uncertified' } })
    ).toEqual({
      kind: 'generation',
      modality: 'lottie',
      recipeId: 'flowing-accent',
      characterId: null,
      requires: ['provenance', 'art-evaluator'],
    });
    const person = source({
      sectionJob: 'person',
      evidence: { virtualModel: eligible, penRef: 'pen-certified' },
    });
    expect(person).toMatchObject({
      kind: 'generation',
      modality: 'image',
      characterId: eligible,
    });
    if (person.kind === 'generation') {
      expect(MARKETING_MEDIA_RECIPE_SOURCE_MATRIX[person.recipeId]).toContain(
        'generated-artwork'
      );
    }
  });

  it('keeps rights-cleared photos and text-native media out of generation', () => {
    expect(
      source({
        sectionJob: 'person',
        evidence: { realPhoto: { id: 'p', rights: 'licensed', credit: 'C' } },
      })
    ).toEqual({
      kind: 'rights-cleared-photo',
      photoId: 'p',
      rights: 'licensed',
      credit: 'C',
    });
    expect(source({ sectionJob: 'comparison' }).kind).toBe('text-native');
    expect(source({ sectionJob: 'faq' }).kind).toBe('text-native');
  });

  it('throws when a medium has no generation-capable recipe', () => {
    const decision = {
      ...decideMedium(input({ sectionJob: 'abstract' })),
      recipeId: 'dark-glass' as const,
    };
    expect(() => resolveMediaSourcing(decision, {}, sourcing)).toThrow(
      /no generation-capable recipe/
    );
  });
});

describe('spine artifact', () => {
  it('produces a valid media-decision stage artifact', () => {
    const plan = {
      pageId: 'page-1',
      sections: [
        toFactoryMediaPlanSection(
          'hero-1',
          decideMedium(
            input({ sectionJob: 'hero', evidence: { captureScenario: 'crm' } })
          )
        ),
        toFactoryMediaPlanSection(
          'faq-1',
          decideMedium(input({ sectionJob: 'faq', audience: 'developer' }))
        ),
      ],
    };
    const parsed =
      FACTORY_STAGE_ARTIFACT_SCHEMAS['media-decision'].safeParse(plan);
    expect(parsed.success).toBe(true);
    expect(plan.sections[1]).toMatchObject({
      medium: 'code',
      decision: 'deterministic',
    });
  });
});

describe('shared editorial authoring in the existing media plan', () => {
  const editorial = {
    benefit: 'Find the next release action',
    focalDetail: 'One release inspector action',
    rationale: 'A focused captured action explains the benefit',
    fallback: 'Keep the authored benefit without media',
    alternatives: [
      {
        medium: 'video' as const,
        reason: 'Motion adds no explanation to this action',
      },
    ],
  };
  it('carries benefit, focus, alternatives and fallback through the executed decision seam', () => {
    const decision = decideMedium(
      input({ editorial, evidence: { captureScenario: 'release-action' } })
    );
    const section = toFactoryMediaPlanSection('feature-main', decision);
    expect(section).toMatchObject({
      editorialStatus: 'authored',
      editorial,
      medium: 'product-shot',
    });
    expect(
      FACTORY_STAGE_ARTIFACT_SCHEMAS['media-decision'].parse({
        pageId: 'test',
        sections: [section],
      }).sections[0]?.editorial
    ).toEqual(editorial);
  });
  it('keeps old briefs compatible but explicitly unqualified for editorial rationale', () => {
    expect(
      toFactoryMediaPlanSection('feature-main', decideMedium(input({})))
    ).toMatchObject({ editorialStatus: 'legacy-unqualified' });
  });
  it('rejects empty focus or missing alternative rationale instead of qualifying it', () => {
    expect(() =>
      decideMedium(input({ editorial: { ...editorial, focalDetail: '' } }))
    ).toThrow();
    expect(() =>
      decideMedium(input({ editorial: { ...editorial, alternatives: [] } }))
    ).toThrow();
  });
});
