/**
 * Factory media decision table (JOV-7250, Factory P0-F).
 *
 * `decideMedium` is a pure function: given a section's job, its registry
 * family, the page audience, the evidence actually available, and its fold
 * position, it returns the medium, the approved media recipe that renders it
 * (when one applies), a rationale, and a full trace of the rules evaluated.
 *
 * The medium enum extends `VariantMedia` (./../sections) — it adds the
 * render-time mediums the Variant axis does not carry: `product-shot`,
 * `lottie`, `photo`, `callout`, `table`. `factoryMediumToVariantMedia` maps
 * back onto the composition contract.
 *
 * Sourcing order for realized assets is fixed and recorded on every decision:
 * screenshot registry → new capture scenario → Pen ref → generation.
 * Generation is last and only reachable when the caller declares
 * `generationAllowed` — this module never implies paid-model spend on its own
 * (JOV-6232).
 */

import type { MarketingMediaRecipeId } from '../mediaRecipes';
import type { MarketingAudience, VariantMedia } from '../sections';

export const FACTORY_MEDIA_DECISION_SCHEMA = 'jovie-factory-media-decision/v1';

export const FACTORY_MEDIUMS = [
  'product-shot',
  'phone',
  'video',
  'lottie',
  'illustration',
  'photo',
  'callout',
  'table',
  'code',
  'none',
] as const;

export type FactoryMedium = (typeof FACTORY_MEDIUMS)[number];

/**
 * The jobs a section can be doing when the factory asks for media. Distinct
 * from `MarketingSectionId` — several sections share a job (stats and
 * monetization are both 'number' jobs).
 */
export const FACTORY_SECTION_JOBS = [
  'hero',
  'proof',
  'feature',
  'number',
  'comparison',
  'concept',
  'steps',
  'identity',
  'person',
  'other',
] as const;

export type FactorySectionJob = (typeof FACTORY_SECTION_JOBS)[number];

/**
 * Registry family of the section instance. `creator` and `mobile` families
 * get phone-framed hero media; everything else gets the desktop product shot.
 */
export const FACTORY_SECTION_FAMILIES = [
  'hero',
  'logo-proof',
  'feature',
  'spec-grid',
  'testimonial',
  'faq',
  'footer-cta',
  'nav',
  'creator',
  'mobile',
] as const;

export type FactorySectionFamily = (typeof FACTORY_SECTION_FAMILIES)[number];

/** MarketingAudience plus the developer audience (docs/CLI surfaces). */
export type FactoryMediaAudience = MarketingAudience | 'developer';

export type FactoryFold = 'above' | 'below';

/**
 * Evidence actually available for the slot. Absence is meaningful: a false
 * field is the difference between a real asset and a degraded rung.
 */
export interface FactoryMediaEvidence {
  /** Registered screenshot-registry scenario id for this slot. */
  readonly captureScenarioId?: string;
  /** An approved demo video exists; rendered behind "watch demo", never autoplayed. */
  readonly video?: boolean;
  /** A real or licensed photo of the subject exists. */
  readonly photo?: boolean;
  /** A characterSystem virtual model id approved for this slot. */
  readonly characterModelId?: string;
  /** A Pen ref exists for the needed illustration/animation. */
  readonly penRefId?: string;
  /** Generation-adapter spend is authorized for this slot. */
  readonly generationAllowed?: boolean;
}

/** Fixed sourcing order: cheapest truthful asset wins. */
export const FACTORY_MEDIA_SOURCING_ORDER = [
  'screenshot-registry',
  'capture-scenario',
  'pen-ref',
  'generation',
] as const;

export type FactoryMediaSource =
  | (typeof FACTORY_MEDIA_SOURCING_ORDER)[number]
  | 'licensed-photo'
  | 'character-system'
  | 'native'
  | 'omitted';

export interface FactoryMediaDecisionInput {
  readonly sectionJob: FactorySectionJob;
  readonly family: FactorySectionFamily;
  readonly audience: FactoryMediaAudience;
  readonly evidence: FactoryMediaEvidence;
  readonly fold: FactoryFold;
}

export interface FactoryMediaDecisionTraceEntry {
  /** Rule id r1–r7 in evaluation order. */
  readonly rule: string;
  readonly matched: boolean;
  readonly detail: string;
}

export interface FactoryMediaDecision {
  readonly medium: FactoryMedium;
  /** Approved media recipe that renders this medium, or null when the medium has no recipe. */
  readonly recipeId: MarketingMediaRecipeId | null;
  /** Where the asset comes from under the fixed sourcing order. */
  readonly source: FactoryMediaSource;
  readonly rationale: string;
  readonly trace: readonly FactoryMediaDecisionTraceEntry[];
}

/** Families whose hero media is phone-framed (rule 1). */
const PHONE_FAMILIES: readonly FactorySectionFamily[] = ['creator', 'mobile'];

/** Approved media recipe per medium; structural mediums render without one. */
export const FACTORY_MEDIUM_RECIPES: Readonly<
  Record<FactoryMedium, MarketingMediaRecipeId | null>
> = {
  'product-shot': 'dark-glass',
  phone: 'compact-glass',
  video: 'dark-glass',
  lottie: 'flowing-accent',
  illustration: 'soft-editorial-background',
  photo: 'soft-editorial-background',
  callout: null,
  table: null,
  code: null,
  none: null,
};

/** Map the extended medium enum back onto the VariantMedia composition axis. */
export function factoryMediumToVariantMedia(
  medium: FactoryMedium
): VariantMedia {
  switch (medium) {
    case 'product-shot':
      return 'screenshot';
    case 'phone':
      return 'phone';
    case 'video':
      return 'video';
    case 'lottie':
    case 'illustration':
    case 'photo':
      return 'illustration';
    case 'code':
      return 'code';
    case 'callout':
    case 'table':
    case 'none':
      return 'none';
  }
}

interface RuleResult {
  readonly medium: FactoryMedium;
  readonly source: FactoryMediaSource;
  readonly rationale: string;
}

type Rule = (input: FactoryMediaDecisionInput) => RuleResult | null;

function visualSource(evidence: FactoryMediaEvidence): FactoryMediaSource {
  if (evidence.penRefId) return 'pen-ref';
  if (evidence.generationAllowed) return 'generation';
  return 'capture-scenario';
}

const RULES: readonly { readonly id: string; readonly run: Rule }[] = [
  {
    // 1. Hero with a capture: product shot, or phone for creator/mobile families.
    id: 'r1-hero-capture',
    run: ({ sectionJob, family, evidence }) => {
      if (sectionJob !== 'hero' || !evidence.captureScenarioId) return null;
      const medium: FactoryMedium = PHONE_FAMILIES.includes(family)
        ? 'phone'
        : 'product-shot';
      return {
        medium,
        source: 'screenshot-registry',
        rationale: `Hero with capture ${evidence.captureScenarioId} renders a ${medium} from the screenshot registry.`,
      };
    },
  },
  {
    // 2. Proof or feature job: product shot, or a video behind "watch demo".
    //    Video never autoplays.
    id: 'r2-proof-or-feature',
    run: ({ sectionJob, evidence }) => {
      if (sectionJob !== 'proof' && sectionJob !== 'feature') return null;
      if (evidence.captureScenarioId) {
        return {
          medium: 'product-shot',
          source: 'screenshot-registry',
          rationale: `${sectionJob} section takes the registered product shot ${evidence.captureScenarioId}.`,
        };
      }
      if (evidence.video) {
        return {
          medium: 'video',
          source: 'screenshot-registry',
          rationale: `${sectionJob} section uses the approved demo video behind "watch demo"; it never autoplays.`,
        };
      }
      return null;
    },
  },
  {
    // 3. Number or comparison job: table or callout.
    id: 'r3-number-or-comparison',
    run: ({ sectionJob }) => {
      if (sectionJob === 'comparison') {
        return {
          medium: 'table',
          source: 'native',
          rationale:
            'Comparison renders as a table — structured beats generated.',
        };
      }
      if (sectionJob === 'number') {
        return {
          medium: 'callout',
          source: 'native',
          rationale:
            'A number job renders as a callout — the figure is the media.',
        };
      }
      return null;
    },
  },
  {
    // 4. Abstract concept below the fold: illustration, or Lottie for steps.
    id: 'r4-concept-below-fold',
    run: ({ sectionJob, fold, evidence }) => {
      if (fold !== 'below') return null;
      if (sectionJob === 'steps') {
        return {
          medium: 'lottie',
          source: visualSource(evidence),
          rationale: 'A steps explanation below the fold animates as Lottie.',
        };
      }
      if (sectionJob === 'concept') {
        return {
          medium: 'illustration',
          source: visualSource(evidence),
          rationale: 'An abstract concept below the fold gets an illustration.',
        };
      }
      return null;
    },
  },
  {
    // 5. Identity or person job: a real or licensed photo, or a
    //    characterSystem virtual model. Never stock — when no verified
    //    imagery exists the slot omits media rather than degrade to stock.
    id: 'r5-identity-or-person',
    run: ({ sectionJob, evidence }) => {
      if (sectionJob !== 'identity' && sectionJob !== 'person') return null;
      if (evidence.photo) {
        return {
          medium: 'photo',
          source: 'licensed-photo',
          rationale:
            'Identity renders a real or licensed photo of the subject.',
        };
      }
      if (evidence.characterModelId) {
        return {
          medium: 'photo',
          source: 'character-system',
          rationale: `Identity renders characterSystem model ${evidence.characterModelId}.`,
        };
      }
      return {
        medium: 'none',
        source: 'omitted',
        rationale:
          'No real, licensed, or character-system imagery exists; stock is never substituted, so media is omitted.',
      };
    },
  },
  {
    // 6. Developer audience: code.
    id: 'r6-developer-audience',
    run: ({ audience }) =>
      audience === 'developer'
        ? {
            medium: 'code',
            source: 'native',
            rationale:
              'Developer audiences get a real code sample, not a picture of the product.',
          }
        : null,
  },
  {
    // 7. Otherwise: the degradation ladder — product shot if a capture
    //    exists, illustration if a Pen ref or authorized generation exists,
    //    else omit.
    id: 'r7-degradation-ladder',
    run: ({ evidence }) => {
      if (evidence.captureScenarioId) {
        return {
          medium: 'product-shot',
          source: 'screenshot-registry',
          rationale: 'Degradation ladder rung 1: registered product capture.',
        };
      }
      if (evidence.penRefId || evidence.generationAllowed) {
        return {
          medium: 'illustration',
          source: evidence.penRefId ? 'pen-ref' : 'generation',
          rationale:
            'Degradation ladder: illustration from a Pen ref, or generation when authorized.',
        };
      }
      return {
        medium: 'none',
        source: 'omitted',
        rationale: 'Degradation ladder bottom: no truthful asset, omit media.',
      };
    },
  },
];

export function decideMedium(
  input: FactoryMediaDecisionInput
): FactoryMediaDecision {
  const trace: FactoryMediaDecisionTraceEntry[] = [];

  for (const { id, run } of RULES) {
    const result = run(input);
    trace.push({
      rule: id,
      matched: result !== null,
      detail: result?.rationale ?? 'no match',
    });
    if (result) {
      return {
        medium: result.medium,
        recipeId: FACTORY_MEDIUM_RECIPES[result.medium],
        source: result.source,
        rationale: result.rationale,
        trace,
      };
    }
  }

  // r7 always matches, so this is unreachable — kept as a typed guard.
  return {
    medium: 'none',
    recipeId: null,
    source: 'omitted',
    rationale: 'Degradation ladder bottom: no truthful asset, omit media.',
    trace,
  };
}
